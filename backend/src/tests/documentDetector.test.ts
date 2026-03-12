import test from "node:test";
import assert from "node:assert/strict";
import { detectDocumentType } from "../services/documentDetector.js";

// ── First-match-wins basics (per CLASSIFICATION.md §2) ──────────────

test("classifier rejects syllabus as UNSUPPORTED", () => {
  const text =
    "Course syllabus with grading and office hours includes assignment details and lecture week outline.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
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

test("single trigger 'grading' is no longer a supported trigger", () => {
  const text = "Course grading breakdown and policies.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
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

test("capstone project syllabus classifies as UNSUPPORTED", () => {
  const text =
    "Capstone Project Syllabus with grading and office hours.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
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

// ── Class notes acceptance (normalized to LECTURE) ───────────────────

test("class notes document classifies as LECTURE", () => {
  const text = "Class notes for Introduction to Psychology.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("course notes document classifies as LECTURE", () => {
  const text = "Course notes on database design principles.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("notes: prefix classifies as LECTURE", () => {
  const text = "Notes: key concepts from today's biology session.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

// ── Negative trigger rejection ──────────────────────────────────────

test("resume is rejected as UNSUPPORTED", () => {
  const text = "Resume: John Smith. Experience in software engineering.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("portfolio is rejected as UNSUPPORTED", () => {
  const text = "Portfolio of design work and creative projects.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("cover letter is rejected as UNSUPPORTED", () => {
  const text = "Cover letter for the position of software engineer.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("letter of recommendation is rejected as UNSUPPORTED", () => {
  const text = "Letter of recommendation for Jane Doe.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("academic transcript is rejected as UNSUPPORTED", () => {
  const text = "Academic Transcript. Official transcript with cumulative GPA and grade points.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("invoice is rejected as UNSUPPORTED", () => {
  const text = "Invoice number 1042. Billing statement with amount due.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("class schedule is rejected as UNSUPPORTED", () => {
  const text = "Class schedule for Fall 2025 semester.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("course schedule is rejected as UNSUPPORTED", () => {
  const text = "Course schedule with weekly topics and exam dates.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("syllabi plural is rejected as UNSUPPORTED", () => {
  const text = "Collection of syllabi for the department.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

// ── Negative triggers take priority over positive triggers ──────────

test("syllabus with lecture triggers is still UNSUPPORTED", () => {
  const text = "Course syllabus including lecture schedule for each week.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("academic transcript with lecture triggers is still UNSUPPORTED", () => {
  const text = "Official transcript with cumulative GPA and lecture schedule notes.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("homework mentioning office hours is still HOMEWORK", () => {
  const text = "Homework 2. Submit by due date. Office hours are posted separately.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
});
