import type { Citation, DocumentType, ExtractionItem, Quiz, StudyGuide } from "../schemas/analyze.js";
import type { FileType } from "../store/memoryStore.js";

export type ValidationErrorCode =
  | "SCHEMA_VALIDATION_FAILED"
  | "QUOTE_NOT_FOUND"
  | "CITATION_EXCERPT_NOT_FOUND"
  | "CITATION_OUT_OF_RANGE"
  | "DOCUMENT_NOT_LECTURE";

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
}

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

function removeHiddenCharacters(text: string): string {
  return text.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "");
}

function normalizePdfHyphenation(text: string): string {
  return text.replace(/([A-Za-z])-\n([A-Za-z])/g, "$1$2");
}

export function normalizeDocumentText(text: string, fileType: FileType): string {
  let normalized = normalizeLineEndings(text);
  normalized = normalizeQuotes(normalized);
  normalized = removeHiddenCharacters(normalized);
  if (fileType === "PDF") {
    normalized = normalizePdfHyphenation(normalized);
  }
  normalized = normalized.replace(/\s+/g, " ");
  return normalized.trim();
}

function createValidationContext(input: ValidationInput): ValidationContext {
  return {
    fileType: input.fileType,
    pageCount: input.pageCount,
    paragraphCount: input.paragraphCount,
    normalizedText: normalizeDocumentText(input.text, input.fileType),
  };
}

function normalizeCitationText(citation: Citation): string {
  const sourceFileType = citation.source_type === "pdf" ? "PDF" : "DOCX";
  return normalizeDocumentText(citation.excerpt, sourceFileType);
}

function validateQuoteExists(
  quote: string,
  context: ValidationContext,
  details: Record<string, unknown>
): void {
  const normalizedQuote = normalizeDocumentText(quote, context.fileType);
  if (!normalizedQuote || !context.normalizedText.includes(normalizedQuote)) {
    throw new ContractValidationError(
      "QUOTE_NOT_FOUND",
      "Supporting quote was not found in extracted text.",
      details
    );
  }
}

function validateCitation(citation: Citation, context: ValidationContext, path: string): void {
  const normalizedExcerpt = normalizeCitationText(citation);
  if (!normalizedExcerpt || !context.normalizedText.includes(normalizedExcerpt)) {
    throw new ContractValidationError(
      "CITATION_EXCERPT_NOT_FOUND",
      "Citation excerpt was not found in extracted text.",
      { path }
    );
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
    validateQuoteExists(item.supporting_quote, context, {
      path: itemPath,
      item_id: item.id,
    });
    item.citations.forEach((citation, citationIndex) => {
      validateCitation(citation, context, `${itemPath}.citations[${citationIndex}]`);
    });
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
    section.citations.forEach((citation, citationIndex) => {
      validateCitation(
        citation,
        context,
        `sections[${sectionIndex}].citations[${citationIndex}]`
      );
    });
  });
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
    validateQuoteExists(question.supporting_quote, context, {
      path: questionPath,
      question_id: question.id,
    });
    question.citations.forEach((citation, citationIndex) => {
      validateCitation(citation, context, `${questionPath}.citations[${citationIndex}]`);
    });
  });
}
