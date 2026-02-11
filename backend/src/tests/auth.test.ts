import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { requireAuth } from "../middleware/auth.js";

type MockReq = {
  headers?: Record<string, string | undefined>;
  header: (name: string) => string | undefined;
  auth?: { userId: string; email?: string };
};

type MockRes = {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
};

function makeReq(cookie: string | undefined): MockReq {
  return {
    headers: { cookie },
    header: (_name: string) => undefined,
  };
}

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

function signSession(secret: string, payload: Record<string, unknown>): string {
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${sig}`;
}

test("requireAuth returns 401 when session cookie is missing", () => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const req = makeReq(undefined);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication required. Provide a valid session cookie.",
      details: {},
    },
  });
});

test("requireAuth accepts valid signed session cookie", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const now = Math.floor(Date.now() / 1000);
  const session = signSession(secret, {
    user: { id: "user-123", email: "student@example.edu" },
    exp: now + 3600,
  });
  const req = makeReq(`learnease_session=${encodeURIComponent(session)}`);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.auth, {
    userId: "user-123",
    email: "student@example.edu",
    name: undefined,
  });
  assert.equal(res.statusCode, undefined);
});

test("requireAuth rejects invalid session signature", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const now = Math.floor(Date.now() / 1000);
  const goodSession = signSession(secret, {
    user: { id: "user-123", email: "student@example.edu" },
    exp: now + 3600,
  });
  const tampered = `${goodSession}tampered`;
  const req = makeReq(`learnease_session=${encodeURIComponent(tampered)}`);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth allows legacy cookies only when explicitly enabled", () => {
  delete process.env.SESSION_SECRET;
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "true";

  const req = makeReq("learnease_user_id=user-legacy; learnease_user_email=legacy@example.edu");
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.auth, {
    userId: "user-legacy",
    email: "legacy@example.edu",
  });
});

