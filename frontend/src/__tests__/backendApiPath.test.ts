import test from "node:test";
import assert from "node:assert/strict";
import { buildBackendApiPath } from "../lib/server/backendApiPath.ts";

test("buildBackendApiPath preserves the backend /api prefix", () => {
  assert.equal(buildBackendApiPath(["auth", "google"]), "/api/auth/google");
});

test("buildBackendApiPath encodes path segments safely", () => {
  assert.equal(buildBackendApiPath(["documents", "hello world"]), "/api/documents/hello%20world");
});
