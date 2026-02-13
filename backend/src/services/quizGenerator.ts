import OpenAI from "openai";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai/error";
import { Quiz as QuizSchema } from "../schemas/analyze.js";
import type { DocumentType, Quiz } from "../schemas/analyze.js";
import {
  ContractValidationError,
  validateQuizAgainstDocument,
} from "./outputValidator.js";
import type { FileType } from "../store/memoryStore.js";

const DEFAULT_OPENAI_TIMEOUT_MS = 30000;
const DEFAULT_OPENAI_MAX_RETRIES = 2;

function readEnvInt(name: string, defaultValue: number, minValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return defaultValue;
  }

  return Math.floor(parsed);
}

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

function buildCitationRequirements(metadata: QuizGenerationMetadata): string {
  if (metadata.fileType === "PDF") {
    const maxPage = Math.max(1, metadata.pageCount);
    return `Citation requirements for this document:
- Document file type is PDF.
- Use only PDF citations: { "source_type": "pdf", "page": number, "excerpt": string }.
- "page" MUST be an integer between 1 and ${maxPage}.
- NEVER use DOCX citation fields (anchor_type, paragraph).`;
  }

  const maxParagraph = Math.max(1, metadata.paragraphCount ?? 1);
  return `Citation requirements for this document:
- Document file type is DOCX.
- Use only DOCX citations: { "source_type": "docx", "anchor_type": "paragraph", "paragraph": number, "excerpt": string }.
- "paragraph" MUST be an integer between 1 and ${maxParagraph}.
- NEVER use PDF citation fields (page).`;
}

function buildRepairHint(error: unknown): string {
  if (!(error instanceof ContractValidationError)) {
    return "";
  }

  const details = error.details ? JSON.stringify(error.details) : "{}";
  return `The previous output was rejected.
Error code: ${error.code}
Error message: ${error.message}
Validation details: ${details}

Regenerate the entire JSON and fix these issues exactly.`;
}

function normalizeUpstreamError(error: unknown): unknown {
  if (error instanceof ContractValidationError) {
    return error;
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new ContractValidationError(
      "GENERATION_FAILED",
      "OpenAI request timed out."
    );
  }

  if (error instanceof APIConnectionError) {
    return new ContractValidationError(
      "GENERATION_FAILED",
      "OpenAI service is temporarily unavailable."
    );
  }

  if (error instanceof RateLimitError) {
    return new ContractValidationError(
      "GENERATION_FAILED",
      "OpenAI rate limit reached. Retry generation."
    );
  }

  if (error instanceof APIError) {
    return new ContractValidationError(
      "GENERATION_FAILED",
      error.status && error.status >= 500
        ? "OpenAI service error. Retry generation."
        : "OpenAI request failed."
    );
  }

  return error;
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
  let lastError: unknown = null;
  let repairHint = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
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
        temperature: 0.2,
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

      return result;
    } catch (error) {
      const normalizedError = normalizeUpstreamError(error);
      lastError = normalizedError;
      if (attempt < 3) {
        repairHint = buildRepairHint(normalizedError);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ContractValidationError(
        "SCHEMA_VALIDATION_FAILED",
        "Quiz output failed validation after retries."
      );
}
