import test from "node:test";
import assert from "node:assert/strict";
import {
  assertGenerationInputWithinLimit,
  buildCitationRequirements,
  buildRepairHint,
  findBestMatchingDocumentWindow,
  getGenerationMaxInputChars,
  normalizeUpstreamError,
} from "../services/generationServiceUtils.js";
import { ContractValidationError } from "../services/outputValidator.js";

test("buildCitationRequirements uses MUST wording when requested", () => {
  const requirements = buildCitationRequirements(
    {
      fileType: "PDF",
      pageCount: 3,
      paragraphCount: null,
    },
    { useMustLanguage: true }
  );

  assert.match(requirements, /You MUST use only PDF citations/);
  assert.match(requirements, /between 1 and 3/);
});

test("buildCitationRequirements uses default wording for quiz flow", () => {
  const requirements = buildCitationRequirements({
    fileType: "DOCX",
    pageCount: 0,
    paragraphCount: 12,
  });

  assert.match(requirements, /Use only DOCX citations/);
  assert.match(requirements, /between 1 and 12/);
});

test("buildRepairHint includes validation details for contract errors", () => {
  const error = new ContractValidationError(
    "SCHEMA_VALIDATION_FAILED",
    "Invalid schema.",
    { path: "overview.title" }
  );

  const hint = buildRepairHint(error);
  assert.match(hint, /SCHEMA_VALIDATION_FAILED/);
  assert.match(hint, /overview\.title/);
});

test("buildRepairHint returns empty string for non-contract errors", () => {
  assert.equal(buildRepairHint(new Error("boom")), "");
});

test("buildRepairHint includes byte-for-byte guidance for grounding failures", () => {
  const error = new ContractValidationError(
    "CITATION_EXCERPT_NOT_FOUND",
    "Citation excerpt was not found in extracted text.",
    { path: "sections[0].citations[0]", excerpt_preview: "QK^T / sqrt(d_k)" }
  );

  const hint = buildRepairHint(error);
  assert.match(hint, /CITATION_EXCERPT_NOT_FOUND/);
  assert.match(hint, /Rejected fragment/);
  assert.match(hint, /QK\^T \/ sqrt\(d_k\)/);
  assert.match(hint, /byte-for-byte/);
  assert.match(hint, /Do NOT rewrite/);
});

test("buildRepairHint includes a verbatim window from extracted text when provided", () => {
  const documentText =
    "Q = Query matrix. K = Key matrix. V = Value matrix. " +
    "The function should compute Attention(Q, K, V) = softmax(QKT / sqrt(dk)) V. " +
    "Demonstrate your function with a toy example. " +
    "Use np . matmul ( Q , K . T ) for the dot product step.";
  const error = new ContractValidationError(
    "CITATION_EXCERPT_NOT_FOUND",
    "Citation excerpt was not found in extracted text.",
    {
      path: "sections[0].citations[0]",
      excerpt_preview: "Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V",
    }
  );

  const hint = buildRepairHint(error, { documentText });
  assert.match(hint, /Closest matching region/);
  assert.match(hint, /softmax\(QKT \/ sqrt\(dk\)\) V/);
});

test("buildRepairHint omits matching window when no preview tokens overlap the document", () => {
  const documentText = "Totally unrelated text about photosynthesis and chlorophyll.";
  const error = new ContractValidationError(
    "QUOTE_NOT_FOUND",
    "Supporting quote was not found in extracted text.",
    { path: "key_actions[0]", quote_preview: "kqt fxn" }
  );

  const hint = buildRepairHint(error, { documentText });
  assert.doesNotMatch(hint, /Closest matching region/);
  assert.match(hint, /byte-for-byte/);
});

test("findBestMatchingDocumentWindow centers the window on the densest token cluster", () => {
  const documentText =
    "Header noise. ".repeat(20) +
    "Submit your assignment as a single PDF file before the deadline. " +
    "Footer noise. ".repeat(20);
  const window = findBestMatchingDocumentWindow(
    documentText,
    "Submit assignment single PDF deadline"
  );
  assert.ok(window, "expected a window to be returned");
  assert.match(window!, /Submit your assignment as a single PDF file before the deadline\./);
});

test("findBestMatchingDocumentWindow returns null when preview has no matchable tokens", () => {
  const documentText = "Some plain document content for the test.";
  assert.equal(findBestMatchingDocumentWindow(documentText, "!!!"), null);
});

test("assertGenerationInputWithinLimit allows text within limit", () => {
  process.env.OPENAI_MAX_INPUT_CHARS = "20";
  assert.doesNotThrow(() => {
    assertGenerationInputWithinLimit("short document");
  });
});

test("assertGenerationInputWithinLimit rejects oversized text", () => {
  process.env.OPENAI_MAX_INPUT_CHARS = "1000";
  const oversizedText = "a".repeat(1001);

  assert.throws(
    () => {
      assertGenerationInputWithinLimit(oversizedText);
    },
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "DOCUMENT_TOO_LARGE_FOR_GENERATION");
      assert.equal(error.details?.max_chars, 1000);
      return true;
    }
  );
});

test("getGenerationMaxInputChars falls back for invalid env values", () => {
  process.env.OPENAI_MAX_INPUT_CHARS = "0";
  assert.equal(getGenerationMaxInputChars(), 120000);
});

test("normalizeUpstreamError preserves contract validation errors", () => {
  const error = new ContractValidationError("QUOTE_NOT_FOUND", "missing quote");
  assert.equal(normalizeUpstreamError(error), error);
});

test("normalizeUpstreamError preserves unknown errors", () => {
  const error = new Error("unknown");
  assert.equal(normalizeUpstreamError(error), error);
});
