/**
 * Tests for the state-derivation logic used by the processing page.
 *
 * The processing page derives `isUnsupported` from either the stored
 * document type or the async failure code. These tests verify that the
 * derivation contract is correct for all relevant document states.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentListItem } from "../lib/contracts.ts";

// ── Helpers ─────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: "doc-1",
    filename: "test.pdf",
    document_type: "LECTURE",
    status: "uploaded",
    study_guide_status: "idle",
    quiz_status: "idle",
    page_count: 5,
    uploaded_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
    has_study_guide: false,
    has_quiz: false,
    assignment_due_date: null,
    assignment_due_time: null,
    reminder_status: null,
    ...overrides,
  };
}

/** Mirrors the derivation in ProcessingPage */
function deriveIsUnsupported(doc: DocumentListItem | null): boolean {
  return (
    doc?.document_type === "UNSUPPORTED" ||
    doc?.error_code === "DOCUMENT_UNSUPPORTED"
  );
}

function deriveIsFailed(doc: DocumentListItem | null): boolean {
  return doc?.study_guide_status === "failed";
}

const STEP_SEQUENCE_THRESHOLDS_MS = [900, 1_800, 2_800, 3_900] as const;
const STEP_SEQUENCE_MIN_MS = 5_200;

function deriveVisualReady(
  doc: DocumentListItem | null,
  elapsedMs: number,
): boolean {
  return doc?.study_guide_status === "ready" && elapsedMs >= STEP_SEQUENCE_MIN_MS;
}

function deriveVisualStepIndex(
  doc: DocumentListItem | null,
  elapsedMs: number,
): number {
  if (deriveVisualReady(doc, elapsedMs)) return 5;
  if (deriveIsFailed(doc)) return 3;
  if (!doc || doc.study_guide_status === "idle") return 0;
  if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[0]) return 1;
  if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[1]) return 2;
  if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[2]) return 3;
  if (elapsedMs < STEP_SEQUENCE_THRESHOLDS_MS[3]) return 4;
  return 5;
}

// ── Unsupported derivation ──────────────────────────────────────────

test("isUnsupported is true when error_code is DOCUMENT_UNSUPPORTED", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "DOCUMENT_UNSUPPORTED",
    error_message: "Document type is not supported for generation.",
  });
  assert.equal(deriveIsUnsupported(doc), true);
});

test("isUnsupported is false for generic failed documents", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "SCHEMA_VALIDATION_FAILED",
    error_message: "Generated output failed validation.",
  });
  assert.equal(deriveIsUnsupported(doc), false);
});

test("isUnsupported is false when document is null", () => {
  assert.equal(deriveIsUnsupported(null), false);
});

test("isUnsupported is false for processing documents", () => {
  const doc = makeDoc({
    study_guide_status: "processing",
    status: "processing",
  });
  assert.equal(deriveIsUnsupported(doc), false);
});

test("isUnsupported is false for ready documents", () => {
  const doc = makeDoc({
    study_guide_status: "ready",
    status: "ready",
    has_study_guide: true,
  });
  assert.equal(deriveIsUnsupported(doc), false);
});

test("isUnsupported is true for unsupported uploads before generation starts", () => {
  const doc = makeDoc({
    document_type: "UNSUPPORTED",
    study_guide_status: "idle",
    status: "uploaded",
    error_code: null,
  });
  assert.equal(deriveIsUnsupported(doc), true);
});

// ── isFailed + isUnsupported interaction ────────────────────────────

test("unsupported documents are also failed (isFailed is true)", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "DOCUMENT_UNSUPPORTED",
  });
  assert.equal(deriveIsFailed(doc), true);
  assert.equal(deriveIsUnsupported(doc), true);
});

test("generic failed documents are failed but not unsupported", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "GENERATION_FAILED",
  });
  assert.equal(deriveIsFailed(doc), true);
  assert.equal(deriveIsUnsupported(doc), false);
});

// ── Polling branch contract ─────────────────────────────────────────

test("polling failed branch: DOCUMENT_UNSUPPORTED gets distinct message", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "DOCUMENT_UNSUPPORTED",
    error_message: "Document type is not supported for generation.",
  });

  // Mirrors the polling logic in ProcessingPage
  let errorMessage: string;
  if (doc.error_code === "DOCUMENT_UNSUPPORTED") {
    errorMessage = "This document type is not supported for study guide generation.";
  } else {
    errorMessage = doc.error_message ?? "Study guide generation failed.";
  }

  assert.equal(errorMessage, "This document type is not supported for study guide generation.");
});

test("polling failed branch: generic failure uses error_message from server", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "SCHEMA_VALIDATION_FAILED",
    error_message: "Generated output failed validation. Retry generation.",
  });

  let errorMessage: string;
  if (doc.error_code === "DOCUMENT_UNSUPPORTED") {
    errorMessage = "This document type is not supported for study guide generation.";
  } else {
    errorMessage = doc.error_message ?? "Study guide generation failed.";
  }

  assert.equal(errorMessage, "Generated output failed validation. Retry generation.");
});

test("polling failed branch: null error_message falls back to generic string", () => {
  const doc = makeDoc({
    study_guide_status: "failed",
    status: "failed",
    error_code: "GENERATION_FAILED",
    error_message: null,
  });

  let errorMessage: string;
  if (doc.error_code === "DOCUMENT_UNSUPPORTED") {
    errorMessage = "This document type is not supported for study guide generation.";
  } else {
    errorMessage = doc.error_message ?? "Study guide generation failed.";
  }

  assert.equal(errorMessage, "Study guide generation failed.");
});

test("ready documents stay in visual processing mode until the local sequence finishes", () => {
  const doc = makeDoc({
    study_guide_status: "ready",
    status: "ready",
    has_study_guide: true,
  });

  assert.equal(deriveVisualReady(doc, 2_000), false);
  assert.equal(deriveVisualStepIndex(doc, 2_000), 3);
});

test("ready documents become visually complete after the full five-step sequence", () => {
  const doc = makeDoc({
    study_guide_status: "ready",
    status: "ready",
    has_study_guide: true,
  });

  assert.equal(deriveVisualReady(doc, STEP_SEQUENCE_MIN_MS), true);
  assert.equal(deriveVisualStepIndex(doc, STEP_SEQUENCE_MIN_MS), 5);
});
