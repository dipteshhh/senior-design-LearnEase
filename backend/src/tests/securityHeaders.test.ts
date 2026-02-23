import test from "node:test";
import assert from "node:assert/strict";
import { securityHeaders } from "../middleware/securityHeaders.js";

interface MockResponse {
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
}

function createMockResponse(): MockResponse {
  return {
    headers: {},
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  };
}

test("securityHeaders sets baseline API security headers", () => {
  const req = { secure: false } as any;
  const res = createMockResponse();
  let nextCalled = false;

  securityHeaders(req, res as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(
    res.headers["Content-Security-Policy"],
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  );
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
  assert.equal(res.headers["Referrer-Policy"], "no-referrer");
  assert.equal(res.headers["X-DNS-Prefetch-Control"], "off");
  assert.equal(res.headers["X-Download-Options"], "noopen");
  assert.equal(res.headers["X-Permitted-Cross-Domain-Policies"], "none");
  assert.equal(
    res.headers["Permissions-Policy"],
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  assert.equal(res.headers["Strict-Transport-Security"], undefined);
});

