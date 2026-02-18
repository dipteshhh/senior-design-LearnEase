import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCitationRequirements,
  buildRepairHint,
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

test("normalizeUpstreamError preserves contract validation errors", () => {
  const error = new ContractValidationError("QUOTE_NOT_FOUND", "missing quote");
  assert.equal(normalizeUpstreamError(error), error);
});

test("normalizeUpstreamError preserves unknown errors", () => {
  const error = new Error("unknown");
  assert.equal(normalizeUpstreamError(error), error);
});
