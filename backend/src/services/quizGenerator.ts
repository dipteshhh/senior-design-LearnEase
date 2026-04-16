import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
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
  assertCircuitBreakerAllowsGeneration,
  classifyGenerationError,
  computeAttemptTimeoutMs,
  computeTransientBackoffMs,
  getGenerationPolicy,
  isCircuitBreakerError,
  recordGenerationOutcome,
  selectModelForAttempt,
  sleepMs,
  withOpenAiConcurrency,
} from "./generationReliability.js";
import {
  assertGenerationInputWithinLimit,
  buildCitationRequirements,
  buildRepairHint,
  normalizeUpstreamError,
} from "./generationServiceUtils.js";

const DEFAULT_OPENAI_TIMEOUT_MS = 60000;
const DEFAULT_OPENAI_MAX_RETRIES = 0;
const OPENAI_RETRY_TIMEOUT_MULTIPLIER = 1.5;
const OPENAI_RETRY_TIMEOUT_CAP_MS = 120000;

function getOpenAiTimeoutMs(): number {
  return readEnvInt("OPENAI_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS, 1000);
}

function getOpenAiMaxRetries(): number {
  // Default 0: app-level retry loop handles retries; SDK retries would multiply tail latency.
  return readEnvInt("OPENAI_MAX_RETRIES", DEFAULT_OPENAI_MAX_RETRIES, 0);
}

const openAiTimeoutMs = getOpenAiTimeoutMs();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: openAiTimeoutMs,
  maxRetries: getOpenAiMaxRetries(),
});
const QUIZ_RESPONSE_FORMAT = zodResponseFormat(QuizSchema, "lecture_quiz");

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

function getRepairFailureSignature(error: unknown): string {
  if (error instanceof ContractValidationError) {
    const issues = Array.isArray(error.details.issues)
      ? error.details.issues.map((issue) => {
          if (issue && typeof issue === "object") {
            const obj = issue as Record<string, unknown>;
            return {
              code: typeof obj.code === "string" ? obj.code : null,
              message: typeof obj.message === "string" ? obj.message : null,
              path: Array.isArray(obj.path) ? obj.path.join(".") : null,
            };
          }
          return issue;
        })
      : [];
    const details = error.details;
    return JSON.stringify({
      code: error.code,
      message: error.message,
      issues,
      path: typeof details.path === "string" ? details.path : null,
      reason: typeof details.reason === "string" ? details.reason : null,
      field: typeof details.field === "string" ? details.field : null,
      sourceType: typeof details.source_type === "string" ? details.source_type : null,
      expectedFileType:
        typeof details.expected_file_type === "string" ? details.expected_file_type : null,
      page: typeof details.page === "number" ? details.page : null,
      pageCount: typeof details.page_count === "number" ? details.page_count : null,
      paragraph: typeof details.paragraph === "number" ? details.paragraph : null,
      paragraphCount:
        typeof details.paragraph_count === "number" ? details.paragraph_count : null,
      minSections: typeof details.min_sections === "number" ? details.min_sections : null,
      actualSections:
        typeof details.actual_sections === "number" ? details.actual_sections : null,
    });
  }
  if (error instanceof Error) {
    return `${error.name}:${error.message}`;
  }
  return String(error);
}

export async function generateQuiz(
  documentId: string,
  text: string,
  documentType: DocumentType,
  metadata: QuizGenerationMetadata,
  openAiClient: OpenAI = client
): Promise<Quiz> {
  assertGenerationInputWithinLimit(text);

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
  let repeatedRepairSignature: string | null = null;
  let repeatedRepairCount = 0;

  for (let attempt = 1; attempt <= generationPolicy.maxAttempts; attempt += 1) {
    const model = selectModelForAttempt(generationPolicy, attempt, previousFailureBucket);
    const requestTimeoutMs = computeAttemptTimeoutMs(
      openAiTimeoutMs,
      attempt,
      OPENAI_RETRY_TIMEOUT_MULTIPLIER,
      OPENAI_RETRY_TIMEOUT_CAP_MS
    );
    const startedAt = Date.now();
    let queueWaitMs = 0;
    let openAiDurationMs = 0;
    let validationDurationMs = 0;
    try {
      assertCircuitBreakerAllowsGeneration();

      const response = await withOpenAiConcurrency(
        async () => {
          const openAiStartedAt = Date.now();
          const result = await openAiClient.chat.completions.create({
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
            response_format: QUIZ_RESPONSE_FORMAT,
            max_tokens: 4096,
            temperature: 0,
          }, { timeout: requestTimeoutMs });
          openAiDurationMs = Date.now() - openAiStartedAt;
          return result;
        },
        {
          onSlotAcquired: (waitMs) => {
            queueWaitMs = waitMs;
          },
        }
      );

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

      const validationStartedAt = Date.now();
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
      validationDurationMs = Date.now() - validationStartedAt;
      recordGenerationOutcome("success");
      const durationMs = Date.now() - startedAt;

      logger.info("Quiz generation attempt succeeded", {
        attempt,
        maxAttempts: generationPolicy.maxAttempts,
        model,
        timeoutMs: requestTimeoutMs,
        durationMs,
        queueWaitMs,
        openAiDurationMs,
        validationDurationMs,
      });

      return result;
    } catch (error) {
      const normalizedError = normalizeUpstreamError(error);
      const failureBucket = classifyGenerationError(error, normalizedError);
      const contractCode =
        normalizedError instanceof ContractValidationError ? normalizedError.code : null;
      const durationMs = Date.now() - startedAt;
      const blockedByCircuitBreaker = isCircuitBreakerError(normalizedError);

      if (!blockedByCircuitBreaker) {
        recordGenerationOutcome(failureBucket);
      }

      logger.warn("Quiz generation attempt failed", {
        attempt,
        maxAttempts: generationPolicy.maxAttempts,
        model,
        timeoutMs: requestTimeoutMs,
        failureBucket,
        errorCode: contractCode,
        durationMs,
        queueWaitMs,
        openAiDurationMs,
        validationDurationMs,
        error: normalizedError,
      });

      lastError = normalizedError;
      previousFailureBucket = failureBucket;

      if (blockedByCircuitBreaker) {
        break;
      }

      if (attempt >= generationPolicy.maxAttempts || failureBucket === "terminal") {
        break;
      }

      if (failureBucket === "repairable") {
        const signature = getRepairFailureSignature(normalizedError);
        if (signature === repeatedRepairSignature) {
          repeatedRepairCount += 1;
        } else {
          repeatedRepairSignature = signature;
          repeatedRepairCount = 1;
        }
        if (repeatedRepairCount >= 3) {
          logger.warn("Quiz retries short-circuited after repeated repair failure signature", {
            attempt,
            signature,
            repeatedRepairCount,
          });
          break;
        }
        repairHint = buildRepairHint(normalizedError);
        continue;
      }

      repeatedRepairSignature = null;
      repeatedRepairCount = 0;

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
