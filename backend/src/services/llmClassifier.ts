import OpenAI from "openai";
import type { DocumentType } from "../schemas/analyze.js";
import { logger } from "../lib/logger.js";
import { detectDocumentType } from "./documentDetector.js";
import type { DetectionResult } from "./documentDetector.js";
import { readEnvInt } from "../lib/env.js";
import {
  classifyGenerationError,
  withOpenAiConcurrency,
} from "./generationReliability.js";
import { normalizeUpstreamError } from "./generationServiceUtils.js";

const DEFAULT_CLASSIFIER_TIMEOUT_MS = 30000;
// Default 0: route-level retry handles failures; SDK retries would multiply tail latency.
const DEFAULT_CLASSIFIER_MAX_RETRIES = 0;

function getClassifierTimeoutMs(): number {
  return readEnvInt("LLM_CLASSIFIER_TIMEOUT_MS", DEFAULT_CLASSIFIER_TIMEOUT_MS, 1000);
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: getClassifierTimeoutMs(),
      maxRetries: DEFAULT_CLASSIFIER_MAX_RETRIES,
    });
  }
  return _client;
}

const CLASSIFIER_PROMPT = `You are a document type classifier for an educational platform.

Classify the document into exactly ONE of these categories:
- HOMEWORK: A graded assignment, problem set, or homework that students must complete and submit.
- LECTURE: Lecture notes, slides, class notes, or instructional material for a class session.
- UNSUPPORTED: Any document that does not fit the above categories, including but not limited to: syllabi, course schedules, project reports, research papers, lab reports, case studies, theses, dissertations, personal essays, technical reports, journal articles, resumes, portfolios, cover letters, letters of recommendation, invoices, academic transcripts, or any non-academic document.

IMPORTANT: Classify based on the document's PRIMARY PURPOSE, not incidental keywords.
For example:
- A project report that mentions "submit by due date" is still UNSUPPORTED (it is a report, not a homework assignment).
- A lecture about "case study analysis" is still LECTURE (it is instructional material).
- A homework that asks students to "write a thesis statement" is still HOMEWORK (the thesis statement is the task, not the document type).

Respond with ONLY the category name, nothing else.`;

const CLASSIFIER_MODEL = "gpt-4o-mini";

function isLocalFallbackEnabled(): boolean {
  const configured = process.env.LLM_CLASSIFIER_ALLOW_LOCAL_FALLBACK?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

function canFallbackToLocalDetection(
  error: unknown,
  localDetection: DetectionResult
): boolean {
  if (!isLocalFallbackEnabled()) {
    return false;
  }

  if (localDetection.documentType === "UNSUPPORTED") {
    return false;
  }

  const normalizedError = normalizeUpstreamError(error);
  return classifyGenerationError(error, normalizedError) === "transient";
}

export interface LlmClassificationResult {
  /** The LLM-determined document type. */
  llmDocumentType: DocumentType;
  /** The local keyword-based detection result for logging/comparison. */
  localDetection: DetectionResult;
  /** Whether the two classifiers disagreed. */
  disagreement: boolean;
  /** Whether the LLM classifier was bypassed after a transient upstream failure. */
  usedLocalFallback: boolean;
}

export async function classifyWithLlm(
  text: string,
  openAiClient: OpenAI = getClient(),
): Promise<LlmClassificationResult> {
  const localDetection = detectDocumentType(text);

  // Use a truncated version of the text for classification (first ~2000 chars).
  // This keeps the call fast and cheap while providing enough context.
  const truncated = text.slice(0, 2000);

  let response;
  let queueWaitMs = 0;
  const startedAt = Date.now();
  let openAiDurationMs = 0;
  try {
    response = await withOpenAiConcurrency(
      async () => {
        const openAiStartedAt = Date.now();
        const result = await openAiClient.chat.completions.create({
          model: CLASSIFIER_MODEL,
          messages: [
            { role: "system", content: CLASSIFIER_PROMPT },
            { role: "user", content: truncated },
          ],
          max_tokens: 10,
          temperature: 0,
        });
        openAiDurationMs = Date.now() - openAiStartedAt;
        return result;
      },
      {
        onSlotAcquired: (waitMs) => {
          queueWaitMs = waitMs;
        },
      }
    );
  } catch (error) {
    if (canFallbackToLocalDetection(error, localDetection)) {
      logger.warn("LLM classifier failed transiently; using local document type fallback", {
        error: error instanceof Error ? error.message : String(error),
        localDocumentType: localDetection.documentType,
      });
      return {
        llmDocumentType: localDetection.documentType,
        localDetection,
        disagreement: false,
        usedLocalFallback: true,
      };
    }

    // Fail closed: do not fall back to the local classifier because it is
    // known to produce false positives for out-of-scope documents. Let the
    // error propagate so the route marks generation as failed (retriable).
    logger.error("LLM classifier call failed, failing closed", {
      error: error instanceof Error ? error.message : String(error),
      localDocumentType: localDetection.documentType,
    });
    throw error;
  }

  const raw = (response.choices[0]?.message?.content ?? "").trim().toUpperCase();

  let llmDocumentType: DocumentType;
  if (raw === "HOMEWORK" || raw === "LECTURE" || raw === "UNSUPPORTED") {
    llmDocumentType = raw;
  } else {
    logger.error("LLM classifier returned unexpected value, failing closed", {
      raw,
      localDocumentType: localDetection.documentType,
    });
    throw new Error(
      `LLM classifier returned unexpected value: ${raw}. Classification cannot proceed.`
    );
  }

  const disagreement = llmDocumentType !== localDetection.documentType;

  logger.info("Document classification result", {
    localDocumentType: localDetection.documentType,
    llmDocumentType,
    disagreement,
    queueWaitMs,
    openAiDurationMs,
    durationMs: Date.now() - startedAt,
  });

  return {
    llmDocumentType,
    localDetection,
    disagreement,
    usedLocalFallback: false,
  };
}
