import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_POLL_DELAY_MS,
  shouldResetQuizStateOnFlowStart,
  shouldRunPolling,
  toPollDelayMs,
} from "../lib/polling.ts";

test("shouldRunPolling pauses polling when the page is hidden", () => {
  assert.equal(shouldRunPolling("doc-123", false, true), false);
});

test("shouldRunPolling does not start polling without a document id", () => {
  assert.equal(shouldRunPolling("", true, true), false);
});

test("shouldRunPolling resumes polling when id exists and page is visible", () => {
  assert.equal(shouldRunPolling("doc-123", true, true), true);
});

test("shouldRunPolling stays paused until generation is actively processing", () => {
  assert.equal(shouldRunPolling("doc-123", true, false), false);
});

test("shouldResetQuizStateOnFlowStart keeps in-progress quiz state after visibility changes", () => {
  assert.equal(shouldResetQuizStateOnFlowStart(true), false);
});

test("shouldResetQuizStateOnFlowStart initializes state when quiz has not loaded yet", () => {
  assert.equal(shouldResetQuizStateOnFlowStart(false), true);
});

test("toPollDelayMs keeps existing default behavior", () => {
  assert.equal(toPollDelayMs(null), DEFAULT_POLL_DELAY_MS);
  assert.equal(toPollDelayMs(2.9), 2900);
  assert.equal(toPollDelayMs(-2), 0);
});
