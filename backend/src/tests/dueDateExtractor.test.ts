import test from "node:test";
import assert from "node:assert/strict";
import { extractDueDate, extractDueDeadline } from "../services/dueDateExtractor.js";

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

// ══════════════════════════════════════════════════════════════════════
// extractDueDeadline: date + time extraction
// ══════════════════════════════════════════════════════════════════════

test("extractDueDeadline: 'Due: 10/12/2025 at 11:59pm' → date + time", () => {
  const text = "Assignment instructions\nDue: 10/12/2025 at 11:59pm\nSubmit on Canvas.";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2025-10-12");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due: Oct 12, 2025 11:59 PM' → date + time", () => {
  const text = "Homework 3\nDue: Oct 12, 2025 11:59 PM\nLate penalty applies.";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2025-10-12");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due: 10/12/2025 23:59' → date + 24h time", () => {
  const text = "Due: 10/12/2025 23:59";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2025-10-12");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due: October 12, 2025 11:59pm' → date + time", () => {
  const text = "Due: October 12, 2025 11:59pm";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2025-10-12");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due: 10/12/2025 11:59 PM' → date + time with space", () => {
  const text = "Due: 10/12/2025 11:59 PM";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2025-10-12");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: date without time returns time = null", () => {
  const text = "Assignment due February 1, 2026. Submit on Canvas.";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-02-01");
  assert.equal(result.time, null);
});

test("extractDueDeadline: 'at 2:30am' → early morning time", () => {
  const text = "Due: 03/15/2026 at 2:30am";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "02:30");
});

test("extractDueDeadline: 12:00am → midnight = 00:00", () => {
  const text = "Due: 03/15/2026 at 12:00am";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "00:00");
});

test("extractDueDeadline: 12:00pm → noon = 12:00", () => {
  const text = "Due: 03/15/2026 at 12:00pm";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "12:00");
});

test("extractDueDeadline returns null for no date text", () => {
  assert.equal(extractDueDeadline("Lecture notes on algorithms"), null);
});

test("extractDueDeadline: 'Due Sunday, Mar 15 at 11:59 PM' uses nearby Spring year context", () => {
  const text =
    "EECS 4560 - Database Management Systems\n" +
    "Spring 2026 - Homework Set #6 - Due Sunday, Mar 15 at 11:59 PM";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due Mon, Mar 15 at 11:59 PM' supports abbreviated weekday", () => {
  const text = "Spring 2026 schedule\nDue Mon, Mar 15 at 11:59 PM";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due Mar 15 at 11:59 PM' supports omitted weekday", () => {
  const text = "Spring 2026 assignment\nDue Mar 15 at 11:59 PM";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'Due Sunday, March 15 at 11:59 PM' supports full month and weekday", () => {
  const text = "Spring 2026 assignment\nDue Sunday, March 15 at 11:59 PM";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-15");
  assert.equal(result.time, "23:59");
});

// ══════════════════════════════════════════════════════════════════════
// "due at <time> ... on <weekday>, <month> <day>, <year>" pattern
// ══════════════════════════════════════════════════════════════════════

test("extractDueDeadline: 'due at 1:30pm (beginning of class) on Wednesday, January 21, 2009'", () => {
  const text =
    "The assignment is due at 1:30pm (beginning of class) on Wednesday, January 21, 2009.";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2009-01-21");
  assert.equal(result.time, "13:30");
});

test("extractDueDeadline: 'due at 1:30pm on Wednesday, January 21, 2009' (no parenthetical)", () => {
  const text = "The assignment is due at 1:30pm on Wednesday, January 21, 2009";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2009-01-21");
  assert.equal(result.time, "13:30");
});

test("extractDueDeadline: 'Due at 5:00 PM on Monday, February 3, 2026'", () => {
  const text = "Due at 5:00 PM on Monday, February 3, 2026";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-02-03");
  assert.equal(result.time, "17:00");
});

test("extractDueDeadline: 'due at 11:59pm on Friday, Dec 20, 2025' with abbreviated month", () => {
  const text = "Homework is due at 11:59pm on Friday, Dec 20, 2025.";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2025-12-20");
  assert.equal(result.time, "23:59");
});

test("extractDueDeadline: 'due at 8:00 AM on March 1' (no year) infers year", () => {
  const text = "Spring 2026 course\nAssignment due at 8:00 AM on March 1";
  const result = extractDueDeadline(text);
  assert.ok(result, "Should extract a deadline");
  assert.equal(result.date, "2026-03-01");
  assert.equal(result.time, "08:00");
});
