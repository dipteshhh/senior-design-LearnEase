/**
 * Task 5 generation reliability lifecycle tests:
 * - double-click create is idempotent (second call → 409, no duplicate task)
 * - quiz retry state machine (failed → 202, processing → 409, idle → 409)
 * - crash recovery: interrupted processing → failed → retry → 202
 * - OpenAI timeout is transient and exhausts attempts without hanging
 * - malformed model output short-circuits repair retries
 * - one document's failure does not poison another document's generation
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { APIConnectionTimeoutError } from "openai/error";
import { ContractValidationError } from "../services/outputValidator.js";
import { resetCircuitBreakerStateForTests } from "../services/generationReliability.js";

// Set up isolated test DB + encryption before any store imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-genlife-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

const contract = await import("../routes/contract.js");
const { analyzeDocument } = await import("../services/contentAnalyzer.js");
const { saveDocument, getDocument, recoverInterruptedProcessingDocuments } = await import(
  "../store/memoryStore.js"
);

const launchedStudyGuideTasks: string[] = [];
const launchedQuizTasks: string[] = [];
const restoreGenerationTaskLaunchers = contract.setGenerationTaskLauncherOverridesForTests({
  studyGuide: (documentId) => {
    launchedStudyGuideTasks.push(documentId);
  },
  quiz: (documentId) => {
    launchedQuizTasks.push(documentId);
  },
});

test.beforeEach(() => {
  launchedStudyGuideTasks.length = 0;
  launchedQuizTasks.length = 0;
});

test.after(() => {
  restoreGenerationTaskLaunchers();
});

type DocumentRecord = import("../store/memoryStore.js").DocumentRecord;

interface MockRes {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  setHeader: (name: string, value: string) => MockRes;
}

function makeRes(): MockRes {
  const res: MockRes = {
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

const USER = { userId: "lifecycle-user", email: "lifecycle@example.edu" };

function authReq(extra: Record<string, unknown>): Record<string, unknown> {
  return { auth: { ...USER }, ...extra };
}

function seedDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const doc: DocumentRecord = {
    id: randomUUID(),
    userId: USER.userId,
    userEmail: USER.email,
    filename: "lifecycle.pdf",
    fileType: "PDF",
    documentType: "LECTURE",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 1,
    paragraphCount: null,
    extractedText: "Lecture slides for module week chapter learning objectives.",
    studyGuide: null,
    studyGuideStatus: "idle",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    quiz: null,
    quizStatus: "idle",
    quizErrorCode: null,
    quizErrorMessage: null,
    errorCode: null,
    errorMessage: null,
    assignmentDueDate: null,
    assignmentDueTime: null,
    reminderOptIn: false,
    reminderStatus: "pending",
    reminderDeadlineKey: null,
    reminderLastError: null,
    reminderAttemptedAt: null,
    ...overrides,
  };
  saveDocument(doc);
  return doc;
}

const RETRY_ENV_KEYS = [
  "OPENAI_GENERATION_MAX_ATTEMPTS",
  "OPENAI_TRANSIENT_BACKOFF_BASE_MS",
  "OPENAI_TRANSIENT_BACKOFF_MAX_MS",
  "OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD",
] as const;

function withRetryTestEnv(
  overrides: Partial<Record<(typeof RETRY_ENV_KEYS)[number], string>>,
  fn: () => Promise<void>
): Promise<void> {
  const previous = Object.fromEntries(
    RETRY_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof RETRY_ENV_KEYS)[number], string | undefined>;

  process.env.OPENAI_GENERATION_MAX_ATTEMPTS = overrides.OPENAI_GENERATION_MAX_ATTEMPTS ?? "2";
  process.env.OPENAI_TRANSIENT_BACKOFF_BASE_MS = overrides.OPENAI_TRANSIENT_BACKOFF_BASE_MS ?? "0";
  process.env.OPENAI_TRANSIENT_BACKOFF_MAX_MS = overrides.OPENAI_TRANSIENT_BACKOFF_MAX_MS ?? "0";
  process.env.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD =
    overrides.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD ?? "0";
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

// ── Double-click idempotency ─────────────────────────────────

test("double-click study guide create: first 202, second 409, single processing state", async () => {
  const doc = seedDocument();

  const first = makeRes();
  await contract.createStudyGuideHandler(
    authReq({ body: { document_id: doc.id } }) as never,
    first as never
  );
  assert.equal(first.statusCode, 202);

  const second = makeRes();
  await contract.createStudyGuideHandler(
    authReq({ body: { document_id: doc.id } }) as never,
    second as never
  );
  assert.equal(second.statusCode, 409);

  const current = getDocument(doc.id);
  assert.ok(current);
  assert.equal(current.studyGuideStatus, "processing");
  assert.deepEqual(launchedStudyGuideTasks, [doc.id]);
});

test("double-click quiz create: first 202, second 409 with Retry-After", async () => {
  const doc = seedDocument();

  const first = makeRes();
  await contract.createQuizHandler(
    authReq({ body: { document_id: doc.id } }) as never,
    first as never
  );
  assert.equal(first.statusCode, 202);

  const second = makeRes();
  await contract.createQuizHandler(
    authReq({ body: { document_id: doc.id } }) as never,
    second as never
  );
  assert.equal(second.statusCode, 409);
  assert.ok("retry-after" in second.headers, "409 processing response should hint Retry-After");
  assert.deepEqual(launchedQuizTasks, [doc.id]);
});

// ── Quiz retry state machine ─────────────────────────────────

test("quiz retry from failed state returns 202 and re-enters processing", async () => {
  const doc = seedDocument({
    quizStatus: "failed",
    quizErrorCode: "QUIZ:GENERATION_FAILED",
    quizErrorMessage: "boom",
  });

  const res = makeRes();
  await contract.retryQuizHandler(authReq({ body: { document_id: doc.id } }) as never, res as never);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing", retry: true });

  const current = getDocument(doc.id);
  assert.ok(current);
  assert.equal(current.quizStatus, "processing");
  assert.deepEqual(launchedQuizTasks, [doc.id]);
});

test("quiz retry while processing returns 409", async () => {
  const doc = seedDocument({
    quizStatus: "processing",
    quizErrorCode: "QUIZ_PROCESSING",
  });

  const res = makeRes();
  await contract.retryQuizHandler(authReq({ body: { document_id: doc.id } }) as never, res as never);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(launchedQuizTasks, []);
});

test("quiz retry from idle state returns 409 (retry only from failed)", async () => {
  const doc = seedDocument();

  const res = makeRes();
  await contract.retryQuizHandler(authReq({ body: { document_id: doc.id } }) as never, res as never);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(launchedQuizTasks, []);
});

test("quiz create returns 200 cached when quiz already exists", async () => {
  const doc = seedDocument({
    quiz: {
      document_id: "cached",
      questions: [],
    } as never,
    quizStatus: "ready",
  });

  const res = makeRes();
  await contract.createQuizHandler(authReq({ body: { document_id: doc.id } }) as never, res as never);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ready", cached: true });
  assert.deepEqual(launchedQuizTasks, []);
});

// ── Crash recovery → retry lifecycle ─────────────────────────

test("interrupted study guide processing recovers to failed and is retryable", async () => {
  const doc = seedDocument({
    studyGuideStatus: "processing",
    studyGuideErrorCode: "STUDY_GUIDE_PROCESSING",
  });

  const recovered = recoverInterruptedProcessingDocuments();
  assert.ok(recovered >= 1);

  const afterRecovery = getDocument(doc.id);
  assert.ok(afterRecovery);
  assert.equal(afterRecovery.studyGuideStatus, "failed");
  assert.equal(afterRecovery.studyGuideErrorCode, "STUDY_GUIDE:GENERATION_INTERRUPTED");

  const res = makeRes();
  await contract.retryStudyGuideHandler(
    authReq({ body: { document_id: doc.id } }) as never,
    res as never
  );
  assert.equal(res.statusCode, 202);

  const afterRetry = getDocument(doc.id);
  assert.ok(afterRetry);
  assert.equal(afterRetry.studyGuideStatus, "processing");
  assert.deepEqual(launchedStudyGuideTasks, [doc.id]);
});

test("interrupted quiz processing recovers to failed and is retryable", async () => {
  const doc = seedDocument({
    quizStatus: "processing",
    quizErrorCode: "QUIZ_PROCESSING",
  });

  const recovered = recoverInterruptedProcessingDocuments();
  assert.ok(recovered >= 1);

  const afterRecovery = getDocument(doc.id);
  assert.ok(afterRecovery);
  assert.equal(afterRecovery.quizStatus, "failed");
  assert.equal(afterRecovery.quizErrorCode, "QUIZ:GENERATION_INTERRUPTED");

  const res = makeRes();
  await contract.retryQuizHandler(authReq({ body: { document_id: doc.id } }) as never, res as never);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(launchedQuizTasks, [doc.id]);
});

// ── OpenAI timeout handling ──────────────────────────────────

test("OpenAI timeout is transient: retries exhaust attempts then surface an error", async () => {
  await withRetryTestEnv({ OPENAI_GENERATION_MAX_ATTEMPTS: "2" }, async () => {
    let calls = 0;
    const timeoutClient = {
      chat: {
        completions: {
          async create() {
            calls += 1;
            throw new APIConnectionTimeoutError({ message: "Request timed out." });
          },
        },
      },
    };

    await assert.rejects(
      analyzeDocument(
        "Lecture text about photosynthesis and energy conversion.",
        "LECTURE",
        { fileType: "PDF", pageCount: 1, paragraphCount: null },
        timeoutClient as never
      ),
      (error: unknown) => error instanceof Error
    );

    assert.equal(calls, 2, "timeout must be retried up to max attempts, not just once");
  });
});

// ── Malformed model output ───────────────────────────────────

test("malformed (non-JSON) model output fails as repairable and short-circuits repeats", async () => {
  await withRetryTestEnv({ OPENAI_GENERATION_MAX_ATTEMPTS: "5" }, async () => {
    let calls = 0;
    const malformedClient = {
      chat: {
        completions: {
          async create() {
            calls += 1;
            return {
              choices: [{ message: { content: "definitely not json {{{" } }],
            };
          },
        },
      },
    };

    await assert.rejects(
      analyzeDocument(
        "Lecture text about photosynthesis and energy conversion.",
        "LECTURE",
        { fileType: "PDF", pageCount: 1, paragraphCount: null },
        malformedClient as never
      ),
      (error: unknown) => error instanceof ContractValidationError
    );

    assert.ok(
      calls < 5,
      `identical repair failures must short-circuit before max attempts (calls=${calls})`
    );
  });
});

test("model output missing required fields fails validation without hanging", async () => {
  await withRetryTestEnv({ OPENAI_GENERATION_MAX_ATTEMPTS: "2" }, async () => {
    const incompleteClient = {
      chat: {
        completions: {
          async create() {
            return {
              choices: [{ message: { content: JSON.stringify({ overview: {} }) } }],
            };
          },
        },
      },
    };

    await assert.rejects(
      analyzeDocument(
        "Lecture text about photosynthesis and energy conversion.",
        "LECTURE",
        { fileType: "PDF", pageCount: 1, paragraphCount: null },
        incompleteClient as never
      ),
      (error: unknown) =>
        error instanceof ContractValidationError && error.code === "SCHEMA_VALIDATION_FAILED"
    );
  });
});

// ── Cross-document isolation ─────────────────────────────────

test("a failed document does not block generation for an unrelated document", async () => {
  const failedDoc = seedDocument({
    studyGuideStatus: "failed",
    studyGuideErrorCode: "STUDY_GUIDE:GENERATION_FAILED",
    studyGuideErrorMessage: "OpenAI transient failure",
  });
  const healthyDoc = seedDocument();

  const res = makeRes();
  await contract.createStudyGuideHandler(
    authReq({ body: { document_id: healthyDoc.id } }) as never,
    res as never
  );
  assert.equal(res.statusCode, 202);

  const failedAfter = getDocument(failedDoc.id);
  assert.ok(failedAfter);
  assert.equal(failedAfter.studyGuideStatus, "failed", "unrelated failed doc must stay untouched");
  assert.equal(failedAfter.studyGuideErrorCode, "STUDY_GUIDE:GENERATION_FAILED");

  const healthyAfter = getDocument(healthyDoc.id);
  assert.ok(healthyAfter);
  assert.equal(healthyAfter.studyGuideStatus, "processing");
  assert.deepEqual(launchedStudyGuideTasks, [healthyDoc.id]);
});
