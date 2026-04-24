import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai/error";
import { readEnvInt } from "../lib/env.js";
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

const DEFAULT_OPENAI_MAX_INPUT_CHARS = 120000;

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

interface BuildRepairHintOptions {
  documentText?: string;
}

const GROUNDING_FAILURE_CODES = new Set(["CITATION_EXCERPT_NOT_FOUND", "QUOTE_NOT_FOUND"]);
const GROUNDING_GUIDANCE = `Grounding rules for the next attempt:
- Every citation excerpt and supporting_quote MUST be a verbatim, byte-for-byte substring of the supplied document text.
- Do NOT rewrite, normalize, prettify, or "fix" math, LaTeX, equations, code, or punctuation. If the extracted text shows "QKT" or "dk" or "np . matmul ( Q , K . T )", copy it exactly that way - do not turn it into "QK^T", "d_k", or "np.matmul(Q, K.T)".
- If the verbatim span you want to cite spans across noisy formatting, you may use "..." between two short verbatim fragments. Each fragment on either side of "..." must still be an exact substring of the document text.
- Prefer short (5-20 word) excerpts that you can copy exactly over longer ones you have to clean up.`;

const PREVIEW_TOKEN_MIN_LENGTH = 2;
const DEFAULT_REPAIR_WINDOW_CHARS = 320;
const REPAIR_WINDOW_CONTEXT_CHARS = 60;

function extractGroundingPreview(error: ContractValidationError): string | null {
  const details = error.details ?? {};
  const candidates = [details.excerpt_preview, details.quote_preview];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
}

function tokenizePreviewForMatch(preview: string): string[] {
  const tokens = preview
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((token) => token.length >= PREVIEW_TOKEN_MIN_LENGTH);
  return Array.from(new Set(tokens));
}

export function findBestMatchingDocumentWindow(
  documentText: string,
  preview: string,
  options: { windowChars?: number } = {}
): string | null {
  const windowChars = Math.max(80, options.windowChars ?? DEFAULT_REPAIR_WINDOW_CHARS);
  if (!documentText || !preview) {
    return null;
  }

  const uniqueTokens = tokenizePreviewForMatch(preview);
  if (uniqueTokens.length === 0) {
    return null;
  }

  const docLower = documentText.toLowerCase();
  const positions: Array<{ pos: number; token: string }> = [];

  for (const token of uniqueTokens) {
    let searchFrom = 0;
    while (searchFrom <= docLower.length) {
      const idx = docLower.indexOf(token, searchFrom);
      if (idx < 0) break;
      positions.push({ pos: idx, token });
      searchFrom = idx + Math.max(1, token.length);
    }
  }

  if (positions.length === 0) {
    return null;
  }

  positions.sort((a, b) => a.pos - b.pos);

  const seen = new Map<string, number>();
  let bestUnique = 0;
  let bestStart = positions[0].pos;
  let lo = 0;

  for (let hi = 0; hi < positions.length; hi += 1) {
    while (lo < hi && positions[hi].pos - positions[lo].pos > windowChars) {
      const tok = positions[lo].token;
      const remaining = (seen.get(tok) ?? 1) - 1;
      if (remaining <= 0) {
        seen.delete(tok);
      } else {
        seen.set(tok, remaining);
      }
      lo += 1;
    }
    seen.set(positions[hi].token, (seen.get(positions[hi].token) ?? 0) + 1);
    if (seen.size > bestUnique) {
      bestUnique = seen.size;
      bestStart = positions[lo].pos;
    }
  }

  const start = Math.max(0, bestStart - REPAIR_WINDOW_CONTEXT_CHARS);
  const end = Math.min(documentText.length, start + windowChars);
  const window = documentText.slice(start, end).trim();
  return window.length > 0 ? window : null;
}

export function buildRepairHint(
  error: unknown,
  options: BuildRepairHintOptions = {}
): string {
  if (!(error instanceof ContractValidationError)) {
    return "";
  }

  const details = error.details ? JSON.stringify(error.details) : "{}";
  const sections: string[] = [
    `The previous output was rejected.
Error code: ${error.code}
Error message: ${error.message}
Validation details: ${details}`,
  ];

  if (GROUNDING_FAILURE_CODES.has(error.code)) {
    const preview = extractGroundingPreview(error);
    if (preview) {
      sections.push(`Rejected fragment (this exact text was NOT found in the document):
"""
${preview}
"""`);
    }

    const documentText = options.documentText;
    if (preview && documentText) {
      const window = findBestMatchingDocumentWindow(documentText, preview);
      if (window) {
        sections.push(`Closest matching region from the actual extracted document text (copy verbatim from text like this):
"""
${window}
"""`);
      }
    }

    sections.push(GROUNDING_GUIDANCE);
  }

  sections.push("Regenerate the entire JSON and fix these issues exactly.");
  return sections.join("\n\n");
}

export function getGenerationMaxInputChars(): number {
  return readEnvInt(
    "OPENAI_MAX_INPUT_CHARS",
    DEFAULT_OPENAI_MAX_INPUT_CHARS,
    1000
  );
}

export function assertGenerationInputWithinLimit(text: string): void {
  const maxChars = getGenerationMaxInputChars();
  if (text.length <= maxChars) {
    return;
  }

  throw new ContractValidationError(
    "DOCUMENT_TOO_LARGE_FOR_GENERATION",
    "Document is too large to generate study materials. Upload a shorter document.",
    {
      max_chars: maxChars,
      actual_chars: text.length,
    }
  );
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
