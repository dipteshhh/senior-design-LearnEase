import test from "node:test";
import assert from "node:assert/strict";

const { ApiClientError, api } = await import("../../src/lib/api.ts");
const { getErrorMessage } = await import("../../src/lib/errorUx.ts");

test("api sends JSON content-type for non-FormData bodies", async () => {
  let capturedUrl = "";
  let capturedInit = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return { ok: true };
      },
    };
  };

  try {
    const payload = await api("/api/test", {
      method: "POST",
      body: JSON.stringify({ hello: "world" }),
    });

    assert.equal(payload.ok, true);
    assert.ok(capturedUrl.endsWith("/api/test"));
    assert.equal(capturedInit.credentials, "include");
    assert.equal(new Headers(capturedInit.headers).get("Content-Type"), "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api does not set JSON content-type for FormData bodies", async () => {
  let capturedInit = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return { ok: true };
      },
    };
  };

  const formData = new FormData();
  formData.append("file", "test");

  try {
    await api("/api/upload", {
      method: "POST",
      body: formData,
    });

    assert.equal(new Headers(capturedInit.headers).get("Content-Type"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api throws ApiClientError and dispatches unauthorized event on 401", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalCustomEvent = globalThis.CustomEvent;

  let dispatchedType = null;
  if (typeof globalThis.CustomEvent === "undefined") {
    globalThis.CustomEvent = class CustomEventPolyfill {
      constructor(type) {
        this.type = type;
      }
    };
  }

  globalThis.window = {
    dispatchEvent(event) {
      dispatchedType = event.type;
      return true;
    },
  };

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    headers: { get: () => null },
    async json() {
      return {
        error: {
          code: "UNAUTHORIZED",
          message: "Auth required.",
          details: { hint: "login" },
        },
      };
    },
  });

  try {
    await assert.rejects(
      () => api("/api/auth/me"),
      (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.code, "UNAUTHORIZED");
        assert.equal(error.message, "Auth required.");
        assert.deepEqual(error.details, { hint: "login" });
        return true;
      }
    );
    assert.equal(dispatchedType, "learnease:unauthorized");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalCustomEvent;
  }
});

test("api parses Retry-After and exposes retryAfterSeconds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    headers: { get: (key) => (key === "Retry-After" ? "7" : null) },
    async json() {
      return {
        error: {
          code: "RATE_LIMITED",
          message: "Slow down.",
        },
      };
    },
  });

  try {
    await assert.rejects(
      () => api("/api/documents"),
      (error) => {
        assert.ok(error instanceof ApiClientError);
        assert.equal(error.retryAfterSeconds, 7);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getErrorMessage maps known API codes and falls back safely", () => {
  const rateLimited = new ApiClientError(
    429,
    "RATE_LIMITED",
    "Too many requests.",
    undefined,
    3
  );
  assert.equal(
    getErrorMessage(rateLimited, "fallback"),
    "Too many requests right now. Please retry in 3s."
  );

  const fallbackToServerMessage = new ApiClientError(
    400,
    "UNKNOWN_CODE",
    "Server-provided message.",
    undefined,
    null
  );
  assert.equal(
    getErrorMessage(fallbackToServerMessage, "fallback"),
    "Server-provided message."
  );

  assert.equal(getErrorMessage(new Error("boom"), "fallback"), "fallback");
});

