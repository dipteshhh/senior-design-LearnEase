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
      unsetEnv(key);
    } else {
      setEnv(key, value);
    }
  }
}

function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

function unsetEnv(key: string): void {
  delete process.env[key];
}

test.afterEach(() => {
  restoreEnv();
});

test("getBackendApiBaseUrl uses BACKEND_API_BASE_URL and trims trailing slashes", () => {
  setEnv("NODE_ENV", "production");
  setEnv("BACKEND_API_BASE_URL", "https://api.example.test///");
  setEnv("NEXT_PUBLIC_API_BASE_URL", "https://legacy.example.test");

  assert.equal(getBackendApiBaseUrl(), "https://api.example.test");
});

test("getBackendApiBaseUrl ignores legacy NEXT_PUBLIC_API_BASE_URL", () => {
  setEnv("NODE_ENV", "development");
  unsetEnv("BACKEND_API_BASE_URL");
  setEnv("NEXT_PUBLIC_API_BASE_URL", "https://legacy.example.test");

  assert.equal(getBackendApiBaseUrl(), "http://localhost:3001");
});

test("getBackendApiBaseUrl requires BACKEND_API_BASE_URL in production", () => {
  setEnv("NODE_ENV", "production");
  unsetEnv("BACKEND_API_BASE_URL");
  setEnv("NEXT_PUBLIC_API_BASE_URL", "https://legacy.example.test");

  assert.throws(
    () => getBackendApiBaseUrl(),
    /BACKEND_API_BASE_URL is required in production/
  );
});
