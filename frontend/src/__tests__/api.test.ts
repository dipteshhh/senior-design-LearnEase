import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { ApiClientError, api } from "../lib/api.ts";

const originalFetch = globalThis.fetch;

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}): void {
  const headers = new Headers(response.headers ?? {});
  const fetchMock = mock.fn(async () => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    headers,
    json: async () => response.json ?? {},
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});

// ── ApiClientError ──────────────────────────────────────────────────

test("ApiClientError sets name, status, code, message, details, retryAfterSeconds", () => {
  const details = { extra: "info" };
  const err = new ApiClientError(422, "VALIDATION", "bad input", details, 30);

  assert.equal(err.name, "ApiClientError");
  assert.equal(err.status, 422);
  assert.equal(err.code, "VALIDATION");
  assert.equal(err.message, "bad input");
  assert.deepEqual(err.details, details);
  assert.equal(err.retryAfterSeconds, 30);
  assert.ok(err instanceof Error);
});

test("ApiClientError accepts undefined details and null retryAfterSeconds", () => {
  const err = new ApiClientError(500, "UNKNOWN", "fail", undefined, null);
  assert.equal(err.details, undefined);
  assert.equal(err.retryAfterSeconds, null);
});

// ── api() — success path ────────────────────────────────────────────

test("api returns parsed JSON on success", async () => {
  mockFetch({ ok: true, json: { id: 1, name: "doc" } });

  const result = await api<{ id: number; name: string }>("/api/documents");
  assert.deepEqual(result, { id: 1, name: "doc" });
});

test("api calls fetch with credentials: include", async () => {
  mockFetch({ ok: true, json: {} });

  await api("/api/health");

  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
  const call = fetchMock.mock.calls[0];
  assert.equal(call.arguments[1]?.credentials, "include");
});

test("api sets Content-Type application/json when body is provided", async () => {
  mockFetch({ ok: true, json: {} });

  await api("/api/upload", { method: "POST", body: JSON.stringify({ text: "hi" }) });

  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
  const call = fetchMock.mock.calls[0];
  const headers = call.arguments[1]?.headers as Headers;
  assert.equal(headers.get("Content-Type"), "application/json");
});

test("api does not override existing Content-Type header", async () => {
  mockFetch({ ok: true, json: {} });

  await api("/api/upload", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "Content-Type": "text/plain" },
  });

  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
  const call = fetchMock.mock.calls[0];
  const headers = call.arguments[1]?.headers as Headers;
  assert.equal(headers.get("Content-Type"), "text/plain");
});

test("api prepends API_BASE_URL for relative paths", async () => {
  mockFetch({ ok: true, json: {} });

  await api("/api/documents");

  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
  const call = fetchMock.mock.calls[0];
  const url = call.arguments[0] as string;
  assert.ok(url.endsWith("/api/documents"), `expected URL to end with /api/documents, got ${url}`);
  assert.ok(url.startsWith("http"), `expected URL to start with http, got ${url}`);
});

test("api passes absolute URLs through unchanged", async () => {
  mockFetch({ ok: true, json: {} });

  await api("https://external.example.com/data");

  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
  const call = fetchMock.mock.calls[0];
  assert.equal(call.arguments[0], "https://external.example.com/data");
});

test("api adds leading slash for bare paths", async () => {
  mockFetch({ ok: true, json: {} });

  await api("api/health");

  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock.fn>;
  const call = fetchMock.mock.calls[0];
  const url = call.arguments[0] as string;
  assert.ok(url.includes("/api/health"), `expected /api/health in URL, got ${url}`);
});

// ── api() — error path ──────────────────────────────────────────────

test("api throws ApiClientError on non-ok response", async () => {
  mockFetch({
    ok: false,
    status: 422,
    json: { error: { code: "SCHEMA_FAIL", message: "Bad schema", details: { field: "x" } } },
  });

  const err = await api("/api/upload").catch((e: unknown) => e);
  assert.ok(err instanceof ApiClientError);
  assert.equal(err.status, 422);
  assert.equal(err.code, "SCHEMA_FAIL");
  assert.equal(err.message, "Bad schema");
  assert.deepEqual(err.details, { field: "x" });
});

test("api defaults to UNKNOWN code and generic message when error payload is empty", async () => {
  mockFetch({ ok: false, status: 500, json: {} });

  const err = await api("/fail").catch((e: unknown) => e);
  assert.ok(err instanceof ApiClientError);
  assert.equal(err.code, "UNKNOWN");
  assert.equal(err.message, "Request failed.");
});

test("api parses Retry-After header into retryAfterSeconds", async () => {
  mockFetch({
    ok: false,
    status: 429,
    json: { error: { code: "RATE_LIMITED", message: "slow down" } },
    headers: { "Retry-After": "15" },
  });

  const err = await api("/api/upload").catch((e: unknown) => e);
  assert.ok(err instanceof ApiClientError);
  assert.equal(err.retryAfterSeconds, 15);
});

test("api returns null retryAfterSeconds when header is absent", async () => {
  mockFetch({ ok: false, status: 400, json: { error: { code: "BAD", message: "nope" } } });

  const err = await api("/fail").catch((e: unknown) => e);
  assert.ok(err instanceof ApiClientError);
  assert.equal(err.retryAfterSeconds, null);
});

test("api returns null retryAfterSeconds for non-numeric Retry-After", async () => {
  mockFetch({
    ok: false,
    status: 429,
    json: { error: { code: "RATE_LIMITED", message: "slow" } },
    headers: { "Retry-After": "not-a-number" },
  });

  const err = await api("/fail").catch((e: unknown) => e);
  assert.ok(err instanceof ApiClientError);
  assert.equal(err.retryAfterSeconds, null);
});

test("api handles non-JSON response body gracefully", async () => {
  const headers = new Headers();
  const fetchMock = mock.fn(async () => ({
    ok: false,
    status: 502,
    headers,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const err = await api("/fail").catch((e: unknown) => e);
  assert.ok(err instanceof ApiClientError);
  assert.equal(err.status, 502);
  assert.equal(err.code, "UNKNOWN");
});
