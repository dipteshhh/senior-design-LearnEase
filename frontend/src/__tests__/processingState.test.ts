/**
 * Tests for the state-derivation logic used by the processing page.
 *
 * The processing page derives `isUnsupported` from either the stored
 * document type or the async failure code, and uses `computePacedProgress`
 * (from `pacedProgress.ts`) for all step and percentage derivation.
 *
 * These tests verify both the unsupported/failed derivation contract and
 * the paced-progress pure function for all relevant states.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentListItem } from "../lib/contracts.ts";
import { computePacedProgress } from "../lib/pacedProgress.ts";

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
    reminder_opt_in: false,
    reminder_status: null,
    ...overrides,
  };
}

const STEP_LABELS = [
  "Extracting text from document",
  "Analyzing structure and sections",
  "Identifying key concepts",
  "Generating action items",
  "Creating study materials",
] as const;

const DEFAULT_CONFIG = { stepLabels: STEP_LABELS };

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

// ── computePacedProgress ────────────────────────────────────────────

test("paced progress: at 0 ms processing, step 1 is active", () => {
  const result = computePacedProgress(0, false, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  assert.equal(result.visualStepIndex, 1);
  assert.equal(result.steps[0].state, "active");
  assert.equal(result.steps[1].state, "pending");
});

test("paced progress: at 10s processing, not all steps are complete yet", () => {
  const result = computePacedProgress(10_000, false, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  // At 10s with default tau=25000, fraction ≈ 0.92 * (1 - e^(-0.4)) ≈ 0.92 * 0.33 ≈ 0.30
  // So should be around step 2 or 3, NOT step 5
  assert.ok(result.visualStepIndex <= 3, `expected step ≤ 3 at 10s, got ${result.visualStepIndex}`);
  assert.ok(result.percent < 40, `expected percent < 40 at 10s, got ${result.percent}`);
});

test("paced progress: at 25s processing, progress is roughly mid-range", () => {
  const result = computePacedProgress(25_000, false, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  // At 25s, fraction ≈ 0.92 * (1 - e^(-1)) ≈ 0.92 * 0.632 ≈ 0.58
  assert.ok(result.percent >= 45 && result.percent <= 70,
    `expected percent 45–70 at 25s, got ${result.percent}`);
});

test("paced progress: at 50s processing, still below max", () => {
  const result = computePacedProgress(50_000, false, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  assert.ok(result.percent < 92, `expected percent < 92 at 50s, got ${result.percent}`);
  assert.ok(result.percent >= 70, `expected percent >= 70 at 50s, got ${result.percent}`);
});

test("paced progress: never reaches 100% while only processing", () => {
  const result = computePacedProgress(120_000, false, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  assert.ok(result.percent < 100, `expected percent < 100 at 120s, got ${result.percent}`);
});

test("paced progress: failed state halts at step 3 with correct states", () => {
  const result = computePacedProgress(5_000, false, true, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  assert.equal(result.steps[0].state, "complete");
  assert.equal(result.steps[1].state, "complete");
  assert.equal(result.steps[2].state, "halted");
  assert.equal(result.steps[3].state, "pending");
  assert.equal(result.steps[4].state, "pending");
});

test("paced progress: ready before minSequenceMs holds visual ready", () => {
  const result = computePacedProgress(1_000, true, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, false);
  assert.ok(result.percent < 100, `expected percent < 100, got ${result.percent}`);
});

test("paced progress: ready after minSequenceMs becomes visually ready", () => {
  const result = computePacedProgress(3_500, true, false, DEFAULT_CONFIG);
  assert.equal(result.isVisuallyReady, true);
  assert.equal(result.percent, 100);
  assert.ok(result.steps.every((s) => s.state === "complete"));
});

test("paced progress: steps progress monotonically over time", () => {
  let prevIndex = 0;
  let prevPercent = 0;

  for (let ms = 0; ms <= 60_000; ms += 2_000) {
    const result = computePacedProgress(ms, false, false, DEFAULT_CONFIG);
    assert.ok(result.visualStepIndex >= prevIndex,
      `step index should not decrease at ${ms}ms: ${result.visualStepIndex} < ${prevIndex}`);
    assert.ok(result.percent >= prevPercent,
      `percent should not decrease at ${ms}ms: ${result.percent} < ${prevPercent}`);
    prevIndex = result.visualStepIndex;
    prevPercent = result.percent;
  }
});
