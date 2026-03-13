import test from "node:test";
import assert from "node:assert/strict";
import { extractDueDate } from "../services/dueDateExtractor.js";

// ── Pattern: "due <Month> <Day>, <Year>" ────────────────────────────

test("extracts due date from 'due February 1, 2026'", () => {
  const text = "Homework assignment due February 1, 2026. Submit on Canvas.";
  assert.equal(extractDueDate(text), "2026-02-01");
});

test("extracts due date from 'Due Date: March 15, 2026'", () => {
  const text = "Assignment 3\nDue Date: March 15, 2026\nInstructions below.";
  assert.equal(extractDueDate(text), "2026-03-15");
});

test("extracts due date from 'deadline: December 20, 2026'", () => {
  const text = "Final project deadline: December 20, 2026.";
  assert.equal(extractDueDate(text), "2026-12-20");
});

test("extracts due date with abbreviated month 'due Jan 5, 2026'", () => {
  const text = "Problem set due Jan 5, 2026.";
  assert.equal(extractDueDate(text), "2026-01-05");
});

// ── Pattern: "due <Month> <Day>" (no year) ──────────────────────────

test("extracts due date without year, infers year", () => {
  const text = "Homework due December 25.";
  const result = extractDueDate(text);
  assert.ok(result !== null, "Should extract a date");
  assert.ok(result!.endsWith("-12-25"), `Expected month 12, day 25, got ${result}`);
});

// ── Pattern: "due MM/DD/YYYY" ────────────────────────────────────────

test("extracts due date from 'due 02/01/2026'", () => {
  const text = "Assignment due 02/01/2026.";
  assert.equal(extractDueDate(text), "2026-02-01");
});

test("extracts due date from 'due date: 3/15/2026'", () => {
  const text = "Due date: 3/15/2026. Late submissions penalized.";
  assert.equal(extractDueDate(text), "2026-03-15");
});

test("extracts due date from 'deadline 12-20-2026'", () => {
  const text = "Deadline 12-20-2026.";
  assert.equal(extractDueDate(text), "2026-12-20");
});

// ── Pattern: "due MM/DD" (no year) ──────────────────────────────────

test("extracts due date from 'due 12/25' without year", () => {
  const text = "Assignment due 12/25.";
  const result = extractDueDate(text);
  assert.ok(result !== null, "Should extract a date");
  assert.ok(result!.endsWith("-12-25"), `Expected month 12, day 25, got ${result}`);
});

// ── No due date found ────────────────────────────────────────────────

test("returns null for text with no due date", () => {
  const text = "Lecture notes on data structures and algorithms.";
  assert.equal(extractDueDate(text), null);
});

test("returns null for empty text", () => {
  assert.equal(extractDueDate(""), null);
});

test("returns null for text with 'due' but no date pattern", () => {
  const text = "This is due to the complexity of the problem.";
  assert.equal(extractDueDate(text), null);
});

// ── Invalid dates are skipped ────────────────────────────────────────

test("returns null for invalid date like February 30", () => {
  const text = "Assignment due February 30, 2026.";
  assert.equal(extractDueDate(text), null);
});

// ── Ordinal suffixes ─────────────────────────────────────────────────

test("extracts due date with ordinal suffix 'due March 1st, 2026'", () => {
  const text = "Homework due March 1st, 2026.";
  assert.equal(extractDueDate(text), "2026-03-01");
});

test("extracts due date with ordinal suffix 'due April 2nd, 2026'", () => {
  const text = "Project due April 2nd, 2026.";
  assert.equal(extractDueDate(text), "2026-04-02");
});

test("extracts due date with ordinal suffix 'due May 3rd, 2026'", () => {
  const text = "Essay due May 3rd, 2026.";
  assert.equal(extractDueDate(text), "2026-05-03");
});

// ── LECTURE documents should not be fed to extractor ─────────────────
// (The extractor itself doesn't check document type; the route handler
//  gates on doc.documentType === "HOMEWORK" before calling extractDueDate.
//  We verify the extractor works on any text but returns null when no
//  deadline language is present.)

test("lecture text without deadline language returns null", () => {
  const text =
    "Chapter 5: Operating Systems. Topics covered include process scheduling, " +
    "memory management, and file systems. Week 7 slides.";
  assert.equal(extractDueDate(text), null);
});
