/**
 * Task 2 auth hardening tests:
 * - origin/CSRF enforcement for state-changing routes (production + dev)
 * - session cookie flags in production vs development
 * - logout clears the cookie with matching attributes
 * - forged/expired session cookie rejection
 * - cross-user access matrix for every sensitive document route
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createHmac, randomUUID } from "crypto";

// Set up isolated test DB + encryption before any store imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-authhard-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.SESSION_SECRET = "test-session-secret";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

const { enforceTrustedOrigin } = await import("../middleware/originCheck.js");
const { requireAuth } = await import("../middleware/auth.js");
const { googleAuthHandler, logoutHandler } = await import("../routes/auth.js");
const contract = await import("../routes/contract.js");
const { saveDocument, getDocument, listDocumentsByUser } = await import(
  "../store/memoryStore.js"
);

type DocumentRecord = import("../store/memoryStore.js").DocumentRecord;

interface MockRes {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
  cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>;
  clearedCookies: Array<{ name: string; options: Record<string, unknown> }>;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  setHeader: (name: string, value: string) => MockRes;
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
}

function makeRes(): MockRes {
  const res: MockRes = {
    headers: {},
    cookies: [],
    clearedCookies: [],
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
    cookie(name: string, value: string, options: Record<string, unknown>) {
      this.cookies.push({ name, value, options });
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      this.clearedCookies.push({ name, options });
    },
  };
  return res;
}

function getErrorCode(res: MockRes): string | undefined {
  const body = res.body as { error?: { code?: string } } | undefined;
  return body?.error?.code;
}

function withEnv(overrides: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    saved.set(key, process.env[key]);
    const next = overrides[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }

  const restore = () => {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  const result = run();
  if (result instanceof Promise) {
    return result.finally(restore);
  }
  restore();
  return result;
}

function makeOriginReq(
  method: string,
  headers: Record<string, string | undefined> = {}
): Record<string, unknown> {
  return {
    method,
    originalUrl: "/api/test",
    headers,
  };
}

function runOriginCheck(method: string, headers: Record<string, string | undefined>) {
  const res = makeRes();
  let nextCalled = false;
  enforceTrustedOrigin(makeOriginReq(method, headers) as never, res as never, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

// ── Origin / CSRF enforcement ────────────────────────────────

test("production: POST from untrusted origin is blocked with 403", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const { res, nextCalled } = runOriginCheck("POST", { origin: "https://evil.example" });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(getErrorCode(res), "ORIGIN_NOT_ALLOWED");
  });
});

test("production: DELETE and PATCH from untrusted origin are blocked", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    for (const method of ["DELETE", "PATCH", "PUT"]) {
      const { res, nextCalled } = runOriginCheck(method, { origin: "https://evil.example" });
      assert.equal(nextCalled, false, `${method} should be blocked`);
      assert.equal(res.statusCode, 403, `${method} should return 403`);
    }
  });
});

test("production: POST from trusted CORS_ORIGINS origin is allowed", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const { res, nextCalled } = runOriginCheck("POST", {
      origin: "https://app.learnease.example",
    });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
  });
});

test("production: trusted origin matching is case-insensitive and ignores trailing slashes", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://App.LearnEase.example/" }, () => {
    const { nextCalled } = runOriginCheck("POST", { origin: "https://app.learnease.example" });
    assert.equal(nextCalled, true);
  });
});

test("production: GET from untrusted origin passes (safe method)", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const { nextCalled } = runOriginCheck(method, { origin: "https://evil.example" });
      assert.equal(nextCalled, true, `${method} should pass`);
    }
  });
});

test("production: non-browser POST without Origin/Referer is allowed", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const { nextCalled } = runOriginCheck("POST", {});
    assert.equal(nextCalled, true);
  });
});

test("production: Origin 'null' (sandboxed iframe) is blocked", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const { res, nextCalled } = runOriginCheck("POST", { origin: "null" });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

test("production: Origin 'null' is blocked even with a trusted Referer", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const { res, nextCalled } = runOriginCheck("POST", {
      origin: "null",
      referer: "https://app.learnease.example/dashboard",
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

test("production: Referer fallback enforces trust when Origin is absent", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const blocked = runOriginCheck("POST", {
      referer: "https://evil.example/some/page",
    });
    assert.equal(blocked.nextCalled, false);
    assert.equal(blocked.res.statusCode, 403);

    const allowed = runOriginCheck("POST", {
      referer: "https://app.learnease.example/dashboard",
    });
    assert.equal(allowed.nextCalled, true);
  });
});

test("development: loopback origins are allowed even when not in CORS_ORIGINS", () => {
  withEnv({ NODE_ENV: "development", CORS_ORIGINS: "http://localhost:3000" }, () => {
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
      "http://localhost:4321",
    ]) {
      const { nextCalled } = runOriginCheck("POST", { origin });
      assert.equal(nextCalled, true, `${origin} should be allowed in development`);
    }
  });
});

test("development: non-loopback untrusted origin is still blocked", () => {
  withEnv({ NODE_ENV: "development", CORS_ORIGINS: "http://localhost:3000" }, () => {
    const { res, nextCalled } = runOriginCheck("POST", { origin: "https://evil.example" });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

test("production: loopback origin is NOT exempt (must be explicitly trusted)", () => {
  withEnv({ NODE_ENV: "production", CORS_ORIGINS: "https://app.learnease.example" }, () => {
    const { res, nextCalled } = runOriginCheck("POST", { origin: "http://localhost:3000" });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });
});

// ── Session cookie flags ─────────────────────────────────────

const nowSeconds = Math.floor(Date.now() / 1000);

function mockGoogleFetch() {
  return mock.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          sub: "cookie-user",
          email: "cookie@example.edu",
          email_verified: "true",
          name: "Cookie User",
          aud: "test-client-id",
          exp: String(nowSeconds + 3600),
        }),
    } as Response)
  );
}

test("google auth sets Secure+HttpOnly+SameSite=Lax cookie in production", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockGoogleFetch() as unknown as typeof fetch;
  try {
    await withEnv({ NODE_ENV: "production" }, async () => {
      const res = makeRes();
      await googleAuthHandler({ body: { credential: "fake-token" } } as never, res as never);
      assert.equal(res.statusCode, 200);
      assert.equal(res.cookies.length, 1);
      const cookie = res.cookies[0];
      assert.equal(cookie.name, "learnease_session");
      assert.equal(cookie.options.httpOnly, true);
      assert.equal(cookie.options.secure, true);
      assert.equal(cookie.options.sameSite, "lax");
      assert.equal(cookie.options.path, "/");
      assert.ok(typeof cookie.options.maxAge === "number" && cookie.options.maxAge > 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("google auth cookie is not Secure in development", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockGoogleFetch() as unknown as typeof fetch;
  try {
    await withEnv({ NODE_ENV: "development" }, async () => {
      const res = makeRes();
      await googleAuthHandler({ body: { credential: "fake-token" } } as never, res as never);
      assert.equal(res.statusCode, 200);
      const cookie = res.cookies[0];
      assert.equal(cookie.options.secure, false);
      assert.equal(cookie.options.httpOnly, true);
      assert.equal(cookie.options.sameSite, "lax");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("logout clears cookie with attributes matching the auth cookie", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    const res = makeRes();
    logoutHandler({} as never, res as never);
    assert.equal(res.statusCode, 200);
    assert.equal(res.clearedCookies.length, 1);
    const cleared = res.clearedCookies[0];
    assert.equal(cleared.name, "learnease_session");
    assert.equal(cleared.options.httpOnly, true);
    assert.equal(cleared.options.secure, true);
    assert.equal(cleared.options.sameSite, "lax");
    assert.equal(cleared.options.path, "/");
  });
});

// ── Forged / expired session rejection ───────────────────────

function signSession(secret: string, payload: Record<string, unknown>): string {
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${sig}`;
}

function runRequireAuth(cookie: string | undefined) {
  const req = {
    headers: { cookie },
    header: () => undefined,
  } as Record<string, unknown>;
  const res = makeRes();
  let nextCalled = false;
  requireAuth(req as never, res as never, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

test("session signed with a different secret is rejected", () => {
  const forged = signSession("attacker-secret", {
    user: { id: "victim-user", email: "victim@example.edu" },
    exp: nowSeconds + 3600,
  });
  const { res, nextCalled } = runRequireAuth(`learnease_session=${encodeURIComponent(forged)}`);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("expired session cookie is rejected", () => {
  const expired = signSession("test-session-secret", {
    user: { id: "user-123", email: "student@example.edu" },
    exp: nowSeconds - 60,
  });
  const { res, nextCalled } = runRequireAuth(`learnease_session=${encodeURIComponent(expired)}`);
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("payload swap with original signature is rejected", () => {
  const valid = signSession("test-session-secret", {
    user: { id: "attacker", email: "attacker@example.edu" },
    exp: nowSeconds + 3600,
  });
  const signature = valid.slice(valid.lastIndexOf(".") + 1);
  const swappedPayload = Buffer.from(
    JSON.stringify({
      user: { id: "victim-user", email: "victim@example.edu" },
      exp: nowSeconds + 3600,
    }),
    "utf8"
  ).toString("base64url");
  const { res, nextCalled } = runRequireAuth(
    `learnease_session=${encodeURIComponent(`${swappedPayload}.${signature}`)}`
  );
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test("legacy plain cookies are rejected outside test mode", () => {
  withEnv({ NODE_ENV: "production", ALLOW_LEGACY_AUTH_COOKIES: "true" }, () => {
    const { res, nextCalled } = runRequireAuth(
      "learnease_user_id=someone; learnease_user_email=someone@example.edu"
    );
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});

// ── Cross-user access matrix ─────────────────────────────────

const OWNER = { userId: "matrix-owner", email: "owner@example.edu" };
const ATTACKER = { userId: "matrix-attacker", email: "attacker@example.edu" };

function seedOwnedDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const doc: DocumentRecord = {
    id: randomUUID(),
    userId: OWNER.userId,
    userEmail: OWNER.email,
    filename: "owned.pdf",
    fileType: "PDF",
    documentType: "HOMEWORK",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 1,
    paragraphCount: null,
    extractedText: "Assignment description for the cross-user matrix test.",
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

interface MatrixCase {
  name: string;
  invoke: (documentId: string, res: MockRes) => Promise<void>;
}

function attackerReq(extra: Record<string, unknown>): Record<string, unknown> {
  return { auth: { ...ATTACKER }, ...extra };
}

const matrixCases: MatrixCase[] = [
  {
    name: "GET /api/documents/:id",
    invoke: (id, res) =>
      contract.getDocumentHandler(attackerReq({ params: { documentId: id } }) as never, res as never),
  },
  {
    name: "DELETE /api/documents/:id",
    invoke: (id, res) =>
      contract.deleteDocumentHandler(attackerReq({ params: { documentId: id } }) as never, res as never),
  },
  {
    name: "GET /api/documents/:id/visual-observations",
    invoke: (id, res) =>
      contract.getVisualObservationsHandler(
        attackerReq({ params: { documentId: id } }) as never,
        res as never
      ),
  },
  {
    name: "GET /api/study-guide/:id",
    invoke: (id, res) =>
      contract.getStudyGuideHandler(attackerReq({ params: { documentId: id } }) as never, res as never),
  },
  {
    name: "GET /api/quiz/:id",
    invoke: (id, res) =>
      contract.getQuizHandler(attackerReq({ params: { documentId: id } }) as never, res as never),
  },
  {
    name: "POST /api/study-guide/create",
    invoke: (id, res) =>
      contract.createStudyGuideHandler(attackerReq({ body: { document_id: id } }) as never, res as never),
  },
  {
    name: "POST /api/study-guide/retry",
    invoke: (id, res) =>
      contract.retryStudyGuideHandler(attackerReq({ body: { document_id: id } }) as never, res as never),
  },
  {
    name: "POST /api/quiz/create",
    invoke: (id, res) =>
      contract.createQuizHandler(attackerReq({ body: { document_id: id } }) as never, res as never),
  },
  {
    name: "POST /api/quiz/retry",
    invoke: (id, res) =>
      contract.retryQuizHandler(attackerReq({ body: { document_id: id } }) as never, res as never),
  },
  {
    name: "PATCH /api/checklist/:id",
    invoke: (id, res) =>
      contract.updateChecklistHandler(
        attackerReq({ params: { documentId: id }, body: { item_id: "x", completed: true } }) as never,
        res as never
      ),
  },
  {
    name: "PATCH /api/documents/:id/due-date",
    invoke: (id, res) =>
      contract.updateDueDateHandler(
        attackerReq({ params: { documentId: id }, body: { due_date: "2099-12-31" } }) as never,
        res as never
      ),
  },
  {
    name: "PATCH /api/documents/:id/due-time",
    invoke: (id, res) =>
      contract.updateDueTimeHandler(
        attackerReq({ params: { documentId: id }, body: { due_time: "12:00" } }) as never,
        res as never
      ),
  },
  {
    name: "PATCH /api/documents/:id/reminder-opt-in",
    invoke: (id, res) =>
      contract.updateReminderOptInHandler(
        attackerReq({ params: { documentId: id }, body: { opt_in: true } }) as never,
        res as never
      ),
  },
];

test("every sensitive document route returns 403 for a non-owner", async () => {
  const doc = seedOwnedDocument();

  for (const matrixCase of matrixCases) {
    const res = makeRes();
    await matrixCase.invoke(doc.id, res);
    assert.equal(res.statusCode, 403, `${matrixCase.name} should return 403 for non-owner`);
    assert.equal(
      getErrorCode(res),
      "FORBIDDEN",
      `${matrixCase.name} should return FORBIDDEN error code`
    );
  }

  assert.ok(getDocument(doc.id), "document must still exist after attacker attempts");
});

test("DELETE /api/user/data only deletes the caller's documents", async () => {
  const ownerDoc = seedOwnedDocument();
  const res = makeRes();
  await contract.deleteUserDataHandler(attackerReq({}) as never, res as never);
  assert.equal(res.statusCode, 200);
  assert.ok(getDocument(ownerDoc.id), "owner document must survive attacker's delete-all");
  assert.equal(listDocumentsByUser(OWNER.userId).length >= 1, true);
});
