/**
 * Tests for normalizeModelOutput — citation array wrapping + document_type casing.
 * These are pure-function unit tests with no OpenAI dependency.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { StudyGuide } from "../schemas/analyze.js";

// OpenAI client is created at module scope; provide a dummy key so import succeeds.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const { normalizeModelOutput, repairStudyGuideGrounding } = await import("../services/contentAnalyzer.js");
const { validateStudyGuideAgainstDocument } = await import("../services/outputValidator.js");

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
  const input = { overview: { document_type: "lecture", title: "T", summary: "S" } };
  const result = normalizeModelOutput(input) as Record<string, unknown>;
  const overview = result.overview as Record<string, unknown>;
  assert.equal(overview.document_type, "LECTURE");
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

test("repairStudyGuideGrounding replaces close paraphrased evidence with extracted text", () => {
  const text =
    "Client/Server-Based Computing. As its name implies SQL Server is a database server. " +
    "A server resides on the network and provides services to clients. " +
    "Applications use SQL queries to request query results.";
  const paraphrasedEvidence = "SQL Server is a database server that provides services to clients.";
  const guide: StudyGuide = {
    overview: {
      title: "SQL Server Introduction",
      document_type: "LECTURE",
      summary: "Intro content.",
    },
    key_actions: [
      {
        id: "ka1",
        label: "Review client/server computing",
        supporting_quote: paraphrasedEvidence,
        citations: [{ source_type: "pdf", page: 1, excerpt: paraphrasedEvidence }],
        group: null,
      },
    ],
    checklist: [],
    important_details: {
      dates: [],
      policies: [],
      contacts: [],
      logistics: [],
    },
    sections: [
      {
        id: "s1",
        title: "Client Server Computing",
        content: "SQL Server runs as a database server.",
        citations: [{ source_type: "pdf", page: 1, excerpt: paraphrasedEvidence }],
      },
    ],
  };

  const repaired = repairStudyGuideGrounding(guide, {
    text,
    fileType: "PDF",
    pageCount: 1,
    paragraphCount: null,
  });

  assert.notEqual(repaired.key_actions[0].supporting_quote, paraphrasedEvidence);
  assert.match(repaired.key_actions[0].supporting_quote, /As its name implies SQL Server/);
  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(repaired, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});
