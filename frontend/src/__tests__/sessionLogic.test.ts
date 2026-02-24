import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "../lib/api.ts";
import {
  isUnauthorizedSessionError,
  shouldRedirectToSignIn,
} from "../lib/auth/sessionLogic.ts";

test("isUnauthorizedSessionError returns true for 401 ApiClientError", () => {
  const error = new ApiClientError(401, "UNAUTHORIZED", "Session expired.", undefined, null);
  assert.equal(isUnauthorizedSessionError(error), true);
});

test("isUnauthorizedSessionError returns false for non-401 ApiClientError", () => {
  const error = new ApiClientError(503, "SERVICE_UNAVAILABLE", "Backend unavailable.", undefined, null);
  assert.equal(isUnauthorizedSessionError(error), false);
});

test("isUnauthorizedSessionError returns false for generic errors", () => {
  assert.equal(isUnauthorizedSessionError(new Error("network failed")), false);
  assert.equal(isUnauthorizedSessionError("timeout"), false);
});

test("shouldRedirectToSignIn redirects only when user is missing after a clean session check", () => {
  assert.equal(
    shouldRedirectToSignIn({ isLoading: false, hasUser: false, hasSessionCheckError: false }),
    true
  );
  assert.equal(
    shouldRedirectToSignIn({ isLoading: false, hasUser: false, hasSessionCheckError: true }),
    false
  );
  assert.equal(
    shouldRedirectToSignIn({ isLoading: true, hasUser: false, hasSessionCheckError: false }),
    false
  );
  assert.equal(
    shouldRedirectToSignIn({ isLoading: false, hasUser: true, hasSessionCheckError: false }),
    false
  );
});
