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
- group: always required — set to null for all key_actions, important_details, and lecture checklist items. For HOMEWORK checklist items only, set to one of: "setup", "problems", "verify", "submit"

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
- In section content, separate distinct concepts or list items with \n\n rather than joining them into a single run-on sentence with dashes or commas. Each distinct point, definition, or item should appear on its own line so it is readable in focus mode.

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

function targetLectureSectionCount(metadata: AnalysisMetadata): { min: number; target: number; max: number } {
  let estimate: number;
  if (metadata.fileType === "PDF") {
    // ~1 section per page, but a 1-page doc still gets at least 3
    estimate = Math.max(3, metadata.pageCount);
  } else {
    // ~1 section per 3 paragraphs for DOCX
    estimate = Math.max(3, Math.round((metadata.paragraphCount ?? 9) / 3));
  }
  const target = Math.min(12, estimate);
  return { min: Math.max(3, target - 1), target, max: Math.min(12, target + 1) };
}

function buildDocumentTypeInstructions(documentType: SupportedAnalysisDocumentType, metadata: AnalysisMetadata): string {
  switch (documentType) {
    case "HOMEWORK":
      return `Document-type instructions: HOMEWORK
- Checklist MUST be action-oriented and task-oriented. Assign every checklist item a "group" field using exactly one of these four values, in this order:
  1. group "setup" — Pre-work before solving: read submission rules in full, download/clone starter code or templates if the document provides them, install or configure any required tools or software. Only include this group if the document explicitly provides setup steps, starter files, or required tooling. Omit entirely if there is nothing to set up.
  2. group "problems" — One item per distinct deliverable. EVERY numbered or labeled problem, question, or task MUST appear as its own item in source order. For programming assignments, decompose within a problem if multiple named components are listed (e.g., "implement FCFS, SJF, Priority, and Round-Robin" → four separate items labeled "Implement FCFS algorithm", "Implement SJF algorithm", etc., NOT one item). For math/SQL problems, one item per problem number. Label each with its number/identifier and a brief descriptor. Never use bare labels like "Problem 1" with no descriptor.
  3. group "verify" — Checks to perform after finishing the work, grounded in explicit document requirements or examples: run code against provided sample input/output, verify output format matches requirements, re-read rubric, check units on answers, etc. Add one verify item per major deliverable if the document provides testable examples or output specifications.
  4. group "submit" — Specific submission steps extracted from the document. Each distinct requirement is its own item: exact filename(s) required, exact file format, submission platform/location if named, deadline with time and timezone. Be specific (e.g., "Name file schedule_fcfs.c exactly as specified" not "submit files").
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
- Sections for homework are PROBLEM GUIDES — one section per distinct problem, question, or major deliverable. Students use these in focus mode to understand exactly what each problem requires before attempting it.
  - Title: problem identifier + brief descriptor (e.g., "Problem 1: Nested Subquery", "Question 3: Normalize to 3NF", "FCFS Algorithm Implementation").
  - Content: a structured restatement of what this problem requires. Include: what to produce (output/deliverable), key constraints and requirements, any relevant context provided in the document (schema, formula, sample data, starter code details), and any problem-specific notes. Separate each distinct point with \n\n so it is readable. Do NOT group multiple problems into one section.
  - For programming assignments with multiple named components (e.g., implement FCFS, SJF, Priority, Round-Robin), create one section per component.
  - Target one section per problem/deliverable — do not artificially merge or reduce.
- Never provide answers, solved work, or code; only extract and restructure the requirements already present in the document.`;
    case "LECTURE": {
      const { min, target, max } = targetLectureSectionCount(metadata);
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
- Sections MUST be split at the sub-topic level — one section per distinct concept, algorithm, or named topic. Do NOT collapse multiple sub-topics into one broad section (e.g. "Big-O Notation", "Arrays", "Linked Lists", "Merge Sort" should each be their own section, not grouped under "Data Structures" or "Sorting").
- Target ${target} sections for this document (acceptable range: ${min}–${max}). Do not stop at 3 if the document covers more sub-topics.
- Never invent teaching content; only reorganize and extract from the document.`;
    }
    default:
      return "";
  }
}

export function buildAnalysisPrompt(
  documentType: SupportedAnalysisDocumentType,
  guidanceMode: boolean,
  restrictions: string[],
  metadata: AnalysisMetadata
): string {
  let prompt = `${ANALYSIS_PROMPT_BASE}\n\n${buildDocumentTypeInstructions(documentType, metadata)}`;
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
      detectedMarkerCount:
        typeof details.detected_marker_count === "number"
          ? details.detected_marker_count
          : null,
      headingMarkerCount:
        typeof details.heading_marker_count === "number" ? details.heading_marker_count : null,
      sectionRequirementReason:
        typeof details.section_requirement_reason === "string"
          ? details.section_requirement_reason
          : null,
      usedTextLengthFallback:
        typeof details.used_text_length_fallback === "boolean"
          ? details.used_text_length_fallback
          : null,
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
  const prompt = buildAnalysisPrompt(supportedType, guidanceMode, restrictions, metadata);

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
        errorMessage:
          normalizedError instanceof Error ? normalizedError.message : String(normalizedError),
        errorDetails:
          normalizedError instanceof ContractValidationError ? normalizedError.details : null,
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
        repairHint = buildRepairHint(normalizedError, { documentText: text });
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
