import test from "node:test";
import assert from "node:assert/strict";
import { detectDocumentType } from "../services/documentDetector.js";

test("classifier uses first-match-wins with syllabus priority", () => {
  const text =
    "Course syllabus with grading and office hours includes assignment details and lecture week outline.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "SYLLABUS");
  assert.equal(result.isAssignment, false);
});

test("classifier detects homework after syllabus check", () => {
  const text = "Homework assignment due date and submit instructions.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("classifier detects lecture when homework and syllabus triggers are absent", () => {
  const text = "Lecture slides for module week chapter learning objectives.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("classifier returns unsupported for empty input", () => {
  const result = detectDocumentType("   ");
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

