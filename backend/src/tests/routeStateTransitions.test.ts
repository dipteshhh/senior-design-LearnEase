/**
 * Tests for route async state transitions:
 * - createStudyGuideHandler: idle → processing → 202
 * - createStudyGuideHandler: UNSUPPORTED → 422 (synchronous rejection)
 * - createStudyGuideHandler: already processing → 409
 * - createStudyGuideHandler: already cached → 200
 * - retryStudyGuideHandler: failed → processing → 202
 * - retryStudyGuideHandler: not failed → 409
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

// Set up isolated test DB + encryption before any store imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-route-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

import { saveDocument, getDocument, updateDocument } from "../store/memoryStore.js";
import type { DocumentRecord } from "../store/memoryStore.js";

type MockReq = {
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
  auth?: { userId: string; email: string };
};

type MockRes = {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  setHeader: (name: string, value: string) => MockRes;
};

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

function makeAuthReq(body: Record<string, unknown>): MockReq {
  return {
    body,
    auth: { userId: "test-user", email: "test@example.com" },
  };
}

function seedDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const doc: DocumentRecord = {
    id: randomUUID(),
    userId: "test-user",
    userEmail: "test@example.com",
    filename: "test.pdf",
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
    ...overrides,
  };
  saveDocument(doc);
  return doc;
}

async function loadHandlers() {
  return import("../routes/contract.js");
}

test("createStudyGuideHandler returns 202 and sets status to processing", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument();
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing" });

  // Document should now be in processing state
  const updated = getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.studyGuideStatus, "processing");
});

test("createStudyGuideHandler returns 422 for UNSUPPORTED document", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "UNSUPPORTED" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);

  // Document state should NOT have changed
  const unchanged = getDocument(doc.id);
  assert.ok(unchanged);
  assert.equal(unchanged.studyGuideStatus, "idle");
});

test("createStudyGuideHandler returns 409 when already processing", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "processing" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
  assert.equal(res.headers["retry-after"], "5");
});

test("createQuizHandler returns 409 with Retry-After when already processing", async () => {
  const { createQuizHandler } = await loadHandlers();
  const doc = seedDocument({ quizStatus: "processing", documentType: "LECTURE" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createQuizHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
  assert.equal(res.headers["retry-after"], "5");
});

test("createStudyGuideHandler returns 200 cached when study guide exists", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const fakeGuide = {
    overview: { title: "T", document_type: "LECTURE", summary: "S" },
    key_actions: [],
    checklist: [],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [],
  };
  const doc = seedDocument({ studyGuide: fakeGuide as any, studyGuideStatus: "ready" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ready", cached: true });
});

test("createStudyGuideHandler returns 409 when in failed state (must use retry)", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "failed" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
});

test("retryStudyGuideHandler returns 202 from failed state", async () => {
  const { retryStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "failed" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await retryStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing", retry: true });

  const updated = getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.studyGuideStatus, "processing");
});

test("retryStudyGuideHandler returns 409 when not in failed state", async () => {
  const { retryStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "idle" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await retryStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
});

test("retryStudyGuideHandler returns 422 for UNSUPPORTED document", async () => {
  const { retryStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "UNSUPPORTED", studyGuideStatus: "failed" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await retryStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
});

test("listDocumentsHandler returns per-flow statuses for each document", async () => {
  const { listDocumentsHandler } = await loadHandlers();
  const doc = seedDocument({
    studyGuideStatus: "processing",
    quizStatus: "failed",
    quizErrorCode: "QUIZ:SCHEMA_VALIDATION_FAILED",
    quizErrorMessage: "Schema invalid",
    status: "failed",
    errorCode: "QUIZ:SCHEMA_VALIDATION_FAILED",
    errorMessage: "Schema invalid",
  });
  const req: MockReq = {
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await listDocumentsHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  const items = res.body as Array<Record<string, unknown>>;
  const item = items.find((entry) => entry.id === doc.id);
  assert.ok(item, "expected seeded document in list response");
  assert.equal(item.study_guide_status, "processing");
  assert.equal(item.quiz_status, "failed");
});

test("deleteDocumentHandler deletes an owned document", async () => {
  const { deleteDocumentHandler } = await loadHandlers();
  const doc = seedDocument();
  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await deleteDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(getDocument(doc.id), undefined);
});
