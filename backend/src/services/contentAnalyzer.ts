import OpenAI from "openai";
import type {
  DocumentType,
  StudyGuide,
} from "../schemas/analyze.js";
import { StudyGuide as StudyGuideSchema } from "../schemas/analyze.js";
import { detectDocumentType } from "./documentDetector.js";
import { shouldEnableGuidanceMode, getRestrictions } from "./guardrails.js";
import {
  ContractValidationError,
  validateStudyGuideAgainstDocument,
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

const ANALYSIS_PROMPT = `You are LearnEase, an educational assistant that helps students organize and understand their learning materials.

Your role is to EXTRACT and RESTRUCTURE content from a document - NOT to complete assignments or provide answers.

Return ONLY a JSON object with exactly these keys:
- overview
- key_actions
- checklist
- important_details
- sections

Schema requirements:
- overview: { title, document_type, summary }
- key_actions: ExtractionItem[]
- checklist: ExtractionItem[]
- important_details: { dates: ExtractionItem[], policies: ExtractionItem[], contacts: ExtractionItem[], logistics: ExtractionItem[] }
- sections: [{ id, title, content, citations }] — each section MUST include at least one citation

ExtractionItem schema:
- id: string
- label: string
- supporting_quote: an EXACT substring copied verbatim from the document text (must appear character-for-character in the input)
- citations: a JSON array with at least one citation object, e.g. [{...}]

Citations (MUST always be a JSON array, even for a single citation):
- For pdf: { source_type: "pdf", page: number, excerpt: string }
- For docx: { source_type: "docx", anchor_type: "paragraph", paragraph: number, excerpt: string }

IMPORTANT RULES:
- Do NOT solve problems or provide answers
- Do NOT write essay content or code
- Do NOT complete any part of the assignment
- Every extracted item MUST include supporting_quote and citations
- supporting_quote MUST be copied exactly from the document text — do NOT paraphrase, reword, or summarize
- citation excerpt MUST also be an exact substring from the document text

Return ONLY valid JSON, no markdown or explanation.`;

const GUIDANCE_MODE_ADDITION = `

GUIDANCE MODE IS ACTIVE - This appears to be an assignment.
- Be extra careful not to provide any answers
- Focus purely on organization and structure
- Help the student understand the requirements, not the solutions
- If there are questions to answer, list them as tasks but do NOT answer them`;

interface AnalysisMetadata {
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
}

const VALID_DOCUMENT_TYPES = new Set(["HOMEWORK", "LECTURE", "SYLLABUS"]);

/**
 * The model sometimes returns a bare citation object instead of an array,
 * or uses mixed-case document_type values. Walk the parsed JSON and fix both
 * so Zod validation succeeds.
 */
export function normalizeModelOutput(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(normalizeModelOutput);

  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "citations") {
      if (Array.isArray(value)) {
        result[key] = value.map(normalizeModelOutput);
      } else if (value !== null && typeof value === "object") {
        result[key] = [normalizeModelOutput(value)];
      } else {
        result[key] = value;
      }
    } else if (key === "document_type" && typeof value === "string") {
      const upper = value.toUpperCase();
      result[key] = VALID_DOCUMENT_TYPES.has(upper) ? upper : value;
    } else {
      result[key] = normalizeModelOutput(value);
    }
  }

  return result;
}

export async function analyzeDocument(
  text: string,
  providedDocumentType: DocumentType | undefined,
  metadata: AnalysisMetadata
): Promise<StudyGuide> {
  const detection = detectDocumentType(text);
  const documentType = providedDocumentType ?? detection.documentType;
  if (documentType === "UNSUPPORTED") {
    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      "Unsupported document type cannot be analyzed.",
      { document_type: documentType }
    );
  }

  const supportedType = documentType as "HOMEWORK" | "LECTURE" | "SYLLABUS";
  const guidanceMode = shouldEnableGuidanceMode(
    documentType,
    detection.isAssignment
  );
  const restrictions = getRestrictions(documentType, guidanceMode);

  let prompt = guidanceMode
    ? ANALYSIS_PROMPT + GUIDANCE_MODE_ADDITION
    : ANALYSIS_PROMPT;

  if (restrictions.length > 0) {
    prompt += `\n\nADDITIONAL RESTRICTIONS:\n${restrictions.map((r) => `- ${r}`).join("\n")}`;
  }

  const citationRequirements = buildCitationRequirements(metadata, {
    useMustLanguage: true,
  });
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
            content: [prompt, citationRequirements, repairHint].filter(Boolean).join("\n\n"),
          },
          {
            role: "user",
            content:
              `Document type: ${supportedType}\n` +
              `Document file type: ${metadata.fileType}\n\n` +
              `Document text:\n${text}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 8192,
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

      const normalized = normalizeModelOutput(parsed);
      const validated = StudyGuideSchema.safeParse(normalized);
      if (!validated.success) {
        throw new ContractValidationError(
          "SCHEMA_VALIDATION_FAILED",
          "Model output did not match StudyGuide schema.",
          { issues: validated.error.issues }
        );
      }

      validateStudyGuideAgainstDocument(validated.data, {
        text,
        fileType: metadata.fileType,
        pageCount: metadata.pageCount,
        paragraphCount: metadata.paragraphCount,
      });

      logger.info("Study guide generation attempt succeeded", {
        attempt,
        maxAttempts: generationPolicy.maxAttempts,
        model,
        durationMs: Date.now() - startedAt,
      });

      return validated.data satisfies StudyGuide;
    } catch (error) {
      const normalizedError = normalizeUpstreamError(error);
      const failureBucket = classifyGenerationError(error, normalizedError);
      const contractCode =
        normalizedError instanceof ContractValidationError ? normalizedError.code : null;
      const durationMs = Date.now() - startedAt;

      logger.warn("Study guide generation attempt failed", {
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
        "Model output failed validation after retries."
      );
}
