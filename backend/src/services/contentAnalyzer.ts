import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
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

const DEFAULT_OPENAI_TIMEOUT_MS = 30000;
const DEFAULT_OPENAI_MAX_RETRIES = 0;
const OPENAI_RETRY_TIMEOUT_MULTIPLIER = 1.5;
const OPENAI_RETRY_TIMEOUT_CAP_MS = 60000;

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

const ANALYSIS_PROMPT_BASE = `You are LearnEase, an educational assistant that helps students organize and understand their learning materials.

Your role is to EXTRACT and RESTRUCTURE content from a document - NOT to complete assignments or provide answers.

Return ONLY a JSON object with exactly these keys:
- overview
- key_actions
- checklist
- important_details
- sections

Schema requirements:
- overview: { title, document_type, summary, topic, due_date, estimated_time }
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

Overview metadata fields:
- topic: the main subject or course topic of the document (e.g. "Machine Learning", "Calculus II"). Set to null if not identifiable.
- due_date: the assignment or project due date as mentioned in the document (e.g. "February 28, 2026"). Set to null if no due date is found.
- estimated_time: estimated time to complete the work if mentioned in the document (e.g. "8-10 hours"). Set to null if not mentioned.

Key actions rules:
- key_actions MUST NOT be empty. Extract at least 3 key actions from the document.
- Key actions are the most important things the student needs to know or do based on this document.
- For homework/assignments: extract key requirements, constraints, submission instructions, and important directives (e.g. "Submit as a single PDF", "Use Python 3.x", "Include citations in APA format", "Work must be individual").
- For lectures: extract key takeaways, main concepts to remember, and study recommendations.
- For syllabi: extract critical policies, important deadlines, and key course requirements.
- Key actions are NOT answers or solutions - they are high-level directives and requirements extracted from the document.

Sections rules:
- Sections should be organized into clean, student-readable topics (not generic placeholders like "Section 1" or "Part 2").
- Prefer concise descriptive titles (e.g. "Submission Requirements", "Key Concepts", "Exam Topics", "Project Scope").
- When the source document has enough structure/content, produce at least 3 sections.
- For short or sparse documents, fewer than 3 sections is acceptable if additional sections would be repetitive or low-value.

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

type SupportedAnalysisDocumentType = "HOMEWORK" | "LECTURE";
const VALID_DOCUMENT_TYPES = new Set(["HOMEWORK", "LECTURE"]);
const STUDY_GUIDE_RESPONSE_FORMAT = zodResponseFormat(
  StudyGuideSchema,
  "study_guide"
);

function buildDocumentTypeInstructions(documentType: SupportedAnalysisDocumentType): string {
  switch (documentType) {
    case "HOMEWORK":
      return `Document-type instructions: HOMEWORK
- Checklist MUST remain action-oriented and task-oriented and MUST contain two groups of items in this order:
  1. Problem items: EVERY numbered or labeled problem, question, or task in the document MUST appear as its own checklist item, in the same order as the source document. Do not skip or merge problems. Label each with its number/label followed by a brief topic descriptor (e.g., "Problem 1: ER diagram for university database", "Question 3: Normalize to 3NF"). Never use bare labels like just "Problem 1" with no descriptor.
  2. General items: Include actionable homework logistics items grounded in the document such as submission prep, formatting checks, file naming conventions, deadline reminders, and any other explicit requirements. These MUST appear after the problem items but MUST NOT be omitted.
- Prioritize high-value important_details for homework:
  - dates: due dates, submission deadlines, milestone dates
  - policies: rubric expectations, grading breakdown, late policy, collaboration/academic-integrity constraints
  - logistics: allowed file types, naming conventions, final submission format requirements, required tools/software versions/programming language/formatting rules, zip/unzip or packaging requirements
  - contacts: instructor/TA contact channels only when explicitly present
- Preserve scope exactly when extracting tool/software restrictions:
  - Distinguish final submission requirements from allowed workflow tools.
  - If a document requires Microsoft Word for the final .docx submission, describe that as a final-file/submission constraint, NOT as a blanket ban on every other tool.
  - If the document explicitly allows another tool for part of the workflow (for example ADS / SSMS for query text or screenshots), keep that allowance visible in checklist and/or important_details.logistics.
  - Do NOT collapse a qualified submission-format rule into a global software prohibition unless the document explicitly states a global prohibition.
- Preserve overview.due_date behavior. If a due date exists, keep it in overview.due_date and also capture additional deadline context in important_details when present.
- For sufficiently structured homework documents, target at least 3 sections with clear student-readable titles.
- Never provide answers or solved work; only organize and extract requirements already present in the document.`;
    case "LECTURE":
      return `Document-type instructions: LECTURE
- This includes class notes/course notes normalized to LECTURE behavior.
- Checklist should be study-oriented, grounded in the source text, and phrased as review/comprehension goals (e.g., understand, review, compare, revisit, summarize, memorize only when terminology is explicitly present).
- Do NOT default to assignment-style checklist items for lecture output unless the document explicitly contains actionable tasks or exercises.
- Prioritize high-value important_details for lecture/class-notes:
  - dates: exam dates, quiz dates, review-session dates, and other study-relevant dates when present
  - contacts: instructor/TA names, emails, office hours, and contact logistics when present
  - logistics: study-relevant logistics such as session timing, required materials/tools, or review logistics
  - policies: class policies only when explicitly present
- Surface key definitions, formulas, and named concepts through key_actions/checklist/sections with grounding; keep important_details focused on the four contract buckets above.
- For sufficiently structured lecture/class-notes documents, target at least 3 sections with clear student-readable titles.
- Never invent teaching content; only reorganize and extract from the document.`;
    default:
      return "";
  }
}

export function buildAnalysisPrompt(
  documentType: SupportedAnalysisDocumentType,
  guidanceMode: boolean,
  restrictions: string[]
): string {
  let prompt = `${ANALYSIS_PROMPT_BASE}\n\n${buildDocumentTypeInstructions(documentType)}`;
  if (guidanceMode) {
    prompt += GUIDANCE_MODE_ADDITION;
  }

  if (restrictions.length > 0) {
    prompt += `\n\nADDITIONAL RESTRICTIONS:\n${restrictions.map((r) => `- ${r}`).join("\n")}`;
  }

  return prompt;
}

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

export async function analyzeDocument(
  text: string,
  providedDocumentType: DocumentType | undefined,
  metadata: AnalysisMetadata,
  openAiClient: OpenAI = client
): Promise<StudyGuide> {
  assertGenerationInputWithinLimit(text);

  const detection = detectDocumentType(text);
  const documentType = providedDocumentType ?? detection.documentType;
  if (documentType === "UNSUPPORTED") {
    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      "Unsupported document type cannot be analyzed.",
      { document_type: documentType }
    );
  }

  const supportedType = documentType as SupportedAnalysisDocumentType;
  const guidanceMode = shouldEnableGuidanceMode(
    documentType,
    detection.isAssignment
  );
  const restrictions = getRestrictions(documentType, guidanceMode);
  const prompt = buildAnalysisPrompt(supportedType, guidanceMode, restrictions);

  const citationRequirements = buildCitationRequirements(metadata, {
    useMustLanguage: true,
  });
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
            response_format: STUDY_GUIDE_RESPONSE_FORMAT,
            max_tokens: 8192,
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

      const normalized = normalizeModelOutput(parsed);
      const validated = StudyGuideSchema.safeParse(normalized);
      if (!validated.success) {
        throw new ContractValidationError(
          "SCHEMA_VALIDATION_FAILED",
          "Model output did not match StudyGuide schema.",
          { issues: validated.error.issues }
        );
      }

      const validationStartedAt = Date.now();
      validateStudyGuideAgainstDocument(validated.data, {
        text,
        fileType: metadata.fileType,
        pageCount: metadata.pageCount,
        paragraphCount: metadata.paragraphCount,
      });
      validationDurationMs = Date.now() - validationStartedAt;
      recordGenerationOutcome("success");
      const durationMs = Date.now() - startedAt;

      logger.info("Study guide generation attempt succeeded", {
        attempt,
        maxAttempts: generationPolicy.maxAttempts,
        model,
        timeoutMs: requestTimeoutMs,
        durationMs,
        queueWaitMs,
        openAiDurationMs,
        validationDurationMs,
      });

      return validated.data satisfies StudyGuide;
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

      logger.warn("Study guide generation attempt failed", {
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
          logger.warn("Study guide retries short-circuited after repeated repair failure signature", {
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
        "Model output failed validation after retries."
      );
}
