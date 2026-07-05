import test from "node:test";
import assert from "node:assert/strict";
import { getBackendApiBaseUrl } from "../lib/server/backendApi.ts";

const ORIGINAL_ENV = {
  BACKEND_API_BASE_URL: process.env.BACKEND_API_BASE_URL,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NODE_ENV: process.env.NODE_ENV,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test.afterEach(() => {
  restoreEnv();
});

test("getBackendApiBaseUrl uses BACKEND_API_BASE_URL and trims trailing slashes", () => {
  process.env.NODE_ENV = "production";
  process.env.BACKEND_API_BASE_URL = "https://api.example.test///";
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://legacy.example.test";

  assert.equal(getBackendApiBaseUrl(), "https://api.example.test");
});

test("getBackendApiBaseUrl ignores legacy NEXT_PUBLIC_API_BASE_URL", () => {
  process.env.NODE_ENV = "development";
  delete process.env.BACKEND_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://legacy.example.test";

  assert.equal(getBackendApiBaseUrl(), "http://localhost:3001");
});

test("getBackendApiBaseUrl requires BACKEND_API_BASE_URL in production", () => {
  process.env.NODE_ENV = "production";
  delete process.env.BACKEND_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://legacy.example.test";

  assert.throws(
    () => getBackendApiBaseUrl(),
    /BACKEND_API_BASE_URL is required in production/
  );
});
