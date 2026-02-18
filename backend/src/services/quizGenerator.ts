import OpenAI from "openai";
import { Quiz as QuizSchema } from "../schemas/analyze.js";
import type { DocumentType, Quiz } from "../schemas/analyze.js";
import {
  ContractValidationError,
  validateQuizAgainstDocument,
} from "./outputValidator.js";
import type { FileType } from "../store/memoryStore.js";
import { logger } from "../lib/logger.js";
import { readEnvInt } from "../lib/env.js";
import {
  classifyGenerationError,
  computeTransientBackoffMs,
  getGenerationPolicy,
  selectModelForAttempt,
  sleepMs,
} from "./generationReliability.js";
import {
  buildCitationRequirements,
  buildRepairHint,
  normalizeUpstreamError,
} from "./generationServiceUtils.js";

const DEFAULT_OPENAI_TIMEOUT_MS = 30000;
const DEFAULT_OPENAI_MAX_RETRIES = 2;

function getOpenAiTimeoutMs(): number {
  return readEnvInt("OPENAI_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS, 1000);
}

function getOpenAiMaxRetries(): number {
  return readEnvInt("OPENAI_MAX_RETRIES", DEFAULT_OPENAI_MAX_RETRIES, 0);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: getOpenAiTimeoutMs(),
  maxRetries: getOpenAiMaxRetries(),
});

interface QuizGenerationMetadata {
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
}

const QUIZ_PROMPT_BASE = `You are LearnEase, an educational assistant that creates comprehension-only quiz questions from lecture documents.

RULES:
- Lecture-only and user-triggered.
- Return ONLY a valid JSON object.
- Every answer must be directly supported by supporting_quote and citations.
- supporting_quote and citation.excerpt must be verbatim text from the lecture.
- No reasoning/synthesis questions.
- No "why", "infer", or multi-step questions.
- No grading, analytics, or scoring.
- Do not fabricate citations or page/paragraph references.
- Return JSON only. No markdown or extra text.`;

function buildQuizPrompt(metadata: QuizGenerationMetadata): string {
  if (metadata.fileType === "PDF") {
    return `${QUIZ_PROMPT_BASE}

Return JSON in this shape:
{
  "document_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "supporting_quote": "verbatim text from the lecture",
      "citations": [
        { "source_type": "pdf", "page": 1, "excerpt": "verbatim excerpt" }
      ]
    }
  ]
}`;
  }

  return `${QUIZ_PROMPT_BASE}

Return JSON in this shape:
{
  "document_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "supporting_quote": "verbatim text from the lecture",
      "citations": [
        { "source_type": "docx", "anchor_type": "paragraph", "paragraph": 1, "excerpt": "verbatim excerpt" }
      ]
    }
  ]
}`;
}

export async function generateQuiz(
  documentId: string,
  text: string,
  documentType: DocumentType,
  metadata: QuizGenerationMetadata
): Promise<Quiz> {
  if (documentType !== "LECTURE") {
    throw new ContractValidationError(
      "DOCUMENT_NOT_LECTURE",
      "Quiz generation is lecture-only.",
      { document_type: documentType }
    );
  }

  const citationRequirements = buildCitationRequirements(metadata);
  const quizPrompt = buildQuizPrompt(metadata);
  const generationPolicy = getGenerationPolicy();
  let lastError: unknown = null;
  let repairHint = "";
  let previousFailureBucket: "transient" | "repairable" | "terminal" | null = null;

  for (let attempt = 1; attempt <= generationPolicy.maxAttempts; attempt += 1) {
    const model = selectModelForAttempt(generationPolicy, attempt, previousFailureBucket);
    const startedAt = Date.now();
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: [quizPrompt, citationRequirements, repairHint].filter(Boolean).join("\n\n"),
          },
          {
            role: "user",
            content:
              `Document ID: ${documentId}\n` +
              `Document file type: ${metadata.fileType}\n\n` +
              `Lecture text:\n${text}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      let parsed: unknown;
      try {
        parsed = JSON.parse(content) as unknown;
      } catch (error) {
        throw new ContractValidationError(
          "SCHEMA_VALIDATION_FAILED",
          "Model output was not valid JSON.",
          { reason: error instanceof Error ? error.message : "unknown" }
        );
      }

      const validated = QuizSchema.safeParse(parsed);
      if (!validated.success) {
        throw new ContractValidationError(
          "SCHEMA_VALIDATION_FAILED",
          "Model output did not match Quiz schema.",
          { issues: validated.error.issues }
        );
      }

      const result: Quiz = {
        ...validated.data,
        document_id: documentId,
      };

      validateQuizAgainstDocument(
        result,
        {
          text,
          fileType: metadata.fileType,
          pageCount: metadata.pageCount,
          paragraphCount: metadata.paragraphCount,
        },
        documentType
      );

      logger.info("Quiz generation attempt succeeded", {
        attempt,
        maxAttempts: generationPolicy.maxAttempts,
        model,
        durationMs: Date.now() - startedAt,
      });

      return result;
    } catch (error) {
      const normalizedError = normalizeUpstreamError(error);
      const failureBucket = classifyGenerationError(error, normalizedError);
      const contractCode =
        normalizedError instanceof ContractValidationError ? normalizedError.code : null;
      const durationMs = Date.now() - startedAt;

      logger.warn("Quiz generation attempt failed", {
        attempt,
        maxAttempts: generationPolicy.maxAttempts,
        model,
        failureBucket,
        errorCode: contractCode,
        durationMs,
        error: normalizedError,
      });

      lastError = normalizedError;
      previousFailureBucket = failureBucket;

      if (attempt >= generationPolicy.maxAttempts || failureBucket === "terminal") {
        break;
      }

      if (failureBucket === "repairable") {
        repairHint = buildRepairHint(normalizedError);
        continue;
      }

      const backoffMs = computeTransientBackoffMs(attempt, generationPolicy);
      await sleepMs(backoffMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ContractValidationError(
        "SCHEMA_VALIDATION_FAILED",
        "Quiz output failed validation after retries."
      );
}
