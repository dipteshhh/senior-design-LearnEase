/**
 * Route-level tests for googleAuthHandler with mocked fetch.
 * Covers: missing credential, audience mismatch, email_verified=false,
 * expired token, provider unavailable, and successful auth.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// Set up isolated test DB + encryption before any store imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-gauth-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.SESSION_SECRET = "test-session-secret";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

const { googleAuthHandler } = await import("../routes/auth.js");

type MockRes = {
  statusCode?: number;
  body?: unknown;
  cookies?: Array<{ name: string; value: string; options: Record<string, unknown> }>;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
};

function makeRes(): MockRes {
  const res: MockRes = {
    cookies: [],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      this.cookies!.push({ name, value, options });
    },
  };
  return res;
}

function makeReq(body: Record<string, unknown>) {
  return { body };
}

const nowSeconds = Math.floor(Date.now() / 1000);

function mockFetchResponse(tokenInfo: Record<string, string>, status = 200) {
  return mock.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(tokenInfo),
    } as Response)
  );
}

test("googleAuthHandler returns 400 for missing credential", async () => {
  const req = makeReq({});
  const res = makeRes();
  await googleAuthHandler(req as any, res as any);
  assert.equal(res.statusCode, 400);
  assert.deepEqual((res.body as any).error.code, "MISSING_CREDENTIAL");
});

test("googleAuthHandler returns 401 for audience mismatch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchResponse({
    sub: "user-1",
    email: "user@example.com",
    email_verified: "true",
    aud: "wrong-client-id",
    exp: String(nowSeconds + 3600),
  }) as any;

  try {
    const req = makeReq({ credential: "fake-token" });
    const res = makeRes();
    await googleAuthHandler(req as any, res as any);
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as any).error.code, "INVALID_GOOGLE_TOKEN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("googleAuthHandler returns 401 for email_verified=false", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchResponse({
    sub: "user-1",
    email: "user@example.com",
    email_verified: "false",
    aud: "test-client-id",
    exp: String(nowSeconds + 3600),
  }) as any;

  try {
    const req = makeReq({ credential: "fake-token" });
    const res = makeRes();
    await googleAuthHandler(req as any, res as any);
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as any).error.code, "EMAIL_NOT_VERIFIED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("googleAuthHandler returns 401 for expired token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchResponse({
    sub: "user-1",
    email: "user@example.com",
    email_verified: "true",
    aud: "test-client-id",
    exp: String(nowSeconds - 100),
  }) as any;

  try {
    const req = makeReq({ credential: "fake-token" });
    const res = makeRes();
    await googleAuthHandler(req as any, res as any);
    assert.equal(res.statusCode, 401);
    assert.equal((res.body as any).error.code, "INVALID_GOOGLE_TOKEN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("googleAuthHandler returns 500 when provider is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() =>
    Promise.reject(new TypeError("fetch failed"))
  ) as any;

  try {
    const req = makeReq({ credential: "fake-token" });
    const res = makeRes();
    await googleAuthHandler(req as any, res as any);
    assert.equal(res.statusCode, 500);
    assert.equal((res.body as any).error.code, "AUTH_PROVIDER_UNAVAILABLE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("googleAuthHandler returns 200 and sets cookie for valid token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetchResponse({
    sub: "user-1",
    email: "user@example.com",
    email_verified: "true",
    name: "Test User",
    aud: "test-client-id",
    exp: String(nowSeconds + 3600),
  }) as any;

  try {
    const req = makeReq({ credential: "fake-token" });
    const res = makeRes();
    await googleAuthHandler(req as any, res as any);
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as any).user.id, "user-1");
    assert.equal((res.body as any).user.email, "user@example.com");
    assert.ok(res.cookies!.length > 0, "Should set session cookie");
    assert.equal(res.cookies![0].name, "learnease_session");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
