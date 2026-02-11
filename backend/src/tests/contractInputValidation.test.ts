import test from "node:test";
import assert from "node:assert/strict";

type MockReq = {
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
};

type MockRes = {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
};

function makeRes(): MockRes {
  const res: MockRes = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function loadHandlers() {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";
  return import("../routes/contract.js");
}

test("createStudyGuideHandler rejects malformed document_id with 422", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const req: MockReq = { body: { document_id: "not-a-uuid" } };
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
  assert.deepEqual(res.body, {
    error: {
      code: "SCHEMA_VALIDATION_FAILED",
      message: "document_id must be a UUID.",
      details: { field: "document_id" },
    },
  });
});

test("createQuizHandler rejects malformed document_id with 422", async () => {
  const { createQuizHandler } = await loadHandlers();
  const req: MockReq = { body: { document_id: "not-a-uuid" } };
  const res = makeRes();

  await createQuizHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
});

test("getStudyGuideHandler rejects malformed :documentId with 422", async () => {
  const { getStudyGuideHandler } = await loadHandlers();
  const req: MockReq = { params: { documentId: "bad-id" } };
  const res = makeRes();

  await getStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
});

test("getQuizHandler rejects malformed :documentId with 422", async () => {
  const { getQuizHandler } = await loadHandlers();
  const req: MockReq = { params: { documentId: "bad-id" } };
  const res = makeRes();

  await getQuizHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
});

test("updateChecklistHandler rejects malformed :documentId with 422", async () => {
  const { updateChecklistHandler } = await loadHandlers();
  const req: MockReq = {
    params: { documentId: "bad-id" },
    body: { item_id: "1", completed: true },
  };
  const res = makeRes();

  await updateChecklistHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
});
