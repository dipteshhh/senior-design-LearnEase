/**
 * Tests for normalizeModelOutput — citation array wrapping + document_type casing.
 * These are pure-function unit tests with no OpenAI dependency.
 */
import test from "node:test";
import assert from "node:assert/strict";

// OpenAI client is created at module scope; provide a dummy key so import succeeds.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const { normalizeModelOutput } = await import("../services/contentAnalyzer.js");

// ---------------------------------------------------------------------------
// 1. normalizeModelOutput unit tests
// ---------------------------------------------------------------------------

test("normalizeModelOutput wraps bare citation object in array", () => {
  const input = {
    id: "a1",
    label: "Item",
    supporting_quote: "quote",
    citations: { source_type: "pdf", page: 1, excerpt: "text" },
  };
  const result = normalizeModelOutput(input) as Record<string, unknown>;
  assert.ok(Array.isArray(result.citations));
  assert.equal((result.citations as unknown[]).length, 1);
});

test("normalizeModelOutput preserves citation arrays", () => {
  const input = {
    citations: [{ source_type: "pdf", page: 1, excerpt: "text" }],
  };
  const result = normalizeModelOutput(input) as Record<string, unknown>;
  assert.ok(Array.isArray(result.citations));
  assert.equal((result.citations as unknown[]).length, 1);
});

test("normalizeModelOutput uppercases known document_type values", () => {
  const input = { overview: { document_type: "syllabus", title: "T", summary: "S" } };
  const result = normalizeModelOutput(input) as Record<string, unknown>;
  const overview = result.overview as Record<string, unknown>;
  assert.equal(overview.document_type, "SYLLABUS");
});

test("normalizeModelOutput leaves unknown document_type values unchanged", () => {
  const input = { overview: { document_type: "ESSAY", title: "T", summary: "S" } };
  const result = normalizeModelOutput(input) as Record<string, unknown>;
  const overview = result.overview as Record<string, unknown>;
  assert.equal(overview.document_type, "ESSAY");
});

test("normalizeModelOutput handles mixed-case Homework", () => {
  const input = { overview: { document_type: "Homework" } };
  const result = normalizeModelOutput(input) as Record<string, unknown>;
  const overview = result.overview as Record<string, unknown>;
  assert.equal(overview.document_type, "HOMEWORK");
});

test("normalizeModelOutput recursively normalizes nested structures", () => {
  const input = {
    important_details: {
      dates: [
        {
          id: "d1",
          label: "Due",
          supporting_quote: "q",
          citations: { source_type: "pdf", page: 1, excerpt: "e" },
        },
      ],
    },
  };
  const result = normalizeModelOutput(input) as any;
  const dateCitations = result.important_details.dates[0].citations;
  assert.ok(Array.isArray(dateCitations));
  assert.equal(dateCitations.length, 1);
});

test("normalizeModelOutput handles null and primitives gracefully", () => {
  assert.equal(normalizeModelOutput(null), null);
  assert.equal(normalizeModelOutput(42), 42);
  assert.equal(normalizeModelOutput("hello"), "hello");
});
