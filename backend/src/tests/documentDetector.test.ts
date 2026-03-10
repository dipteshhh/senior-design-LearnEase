import test from "node:test";
import assert from "node:assert/strict";
import { detectDocumentType } from "../services/documentDetector.js";

// ── First-match-wins basics (per CLASSIFICATION.md §2) ──────────────

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

test("classifier returns unsupported for generic text with no triggers", () => {
  const text = "The quick brown fox jumped over the lazy dog.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

// ── Single-trigger classification (per CLASSIFICATION.md §2) ────────

test("single trigger 'slides' classifies as LECTURE", () => {
  const text = "Slides for today's session on data structures.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("single trigger 'grading' classifies as SYLLABUS", () => {
  const text = "Course grading breakdown and policies.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "SYLLABUS");
});

test("single trigger 'week' classifies as LECTURE", () => {
  const text = "Week 5: Introduction to algorithms.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

// ── Documents with no triggers → UNSUPPORTED ────────────────────────

test("project report with no triggers is UNSUPPORTED", () => {
  const text =
    "Project Report: Database Design and Implementation. Results and analysis included.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("research paper with no triggers is UNSUPPORTED", () => {
  const text =
    "Research paper on machine learning. This covers related work and conclusions.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

// ── Mixed-signal documents: trigger present → classified per spec ────
// Per CLASSIFICATION.md, any listed trigger is sufficient.
// Documents whose *topic* is out-of-scope but contain a valid trigger
// are classified by the trigger. This is a known limitation of the
// keyword-based classifier documented in CLASSIFICATION.md §3.

test("project report with 'submit' and 'due date' classifies as HOMEWORK", () => {
  const text =
    "Project Report: Database Design. Submit your project report by the due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
});

test("research paper with 'assignment' classifies as HOMEWORK", () => {
  const text =
    "Research paper assignment. Submit your draft by due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
});

test("lecture slides on case study classifies as LECTURE", () => {
  const text = "Lecture slides on case study analysis.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("capstone project assignment classifies as HOMEWORK", () => {
  const text =
    "Capstone project assignment 1. Submit by due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
});

test("capstone project syllabus classifies as SYLLABUS", () => {
  const text =
    "Capstone Project Syllabus with grading and office hours.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "SYLLABUS");
});

test("homework mentioning thesis statement classifies as HOMEWORK", () => {
  const text =
    "Homework: Write a thesis statement and submit by due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("technical report writing lecture classifies as LECTURE", () => {
  const text =
    "Technical report writing lecture slides for week 2.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

