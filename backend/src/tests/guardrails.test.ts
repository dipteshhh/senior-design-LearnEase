import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldEnableGuidanceMode,
  getRestrictions,
  getPolicy,
} from "../services/guardrails.js";

test("HOMEWORK always enables guidance mode", () => {
  assert.equal(shouldEnableGuidanceMode("HOMEWORK", true), true);
  assert.equal(shouldEnableGuidanceMode("HOMEWORK", false), true);
});

test("LECTURE disables guidance mode unless isAssignment is true", () => {
  assert.equal(shouldEnableGuidanceMode("LECTURE", false), false);
  assert.equal(shouldEnableGuidanceMode("LECTURE", true), true);
});

test("SYLLABUS disables guidance mode unless isAssignment is true", () => {
  assert.equal(shouldEnableGuidanceMode("SYLLABUS", false), false);
  assert.equal(shouldEnableGuidanceMode("SYLLABUS", true), true);
});

test("UNSUPPORTED always enables guidance mode", () => {
  assert.equal(shouldEnableGuidanceMode("UNSUPPORTED", false), true);
  assert.equal(shouldEnableGuidanceMode("UNSUPPORTED", true), true);
});

test("HOMEWORK restrictions include no-answer rules", () => {
  const restrictions = getRestrictions("HOMEWORK", true);
  assert.ok(restrictions.length > 0);
  assert.ok(restrictions.some((r) => r.includes("No direct answers")));
  assert.ok(restrictions.some((r) => r.includes("No solved problems")));
});

test("LECTURE with guidance mode adds guidance restriction", () => {
  const withGuidance = getRestrictions("LECTURE", true);
  const withoutGuidance = getRestrictions("LECTURE", false);
  assert.ok(withGuidance.length > withoutGuidance.length);
  assert.ok(withGuidance.some((r) => r.includes("guidance mode")));
});

test("LECTURE without guidance mode has no restrictions", () => {
  const restrictions = getRestrictions("LECTURE", false);
  assert.equal(restrictions.length, 0);
});

test("getPolicy returns correct allowedOutputs for each type", () => {
  const hw = getPolicy("HOMEWORK");
  assert.equal(hw.allowedOutputs.includes("overview"), true);
  assert.equal(hw.guidanceMode, true);

  const lecture = getPolicy("LECTURE");
  assert.equal(lecture.guidanceMode, false);
  assert.equal(lecture.restrictions.length, 0);

  const syllabus = getPolicy("SYLLABUS");
  assert.equal(syllabus.guidanceMode, false);

  const unsupported = getPolicy("UNSUPPORTED");
  assert.equal(unsupported.guidanceMode, true);
  assert.deepEqual(unsupported.allowedOutputs, ["overview"]);
  assert.ok(unsupported.restrictions.length > 0);
});
