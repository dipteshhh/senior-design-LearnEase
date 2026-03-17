import test from "node:test";
import assert from "node:assert/strict";

/**
 * Mirrors the quiz page polling gate:
 * poll while document is processing OR while UI is still in loading state.
 */
function shouldPollQuizLoading(state: "idle" | "loading" | "ready" | "failed", quizStatus: "idle" | "processing" | "ready" | "failed"): boolean {
  const shouldPollWhileLoading = state === "loading";
  return shouldPollWhileLoading || quizStatus === "processing";
}

/**
 * Mirrors syncStateFromDocument behavior for the status transition branch.
 */
function deriveNextStateAfterDocumentRefresh(
  quizStatus: "idle" | "processing" | "ready" | "failed",
  didFetchQuizSucceed: boolean
): "loading" | "ready" | "failed" {
  if (quizStatus === "ready") {
    return didFetchQuizSucceed ? "ready" : "loading";
  }
  if (quizStatus === "failed") {
    return "failed";
  }
  return "loading";
}

test("polling continues while UI is loading even after document status becomes ready", () => {
  assert.equal(shouldPollQuizLoading("loading", "ready"), true);
});

test("polling continues while backend is processing", () => {
  assert.equal(shouldPollQuizLoading("idle", "processing"), true);
});

test("polling stops when not loading and backend is not processing", () => {
  assert.equal(shouldPollQuizLoading("idle", "ready"), false);
});

test("status ready + successful quiz fetch transitions to ready", () => {
  assert.equal(deriveNextStateAfterDocumentRefresh("ready", true), "ready");
});

test("status ready + quiz fetch miss keeps loading (no stuck idle state)", () => {
  assert.equal(deriveNextStateAfterDocumentRefresh("ready", false), "loading");
});

test("status failed transitions to failed", () => {
  assert.equal(deriveNextStateAfterDocumentRefresh("failed", false), "failed");
});

