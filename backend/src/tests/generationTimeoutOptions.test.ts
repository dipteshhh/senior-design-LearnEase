import test from "node:test";
import assert from "node:assert/strict";
import { ContractValidationError } from "../services/outputValidator.js";
import { resetCircuitBreakerStateForTests } from "../services/generationReliability.js";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";
const { analyzeDocument } = await import("../services/contentAnalyzer.js");
const { generateQuiz } = await import("../services/quizGenerator.js");

const RETRY_ENV_KEYS = [
  "OPENAI_GENERATION_MAX_ATTEMPTS",
  "OPENAI_TRANSIENT_BACKOFF_BASE_MS",
  "OPENAI_TRANSIENT_BACKOFF_MAX_MS",
  "OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD",
] as const;

function withRetryTestEnv(fn: () => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(
    RETRY_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof RETRY_ENV_KEYS)[number], string | undefined>;

  process.env.OPENAI_GENERATION_MAX_ATTEMPTS = "3";
  process.env.OPENAI_TRANSIENT_BACKOFF_BASE_MS = "0";
  process.env.OPENAI_TRANSIENT_BACKOFF_MAX_MS = "0";
  process.env.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD = "0";
  resetCircuitBreakerStateForTests();

  return fn().finally(() => {
    resetCircuitBreakerStateForTests();
    for (const key of RETRY_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });
}

test("analyzeDocument passes attempt-scaled timeout to OpenAI request options", async () => {
  await withRetryTestEnv(async () => {
    const capturedTimeouts: number[] = [];
    const responseFormatTypes: string[] = [];
    let calls = 0;

    const fakeClient = {
      chat: {
        completions: {
          async create(
            params: { response_format?: { type?: string } },
            options?: { timeout?: number }
          ) {
            calls += 1;
            capturedTimeouts.push(options?.timeout ?? -1);
            responseFormatTypes.push(params.response_format?.type ?? "missing");

            if (calls < 3) {
              throw new ContractValidationError("GENERATION_FAILED", "Transient upstream failure.");
            }

            const payload = {
              overview: {
                title: "Course Policies",
                document_type: "SYLLABUS",
                summary: "Syllabus summary.",
              },
              key_actions: [
                {
                  id: "a1",
                  label: "Review due date",
                  supporting_quote: "Assignment 1 is due on Friday.",
                  citations: [{ source_type: "pdf", page: 1, excerpt: "Assignment 1 is due on Friday." }],
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
                  title: "Deadlines",
                  content: "Review assignment deadlines from the syllabus.",
                  citations: [{ source_type: "pdf", page: 1, excerpt: "Assignment 1 is due on Friday." }],
                },
              ],
            };

            return {
              choices: [{ message: { content: JSON.stringify(payload) } }],
            } as any;
          },
        },
      },
    };

    const result = await analyzeDocument(
      "Assignment 1 is due on Friday.",
      "SYLLABUS",
      {
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      },
      fakeClient as any
    );

    assert.equal(result.overview.document_type, "SYLLABUS");
    assert.equal(calls, 3);
    assert.deepEqual(capturedTimeouts, [30000, 45000, 60000]);
    assert.deepEqual(responseFormatTypes, ["json_schema", "json_schema", "json_schema"]);
  });
});

test("generateQuiz passes attempt-scaled timeout to OpenAI request options", async () => {
  await withRetryTestEnv(async () => {
    const capturedTimeouts: number[] = [];
    const responseFormatTypes: string[] = [];
    let calls = 0;

    const fakeClient = {
      chat: {
        completions: {
          async create(
            params: { response_format?: { type?: string } },
            options?: { timeout?: number }
          ) {
            calls += 1;
            capturedTimeouts.push(options?.timeout ?? -1);
            responseFormatTypes.push(params.response_format?.type ?? "missing");

            if (calls < 3) {
              throw new ContractValidationError("GENERATION_FAILED", "Transient upstream failure.");
            }

            const payload = {
              document_id: "ignored-by-service",
              questions: [
                {
                  id: "q1",
                  question: "What does photosynthesis convert?",
                  options: ["Light", "Sound", "Heat", "Motion"],
                  answer: "Light",
                  supporting_quote: "Photosynthesis converts light into chemical energy.",
                  citations: [
                    {
                      source_type: "pdf",
                      page: 1,
                      excerpt: "Photosynthesis converts light into chemical energy.",
                    },
                  ],
                },
              ],
            };

            return {
              choices: [{ message: { content: JSON.stringify(payload) } }],
            } as any;
          },
        },
      },
    };

    const result = await generateQuiz(
      "doc-123",
      "Photosynthesis converts light into chemical energy.",
      "LECTURE",
      {
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      },
      fakeClient as any
    );

    assert.equal(result.document_id, "doc-123");
    assert.equal(calls, 3);
    assert.deepEqual(capturedTimeouts, [30000, 45000, 60000]);
    assert.deepEqual(responseFormatTypes, ["json_schema", "json_schema", "json_schema"]);
  });
});
