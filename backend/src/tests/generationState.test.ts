import test from "node:test";
import assert from "node:assert/strict";
import {
  FLOW_PROCESSING_CODE,
  isFlowFailed,
  isFlowProcessing,
  makeFlowFailureCode,
} from "../services/generationState.js";

test("flow processing code map is stable", () => {
  assert.equal(FLOW_PROCESSING_CODE.STUDY_GUIDE, "STUDY_GUIDE_PROCESSING");
  assert.equal(FLOW_PROCESSING_CODE.QUIZ, "QUIZ_PROCESSING");
});

test("isFlowProcessing only matches the active flow marker", () => {
  assert.equal(isFlowProcessing("processing", "STUDY_GUIDE_PROCESSING", "STUDY_GUIDE"), true);
  assert.equal(isFlowProcessing("processing", "QUIZ_PROCESSING", "STUDY_GUIDE"), false);
  assert.equal(isFlowProcessing("processing", "QUIZ_PROCESSING", "QUIZ"), true);
  assert.equal(isFlowProcessing("ready", "QUIZ_PROCESSING", "QUIZ"), false);
});

test("isFlowFailed is flow-scoped and prevents cross-flow blocking", () => {
  const quizFailure = makeFlowFailureCode("QUIZ", "SCHEMA_VALIDATION_FAILED");
  const guideFailure = makeFlowFailureCode("STUDY_GUIDE", "QUOTE_NOT_FOUND");

  assert.equal(isFlowFailed("failed", quizFailure, "QUIZ"), true);
  assert.equal(isFlowFailed("failed", quizFailure, "STUDY_GUIDE"), false);
  assert.equal(isFlowFailed("failed", guideFailure, "STUDY_GUIDE"), true);
  assert.equal(isFlowFailed("failed", guideFailure, "QUIZ"), false);
  assert.equal(isFlowFailed("ready", guideFailure, "STUDY_GUIDE"), false);
});

