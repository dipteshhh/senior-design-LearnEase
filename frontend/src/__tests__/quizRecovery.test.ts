/**
 * Tests for the quiz failed-state recovery logic.
 *
 * When the quiz page shows the "failed" UI, the retry button must pick
 * the correct backend flow:
 *   - /api/quiz/retry  (handleRetry)  — only valid when backend quizStatus === "failed"
 *   - /api/quiz/create (handleStart)  — safe fallback for all other statuses
 *
 * Using the wrong path when quizStatus is still "idle" causes an
 * ILLEGAL_RETRY_STATE loop. These tests verify the derivation mirrors
 * the component logic in quiz/page.tsx.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { DocumentListItem, GenerationStatus } from "../lib/contracts.ts";

// ── Helpers ─────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: "doc-1",
    filename: "lecture.pdf",
    document_type: "LECTURE",
    status: "ready",
    study_guide_status: "ready",
    quiz_status: "idle",
    page_count: 10,
    uploaded_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
    has_study_guide: true,
    has_quiz: false,
    assignment_due_date: null,
    assignment_due_time: null,
    reminder_opt_in: false,
    reminder_status: null,
    ...overrides,
  };
}

/**
 * Mirrors the recovery decision in quiz/page.tsx (state === "failed" branch).
 * Returns "retry" when the backend recorded a failure, "create" otherwise.
 */
function deriveRecoveryFlow(
  doc: DocumentListItem | null
): "retry" | "create" {
  const canRetry = doc?.quiz_status === "failed";
  return canRetry ? "retry" : "create";
}

/**
 * Mirrors the retryInProgress indicator: uses isRetrying when canRetry,
 * isStarting otherwise.
 */
function deriveRetryInProgress(
  doc: DocumentListItem | null,
  isRetrying: boolean,
  isStarting: boolean,
): boolean {
  const canRetry = doc?.quiz_status === "failed";
  return canRetry ? isRetrying : isStarting;
}

// ── Recovery flow selection ─────────────────────────────────────────

test("recovery uses create when quiz_status is idle (auto-start failed before backend transition)", () => {
  const doc = makeDoc({ quiz_status: "idle" });
  assert.equal(deriveRecoveryFlow(doc), "create");
});

test("recovery uses retry when quiz_status is failed (backend recorded failure)", () => {
  const doc = makeDoc({ quiz_status: "failed" });
  assert.equal(deriveRecoveryFlow(doc), "retry");
});

test("recovery uses create when quiz_status is processing (transient error during generation)", () => {
  const doc = makeDoc({ quiz_status: "processing" });
  assert.equal(deriveRecoveryFlow(doc), "create");
});

test("recovery uses create when quiz_status is ready (edge case: quiz exists but fetch failed)", () => {
  const doc = makeDoc({ quiz_status: "ready", has_quiz: true });
  assert.equal(deriveRecoveryFlow(doc), "create");
});

test("recovery uses create when doc is null (document fetch itself failed)", () => {
  assert.equal(deriveRecoveryFlow(null), "create");
});

// ── Loading indicator reflects the active operation ─────────────────

test("retryInProgress reflects isRetrying when recovery flow is retry", () => {
  const doc = makeDoc({ quiz_status: "failed" });
  assert.equal(deriveRetryInProgress(doc, true, false), true);
  assert.equal(deriveRetryInProgress(doc, false, true), false);
});

test("retryInProgress reflects isStarting when recovery flow is create", () => {
  const doc = makeDoc({ quiz_status: "idle" });
  assert.equal(deriveRetryInProgress(doc, true, false), false);
  assert.equal(deriveRetryInProgress(doc, false, true), true);
});

test("retryInProgress is false when neither operation is in progress", () => {
  const idleDoc = makeDoc({ quiz_status: "idle" });
  const failedDoc = makeDoc({ quiz_status: "failed" });
  assert.equal(deriveRetryInProgress(idleDoc, false, false), false);
  assert.equal(deriveRetryInProgress(failedDoc, false, false), false);
});

// ── Exhaustive quiz_status coverage ─────────────────────────────────

test("recovery flow for every GenerationStatus value", () => {
  const statuses: GenerationStatus[] = ["idle", "processing", "ready", "failed"];
  const expected: Record<GenerationStatus, "retry" | "create"> = {
    idle: "create",
    processing: "create",
    ready: "create",
    failed: "retry",
  };

  for (const status of statuses) {
    const doc = makeDoc({ quiz_status: status });
    assert.equal(
      deriveRecoveryFlow(doc),
      expected[status],
      `quiz_status="${status}" should use "${expected[status]}" flow`
    );
  }
});
