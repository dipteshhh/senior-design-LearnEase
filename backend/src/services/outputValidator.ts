import type { Citation, DocumentType, ExtractionItem, Quiz, StudyGuide } from "../schemas/analyze.js";
import type { FileType } from "../store/memoryStore.js";

export type ValidationErrorCode =
  | "SCHEMA_VALIDATION_FAILED"
  | "QUOTE_NOT_FOUND"
  | "CITATION_EXCERPT_NOT_FOUND"
  | "CITATION_OUT_OF_RANGE"
  | "ACADEMIC_INTEGRITY_VIOLATION"
  | "DOCUMENT_TOO_LARGE_FOR_GENERATION"
  | "DOCUMENT_NOT_LECTURE"
  | "GENERATION_FAILED";

export class ContractValidationError extends Error {
  readonly code: ValidationErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: ValidationErrorCode,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ContractValidationError";
    this.code = code;
    this.details = details;
  }
}

interface ValidationContext {
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
  normalizedText: string;
  groundingTextLoose: string;
  docTokensLoose: string[] | null;
}

const MIN_SECTION_COUNT_FOR_STRUCTURED_DOC = 3;
const MIN_STRUCTURED_TEXT_CHARS = 6000;
const MIN_STRUCTURED_PDF_PAGES = 3;
const MIN_STRUCTURED_DOCX_PARAGRAPHS = 8;
const MIN_HEADING_MARKERS_FOR_SECTION_REQUIREMENT = 3;

const GENERIC_SECTION_TITLE_PATTERNS: RegExp[] = [
  /^section\s+\d+$/i,
  /^part\s+\d+$/i,
  /^chapter\s+\d+$/i,
  /^topic\s+\d+$/i,
  /^untitled$/i,
];

interface IntegrityPattern {
  pattern: RegExp;
  reason: string;
}

const ACADEMIC_INTEGRITY_PATTERNS: IntegrityPattern[] = [
  { pattern: /\bthe answer is\b/i, reason: 'contains "the answer is"' },
  { pattern: /\bfinal answer\b/i, reason: 'contains "final answer"' },
  { pattern: /\bcorrect answer\b/i, reason: 'contains "correct answer"' },
  { pattern: /\bcorrect option\b/i, reason: 'contains "correct option"' },
  { pattern: /\bchoose option [a-d]\b/i, reason: "selects a specific option as correct" },
  { pattern: /\b(?:here(?:'s| is) (?:a |the )?|follow (?:this|these) )step[- ]by[- ]step\b/i, reason: 'contains "step-by-step" solving guidance' },
  { pattern: /\bhere(?:'s| is) how to solve\b/i, reason: 'contains "how to solve" guidance' },
  { pattern: /\bsolution:\s*(?!\s*$)/i, reason: 'contains explicit "solution:" output' },
];

export interface ValidationInput {
  text: string;
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function normalizeQuotes(text: string): string {
  return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
}

function normalizeUnicodeVariants(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[•●◦▪▸►]/g, " ");
}

function removeHiddenCharacters(text: string): string {
  // This class intentionally strips several zero-width code points.
  // eslint-disable-next-line no-misleading-character-class
  return text.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "");
}

function normalizePdfHyphenation(text: string): string {
  return text.replace(/([A-Za-z])-\n([A-Za-z])/g, "$1$2");
}

export function normalizeDocumentText(text: string, fileType: FileType): string {
  let normalized = normalizeLineEndings(text);
  normalized = normalizeQuotes(normalized);
  normalized = normalizeUnicodeVariants(normalized);
  normalized = removeHiddenCharacters(normalized);
  if (fileType === "PDF") {
    normalized = normalizePdfHyphenation(normalized);
  }
  normalized = normalized.replace(/\s+/g, " ");
  return normalized.trim();
}

function normalizeForLooseGroundingMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldAllowLooseGroundingMatch(normalizedFragment: string): boolean {
  const tokens = normalizedFragment.split(" ").filter(Boolean);
  return tokens.length >= 3 || normalizedFragment.length >= 16;
}

function toLooseTokenSet(text: string): Set<string> {
  const normalized = normalizeForLooseGroundingMatch(text);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}

function hasStrongCitationOverlap(quote: string, citationExcerpts: string[]): boolean {
  const quoteTokens = toLooseTokenSet(quote);
  if (quoteTokens.size < 3) {
    return false;
  }

  for (const excerpt of citationExcerpts) {
    const excerptTokens = toLooseTokenSet(excerpt);
    if (excerptTokens.size < 3) {
      continue;
    }

    let overlap = 0;
    for (const token of quoteTokens) {
      if (excerptTokens.has(token)) {
        overlap += 1;
      }
    }

    const required = Math.max(3, Math.ceil(Math.min(quoteTokens.size, excerptTokens.size) * 0.6));
    if (overlap >= required) {
      return true;
    }
  }

  return false;
}

/**
 * Token-overlap grounding check for citation excerpts against the full
 * document text. Uses a sliding window over the document token stream so
 * that a locally concentrated cluster of matching tokens passes, even if
 * the model paraphrased slightly or PDF extraction introduced artifacts.
 */
function hasTokenOverlapWithDocument(
  normalizedExcerpt: string,
  context: ValidationContext
): boolean {
  const excerptTokens = toLooseTokenSet(normalizedExcerpt);
  if (excerptTokens.size < 3) {
    return false;
  }

  if (!context.docTokensLoose) {
    context.docTokensLoose = normalizeForLooseGroundingMatch(context.normalizedText)
      .split(" ")
      .filter(Boolean);
  }
  const docTokens = context.docTokensLoose;
  if (docTokens.length === 0) {
    return false;
  }

  // Window size: twice the excerpt token count, capped to avoid degenerate scans
  const windowSize = Math.min(excerptTokens.size * 2, docTokens.length);
  const required = Math.max(3, Math.ceil(excerptTokens.size * 0.6));

  // Build initial window token counts
  const windowCounts = new Map<string, number>();
  let overlap = 0;

  for (let i = 0; i < windowSize; i++) {
    const token = docTokens[i];
    windowCounts.set(token, (windowCounts.get(token) ?? 0) + 1);
    if (excerptTokens.has(token) && windowCounts.get(token) === 1) {
      overlap += 1;
    }
  }

  if (overlap >= required) {
    return true;
  }

  // Slide the window
  for (let i = windowSize; i < docTokens.length; i++) {
    // Add new token entering the window
    const entering = docTokens[i];
    windowCounts.set(entering, (windowCounts.get(entering) ?? 0) + 1);
    if (excerptTokens.has(entering) && windowCounts.get(entering) === 1) {
      overlap += 1;
    }

    // Remove token leaving the window
    const leaving = docTokens[i - windowSize];
    const leavingCount = (windowCounts.get(leaving) ?? 1) - 1;
    if (leavingCount <= 0) {
      windowCounts.delete(leaving);
      if (excerptTokens.has(leaving)) {
        overlap -= 1;
      }
    } else {
      windowCounts.set(leaving, leavingCount);
    }

    if (overlap >= required) {
      return true;
    }
  }

  return false;
}

// Heading markers like "Question 1", "Problem 2", "Task 3", "Section 4",
// "Module 5", "Chapter 6". The leading family word and trailing identifier
// together give us a stable key per distinct numbered item.
const NUMBERED_HEADING_MARKER_REGEX =
  /\b(question|problem|task|section|module|chapter)\s+(\d+)\b/gi;
// "Part" is special because it can be enumerated as "Part A", "Part 1",
// "Part II", etc. We accept any short alphanumeric token after "Part".
const PART_HEADING_MARKER_REGEX = /\bpart\s+([a-z0-9]{1,4})\b/gi;

/**
 * Returns the set of *distinct* problem/question/task/etc. marker keys
 * found in the document. Repeated mentions of the same marker (e.g.
 * "Question 1" appearing in both a table of contents and the body) only
 * count once, so this set reflects the actual count of distinct numbered
 * items in the source document. Each key is formatted as
 * `"<family>:<identifier>"` (e.g. `"question:1"`, `"part:a"`).
 */
function collectDistinctHeadingMarkers(normalizedText: string): Set<string> {
  const distinct = new Set<string>();

  for (const match of normalizedText.matchAll(NUMBERED_HEADING_MARKER_REGEX)) {
    distinct.add(`${match[1].toLowerCase()}:${match[2]}`);
  }

  for (const match of normalizedText.matchAll(PART_HEADING_MARKER_REGEX)) {
    distinct.add(`part:${match[1].toLowerCase()}`);
  }

  return distinct;
}

function createValidationContext(input: ValidationInput): ValidationContext {
  const normalizedText = normalizeDocumentText(input.text, input.fileType);
  return {
    fileType: input.fileType,
    pageCount: input.pageCount,
    paragraphCount: input.paragraphCount,
    normalizedText,
    groundingTextLoose: normalizeForLooseGroundingMatch(normalizedText),
    docTokensLoose: null,
  };
}

function normalizeCitationText(citation: Citation): string {
  const sourceFileType = citation.source_type === "pdf" ? "PDF" : "DOCX";
  return normalizeDocumentText(citation.excerpt, sourceFileType);
}

function isDirectGroundingMatch(normalizedFragment: string, context: ValidationContext): boolean {
  if (!normalizedFragment) {
    return false;
  }

  if (context.normalizedText.includes(normalizedFragment)) {
    return true;
  }

  if (!shouldAllowLooseGroundingMatch(normalizedFragment)) {
    return false;
  }

  const looseFragment = normalizeForLooseGroundingMatch(normalizedFragment);
  return Boolean(looseFragment && context.groundingTextLoose.includes(looseFragment));
}

function hasOrderedEllipsisFragmentGrounding(
  normalizedFragment: string,
  context: ValidationContext
): boolean {
  const rawFragments = normalizedFragment
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/g)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);

  if (rawFragments.length < 2) {
    return false;
  }

  const looseFragments = rawFragments
    .map((fragment) => normalizeForLooseGroundingMatch(fragment))
    .filter((fragment) => shouldAllowLooseGroundingMatch(fragment));

  if (looseFragments.length < 2) {
    return false;
  }

  let searchStart = 0;
  for (const looseFragment of looseFragments) {
    const position = context.groundingTextLoose.indexOf(looseFragment, searchStart);
    if (position < 0) {
      return false;
    }
    searchStart = position + looseFragment.length;
  }

  return true;
}

function validateQuoteExists(
  quote: string,
  context: ValidationContext,
  details: Record<string, unknown>,
  citationExcerpts: string[]
): void {
  const normalizedQuote = normalizeDocumentText(quote, context.fileType);
  if (!normalizedQuote) {
    throw new ContractValidationError("QUOTE_NOT_FOUND", "Supporting quote was not found in extracted text.", {
      ...details,
      quote_preview: quote.slice(0, 180),
    });
  }

  if (isDirectGroundingMatch(normalizedQuote, context)) {
    return;
  }

  if (hasStrongCitationOverlap(normalizedQuote, citationExcerpts)) {
    return;
  }

  throw new ContractValidationError(
    "QUOTE_NOT_FOUND",
    "Supporting quote was not found in extracted text.",
    {
      ...details,
      quote_preview: normalizedQuote.slice(0, 180),
    }
  );
}

interface CitationValidationOptions {
  groundedFallbackExcerpt?: string;
}

function validateCitation(
  citation: Citation,
  context: ValidationContext,
  path: string,
  options: CitationValidationOptions = {}
): void {
  const normalizedExcerpt = normalizeCitationText(citation);
  if (!normalizedExcerpt) {
    throw new ContractValidationError("CITATION_EXCERPT_NOT_FOUND", "Citation excerpt was not found in extracted text.", {
      path,
      excerpt_preview: citation.excerpt.slice(0, 180),
    });
  }

  const citationGrounded =
    isDirectGroundingMatch(normalizedExcerpt, context) ||
    hasOrderedEllipsisFragmentGrounding(normalizedExcerpt, context) ||
    hasTokenOverlapWithDocument(normalizedExcerpt, context);
  if (!citationGrounded) {
    const normalizedFallback = options.groundedFallbackExcerpt
      ? normalizeDocumentText(options.groundedFallbackExcerpt, context.fileType)
      : "";
    const fallbackGrounded = isDirectGroundingMatch(normalizedFallback, context);
    if (!fallbackGrounded) {
      throw new ContractValidationError(
        "CITATION_EXCERPT_NOT_FOUND",
        "Citation excerpt was not found in extracted text.",
        { path, excerpt_preview: normalizedExcerpt.slice(0, 180) }
      );
    }
  }

  if (citation.source_type === "pdf") {
    if (context.fileType !== "PDF") {
      throw new ContractValidationError(
        "CITATION_OUT_OF_RANGE",
        "Citation source type does not match document file type.",
        { path, source_type: citation.source_type, expected_file_type: context.fileType }
      );
    }
    if (citation.page < 1 || citation.page > context.pageCount) {
      throw new ContractValidationError(
        "CITATION_OUT_OF_RANGE",
        "PDF citation page is out of range.",
        { path, page: citation.page, page_count: context.pageCount }
      );
    }
    return;
  }

  if (context.fileType !== "DOCX") {
    throw new ContractValidationError(
      "CITATION_OUT_OF_RANGE",
      "Citation source type does not match document file type.",
      { path, source_type: citation.source_type, expected_file_type: context.fileType }
    );
  }

  const paragraphCount = context.paragraphCount ?? 0;
  if (citation.paragraph < 1 || citation.paragraph > paragraphCount) {
    throw new ContractValidationError(
      "CITATION_OUT_OF_RANGE",
      "DOCX citation paragraph is out of range.",
      { path, paragraph: citation.paragraph, paragraph_count: paragraphCount }
    );
  }
}

function validateExtractionItems(
  items: ExtractionItem[],
  context: ValidationContext,
  path: string
): void {
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    const citationExcerpts = item.citations.map((citation) => normalizeCitationText(citation));
    const normalizedQuote = normalizeDocumentText(item.supporting_quote, context.fileType);
    const groundedFallbackExcerpt = isDirectGroundingMatch(normalizedQuote, context)
      ? item.supporting_quote
      : undefined;
    item.citations.forEach((citation, citationIndex) => {
      validateCitation(citation, context, `${itemPath}.citations[${citationIndex}]`, {
        groundedFallbackExcerpt,
      });
    });
    validateQuoteExists(
      item.supporting_quote,
      context,
      {
        path: itemPath,
        item_id: item.id,
      },
      citationExcerpts
    );
  });
}

function assertNoAnswerLeakage(text: string, path: string): void {
  const normalized = normalizeDocumentText(text, "DOCX");
  if (!normalized) return;

  for (const rule of ACADEMIC_INTEGRITY_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      throw new ContractValidationError(
        "ACADEMIC_INTEGRITY_VIOLATION",
        "Generated content appears to provide answers or solving guidance.",
        {
          path,
          reason: rule.reason,
        }
      );
    }
  }
}

function validateNoAnswerLeakage(studyGuide: StudyGuide): void {
  assertNoAnswerLeakage(studyGuide.overview.summary, "overview.summary");

  studyGuide.key_actions.forEach((item, index) => {
    assertNoAnswerLeakage(item.label, `key_actions[${index}].label`);
  });
  studyGuide.checklist.forEach((item, index) => {
    assertNoAnswerLeakage(item.label, `checklist[${index}].label`);
  });
  studyGuide.important_details.dates.forEach((item, index) => {
    assertNoAnswerLeakage(item.label, `important_details.dates[${index}].label`);
  });
  studyGuide.important_details.policies.forEach((item, index) => {
    assertNoAnswerLeakage(item.label, `important_details.policies[${index}].label`);
  });
  studyGuide.important_details.contacts.forEach((item, index) => {
    assertNoAnswerLeakage(item.label, `important_details.contacts[${index}].label`);
  });
  studyGuide.important_details.logistics.forEach((item, index) => {
    assertNoAnswerLeakage(item.label, `important_details.logistics[${index}].label`);
  });

  studyGuide.sections.forEach((section, index) => {
    assertNoAnswerLeakage(section.title, `sections[${index}].title`);
    assertNoAnswerLeakage(section.content, `sections[${index}].content`);
  });
}

type SectionRequirementReason =
  | "strong_explicit_structure"
  | "weak_explicit_structure"
  | "text_length_fallback"
  | "no_minimum";

interface SectionRequirement {
  minSections: number;
  reason: SectionRequirementReason;
  distinctMarkers: string[];
  headingMarkerCount: number;
}

const MAX_DETECTED_MARKERS_IN_ERROR = 20;
const MAX_SOURCE_PREVIEW_CHARS = 400;

function computeSectionRequirement(context: ValidationContext): SectionRequirement {
  const distinctMarkerSet = collectDistinctHeadingMarkers(context.normalizedText);
  const distinctMarkers = Array.from(distinctMarkerSet);
  const headingMarkerCount = distinctMarkerSet.size;
  const hasStrongExplicitStructure =
    headingMarkerCount >= MIN_HEADING_MARKERS_FOR_SECTION_REQUIREMENT;

  if (
    hasStrongExplicitStructure &&
    context.fileType === "PDF" &&
    context.pageCount >= MIN_STRUCTURED_PDF_PAGES
  ) {
    return {
      minSections: MIN_SECTION_COUNT_FOR_STRUCTURED_DOC,
      reason: "strong_explicit_structure",
      distinctMarkers,
      headingMarkerCount,
    };
  }

  if (
    hasStrongExplicitStructure &&
    context.fileType === "DOCX" &&
    (context.paragraphCount ?? 0) >= MIN_STRUCTURED_DOCX_PARAGRAPHS
  ) {
    return {
      minSections: MIN_SECTION_COUNT_FOR_STRUCTURED_DOC,
      reason: "strong_explicit_structure",
      distinctMarkers,
      headingMarkerCount,
    };
  }

  if (headingMarkerCount > 0) {
    return {
      minSections: Math.min(headingMarkerCount, MIN_SECTION_COUNT_FOR_STRUCTURED_DOC),
      reason: "weak_explicit_structure",
      distinctMarkers,
      headingMarkerCount,
    };
  }

  if (context.normalizedText.length >= MIN_STRUCTURED_TEXT_CHARS) {
    return {
      minSections: MIN_SECTION_COUNT_FOR_STRUCTURED_DOC,
      reason: "text_length_fallback",
      distinctMarkers,
      headingMarkerCount,
    };
  }

  return {
    minSections: 0,
    reason: "no_minimum",
    distinctMarkers,
    headingMarkerCount,
  };
}

function validateSectionStructure(studyGuide: StudyGuide, context: ValidationContext): void {
  const requirement = computeSectionRequirement(context);
  if (
    requirement.minSections > 0 &&
    studyGuide.sections.length < requirement.minSections
  ) {
    const truncatedMarkers = requirement.distinctMarkers.slice(0, MAX_DETECTED_MARKERS_IN_ERROR);
    const markersTruncated =
      requirement.distinctMarkers.length > truncatedMarkers.length;

    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      `Study guide must include at least ${requirement.minSections} section${requirement.minSections === 1 ? "" : "s"} for this document.`,
      {
        min_sections: requirement.minSections,
        actual_sections: studyGuide.sections.length,
        file_type: context.fileType,
        page_count: context.pageCount,
        paragraph_count: context.paragraphCount,
        text_length: context.normalizedText.length,
        heading_marker_count: requirement.headingMarkerCount,
        section_requirement_reason: requirement.reason,
        detected_markers: truncatedMarkers,
        detected_markers_truncated: markersTruncated,
        source_text_preview: context.normalizedText.slice(0, MAX_SOURCE_PREVIEW_CHARS),
      }
    );
  }

  studyGuide.sections.forEach((section, sectionIndex) => {
    const title = section.title.trim();
    if (title.length < 3) {
      throw new ContractValidationError(
        "SCHEMA_VALIDATION_FAILED",
        "Section title must be student-readable and descriptive.",
        { path: `sections[${sectionIndex}].title`, reason: "too_short", title }
      );
    }

    if (GENERIC_SECTION_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
      throw new ContractValidationError(
        "SCHEMA_VALIDATION_FAILED",
        "Section title must be student-readable and descriptive.",
        { path: `sections[${sectionIndex}].title`, reason: "generic_title", title }
      );
    }
  });
}

export function validateStudyGuideAgainstDocument(
  studyGuide: StudyGuide,
  input: ValidationInput
): void {
  const context = createValidationContext(input);
  validateExtractionItems(studyGuide.key_actions, context, "key_actions");
  validateExtractionItems(studyGuide.checklist, context, "checklist");
  validateExtractionItems(studyGuide.important_details.dates, context, "important_details.dates");
  validateExtractionItems(
    studyGuide.important_details.policies,
    context,
    "important_details.policies"
  );
  validateExtractionItems(
    studyGuide.important_details.contacts,
    context,
    "important_details.contacts"
  );
  validateExtractionItems(
    studyGuide.important_details.logistics,
    context,
    "important_details.logistics"
  );

  studyGuide.sections.forEach((section, sectionIndex) => {
    if (section.citations.length === 0) {
      throw new ContractValidationError(
        "SCHEMA_VALIDATION_FAILED",
        "Each section must include at least one citation.",
        { path: `sections[${sectionIndex}].citations` }
      );
    }

    section.citations.forEach((citation, citationIndex) => {
      validateCitation(
        citation,
        context,
        `sections[${sectionIndex}].citations[${citationIndex}]`
      );
    });
  });

  validateSectionStructure(studyGuide, context);
  validateNoAnswerLeakage(studyGuide);
}

function validateQuestionDocumentType(documentType: DocumentType): void {
  if (documentType !== "LECTURE") {
    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      "Quiz generation is lecture-only.",
      { document_type: documentType }
    );
  }
}

export function validateQuizAgainstDocument(
  quiz: Quiz,
  input: ValidationInput,
  documentType: DocumentType
): void {
  validateQuestionDocumentType(documentType);
  const context = createValidationContext(input);

  quiz.questions.forEach((question, questionIndex) => {
    const questionPath = `questions[${questionIndex}]`;
    const citationExcerpts = question.citations.map((citation) => normalizeCitationText(citation));
    question.citations.forEach((citation, citationIndex) => {
      validateCitation(citation, context, `${questionPath}.citations[${citationIndex}]`);
    });
    validateQuoteExists(
      question.supporting_quote,
      context,
      {
        path: questionPath,
        question_id: question.id,
      },
      citationExcerpts
    );
  });
}
