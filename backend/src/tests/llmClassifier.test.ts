import test from "node:test";
import assert from "node:assert/strict";
import { APIConnectionTimeoutError } from "openai/error";
import { classifyWithLlm } from "../services/llmClassifier.js";

function withClassifierFallbackEnabled<T>(fn: () => Promise<T>): Promise<T> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFallback = process.env.LLM_CLASSIFIER_ALLOW_LOCAL_FALLBACK;
  process.env.NODE_ENV = "production";
  process.env.LLM_CLASSIFIER_ALLOW_LOCAL_FALLBACK = "true";

  return fn().finally(() => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousFallback === undefined) {
      delete process.env.LLM_CLASSIFIER_ALLOW_LOCAL_FALLBACK;
    } else {
      process.env.LLM_CLASSIFIER_ALLOW_LOCAL_FALLBACK = previousFallback;
    }
  });
}

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

function mockOpenAiClientWithCreate(
  create: (params: any) => Promise<{ choices: [{ message: { content: string } }] }>
) {
  return {
    chat: {
      completions: {
        create,
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

test("LLM classifier returns HOMEWORK for research paper assignment sheet", async () => {
  const client = mockOpenAiClient("HOMEWORK");
  const text =
    "Instructions for Research Paper: English 1110. " +
    "You will write a four-page research paper on the controversial topic that you have already chosen. " +
    "Your research paper must contain the following elements: an introduction, body paragraphs, parenthetical documentation, and a concluding paragraph. " +
    "Grading Rubric for Research Project.";
  const result = await classifyWithLlm(text, client);
  assert.equal(result.llmDocumentType, "HOMEWORK");
  assert.equal(result.localDetection.documentType, "HOMEWORK");
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

test("LLM classifier falls back to local supported type on transient provider failure", async () => {
  const client = mockOpenAiClientThatThrows(new APIConnectionTimeoutError());
  const text = "Homework assignment due date.";
  const result = await withClassifierFallbackEnabled(() => classifyWithLlm(text, client));

  assert.equal(result.llmDocumentType, "HOMEWORK");
  assert.equal(result.localDetection.documentType, "HOMEWORK");
  assert.equal(result.disagreement, false);
  assert.equal(result.usedLocalFallback, true);
});

test("LLM classifier still fails closed for locally unsupported documents", async () => {
  const client = mockOpenAiClientThatThrows(new APIConnectionTimeoutError());
  const text = "Course syllabus with grading and office hours.";

  await assert.rejects(
    () => withClassifierFallbackEnabled(() => classifyWithLlm(text, client)),
    (err: Error) => {
      assert.equal(err.message, "Request timed out.");
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

test("LLM classifier prompt explains that paper/report assignment sheets are HOMEWORK", async () => {
  let systemPrompt = "";
  const client = mockOpenAiClientWithCreate(async (params) => {
    systemPrompt = String(params.messages?.[0]?.content ?? "");
    return {
      choices: [{ message: { content: "HOMEWORK" } }],
    };
  });

  const text =
    "Instructions for Research Paper: English 1110. You will write a four-page research paper. Grading Rubric for Research Project.";
  await classifyWithLlm(text, client);

  assert.match(
    systemPrompt,
    /assignment sheet or instructions that tell students to write a research paper, summary, lab report, or project report is HOMEWORK/i
  );
});
