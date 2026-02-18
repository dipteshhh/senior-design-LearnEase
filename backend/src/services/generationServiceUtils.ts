import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai/error";
import type { FileType } from "../store/memoryStore.js";
import { ContractValidationError } from "./outputValidator.js";

export interface CitationRequirementsMetadata {
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
}

interface BuildCitationRequirementsOptions {
  useMustLanguage?: boolean;
}

export function buildCitationRequirements(
  metadata: CitationRequirementsMetadata,
  options: BuildCitationRequirementsOptions = {}
): string {
  const useMustLanguage = options.useMustLanguage ?? false;
  const citationVerb = useMustLanguage ? "You MUST use only" : "Use only";

  if (metadata.fileType === "PDF") {
    const maxPage = Math.max(1, metadata.pageCount);
    return `Citation requirements for this document:
- Document file type is PDF.
- ${citationVerb} PDF citations: { "source_type": "pdf", "page": number, "excerpt": string }.
- "page" MUST be an integer between 1 and ${maxPage}.
- NEVER use DOCX citation fields (anchor_type, paragraph).`;
  }

  const maxParagraph = Math.max(1, metadata.paragraphCount ?? 1);
  return `Citation requirements for this document:
- Document file type is DOCX.
- ${citationVerb} DOCX citations: { "source_type": "docx", "anchor_type": "paragraph", "paragraph": number, "excerpt": string }.
- "paragraph" MUST be an integer between 1 and ${maxParagraph}.
- NEVER use PDF citation fields (page).`;
}

export function buildRepairHint(error: unknown): string {
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

export function normalizeUpstreamError(error: unknown): unknown {
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
