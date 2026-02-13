import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { requireAuth } from "../middleware/auth.js";

type MockReq = {
  headers?: Record<string, string | undefined>;
  header: (name: string) => string | undefined;
  auth?: { userId: string; email?: string; name?: string };
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

test("requireAuth extracts name from signed session when present", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const now = Math.floor(Date.now() / 1000);
  const session = signSession(secret, {
    user: { id: "user-name-1", email: "named@example.edu", name: "Alice Student" },
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
    userId: "user-name-1",
    email: "named@example.edu",
    name: "Alice Student",
  });
});

test("requireAuth returns undefined name when session has no name field", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const now = Math.floor(Date.now() / 1000);
  const session = signSession(secret, {
    user: { id: "user-noname", email: "noname@example.edu" },
    exp: now + 3600,
  });
  const req = makeReq(`learnease_session=${encodeURIComponent(session)}`);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.auth?.name, undefined);
});

test("requireAuth rejects expired session cookie", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const pastTime = Math.floor(Date.now() / 1000) - 3600;
  const session = signSession(secret, {
    user: { id: "user-expired", email: "expired@example.edu" },
    exp: pastTime,
  });
  const req = makeReq(`learnease_session=${encodeURIComponent(session)}`);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth rejects session with missing userId", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const now = Math.floor(Date.now() / 1000);
  const session = signSession(secret, {
    user: { email: "noid@example.edu" },
    exp: now + 3600,
  });
  const req = makeReq(`learnease_session=${encodeURIComponent(session)}`);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth rejects session with missing email", () => {
  const secret = "test-secret";
  process.env.SESSION_SECRET = secret;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const now = Math.floor(Date.now() / 1000);
  const session = signSession(secret, {
    user: { id: "user-noemail" },
    exp: now + 3600,
  });
  const req = makeReq(`learnease_session=${encodeURIComponent(session)}`);
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth rejects legacy cookies when ALLOW_LEGACY_AUTH_COOKIES is not true", () => {
  delete process.env.SESSION_SECRET;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "false";

  const req = makeReq("learnease_user_id=user-legacy; learnease_user_email=legacy@example.edu");
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth rejects legacy cookies with empty userId in test mode", () => {
  delete process.env.SESSION_SECRET;
  process.env.NODE_ENV = "test";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "true";

  const req = makeReq("learnease_user_id=; learnease_user_email=legacy@example.edu");
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("requireAuth ignores legacy cookies outside test mode", () => {
  delete process.env.SESSION_SECRET;
  process.env.NODE_ENV = "development";
  process.env.ALLOW_LEGACY_AUTH_COOKIES = "true";

  const req = makeReq("learnease_user_id=user-legacy; learnease_user_email=legacy@example.edu");
  const res = makeRes();
  let nextCalled = false;

  requireAuth(req as any, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
