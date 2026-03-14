import test from "node:test";
import assert from "node:assert/strict";
import { classifyWithLlm } from "../services/llmClassifier.js";

// ── Mock OpenAI client ──────────────────────────────────────────────

function mockOpenAiClient(responseContent: string) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: responseContent } }],
        }),
      },
    },
  } as any;
}

function mockOpenAiClientThatThrows(error: Error) {
  return {
    chat: {
      completions: {
        create: async () => { throw error; },
      },
    },
  } as any;
}

// ── LLM returns supported types correctly ───────────────────────────

test("LLM classifier returns HOMEWORK when LLM says HOMEWORK", async () => {
  const client = mockOpenAiClient("HOMEWORK");
  const result = await classifyWithLlm("Homework assignment due date.", client);
  assert.equal(result.llmDocumentType, "HOMEWORK");
  assert.equal(result.disagreement, false);
});

test("LLM classifier returns LECTURE when LLM says LECTURE", async () => {
  const client = mockOpenAiClient("LECTURE");
  const result = await classifyWithLlm("Lecture slides for module week.", client);
  assert.equal(result.llmDocumentType, "LECTURE");
  assert.equal(result.disagreement, false);
});

test("LLM classifier returns UNSUPPORTED for syllabus content", async () => {
  const client = mockOpenAiClient("UNSUPPORTED");
  const result = await classifyWithLlm("Course syllabus with grading and office hours.", client);
  assert.equal(result.llmDocumentType, "UNSUPPORTED");
  assert.equal(result.localDetection.documentType, "UNSUPPORTED");
  assert.equal(result.disagreement, false);
});

test("LLM classifier rejects SYLLABUS as unexpected value", async () => {
  const client = mockOpenAiClient("SYLLABUS");
  const text = "Course syllabus with grading and office hours.";
  await assert.rejects(
    () => classifyWithLlm(text, client),
    (err: Error) => {
      assert.match(err.message, /unexpected value/i);
      return true;
    }
  );
});

// ── LLM rejects out-of-scope documents that local classifier misses ─

test("LLM classifier returns UNSUPPORTED for project report with trigger words", async () => {
  const client = mockOpenAiClient("UNSUPPORTED");
  const text = "Project Report: Database Design. Submit your project report by the due date.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "UNSUPPORTED");
  assert.equal(result.localDetection.documentType, "UNSUPPORTED");
  assert.equal(result.disagreement, false);
});

test("LLM classifier returns UNSUPPORTED for research paper assignment", async () => {
  const client = mockOpenAiClient("UNSUPPORTED");
  const text = "Research paper assignment. Submit your draft by due date.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "UNSUPPORTED");
  assert.equal(result.localDetection.documentType, "UNSUPPORTED");
  assert.equal(result.disagreement, false);
});

test("LLM classifier returns UNSUPPORTED for lab report with homework words", async () => {
  const client = mockOpenAiClient("UNSUPPORTED");
  const text = "Lab report assignment due date and submit instructions.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "UNSUPPORTED");
  assert.equal(result.localDetection.documentType, "UNSUPPORTED");
  assert.equal(result.disagreement, false);
});

test("LLM classifier returns LECTURE for lecture about case study", async () => {
  const client = mockOpenAiClient("LECTURE");
  const text = "Lecture slides on case study analysis.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "LECTURE");
  assert.equal(result.disagreement, false);
});

// ── Fail-closed behavior ────────────────────────────────────────────

test("LLM classifier throws when LLM returns unexpected value", async () => {
  const client = mockOpenAiClient("UNKNOWN_TYPE");
  const text = "Homework assignment due date.";
  await assert.rejects(
    () => classifyWithLlm(text, client),
    (err: Error) => {
      assert.match(err.message, /unexpected value/i);
      return true;
    }
  );
});

test("LLM classifier throws when LLM call fails", async () => {
  const client = mockOpenAiClientThatThrows(new Error("API timeout"));
  const text = "Lecture slides for module week.";
  await assert.rejects(
    () => classifyWithLlm(text, client),
    (err: Error) => {
      assert.equal(err.message, "API timeout");
      return true;
    }
  );
});

test("LLM classifier throws when LLM returns empty", async () => {
  const client = mockOpenAiClient("");
  const text = "Course syllabus with grading.";
  await assert.rejects(
    () => classifyWithLlm(text, client),
    (err: Error) => {
      assert.match(err.message, /unexpected value/i);
      return true;
    }
  );
});

// ── Disagreement tracking ───────────────────────────────────────────

test("disagreement is true when LLM and local classifier disagree", async () => {
  const client = mockOpenAiClient("UNSUPPORTED");
  const text = "Homework assignment due date.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "UNSUPPORTED");
  assert.equal(result.localDetection.documentType, "HOMEWORK");
  assert.equal(result.disagreement, true);
});

test("disagreement is false when LLM and local classifier agree", async () => {
  const client = mockOpenAiClient("HOMEWORK");
  const text = "Homework assignment due date.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "HOMEWORK");
  assert.equal(result.localDetection.documentType, "HOMEWORK");
  assert.equal(result.disagreement, false);
});
