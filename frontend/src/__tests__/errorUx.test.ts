import test from "node:test";
import assert from "node:assert/strict";
import { ApiClientError } from "../lib/api.ts";
import { getErrorMessage } from "../lib/errorUx.ts";

const FALLBACK = "Something went wrong.";

function makeError(
  code: string,
  opts: { status?: number; message?: string; retryAfterSeconds?: number | null } = {}
): ApiClientError {
  return new ApiClientError(
    opts.status ?? 400,
    code,
    opts.message ?? "",
    undefined,
    opts.retryAfterSeconds ?? null
  );
}

test("returns fallback for plain Error", () => {
  assert.equal(getErrorMessage(new Error("boom"), FALLBACK), FALLBACK);
});

test("returns fallback for non-Error values", () => {
  assert.equal(getErrorMessage(null, FALLBACK), FALLBACK);
  assert.equal(getErrorMessage("string error", FALLBACK), FALLBACK);
  assert.equal(getErrorMessage(42, FALLBACK), FALLBACK);
});

test("ALREADY_PROCESSING with retryAfterSeconds", () => {
  const err = makeError("ALREADY_PROCESSING", { retryAfterSeconds: 5 });
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Generation is already in progress. Try again in 5s."
  );
});

test("ALREADY_PROCESSING without retryAfterSeconds", () => {
  const err = makeError("ALREADY_PROCESSING");
  assert.equal(getErrorMessage(err, FALLBACK), "Generation is already in progress.");
});

test("RATE_LIMITED with retryAfterSeconds", () => {
  const err = makeError("RATE_LIMITED", { retryAfterSeconds: 10 });
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Too many requests right now. Please retry in 10s."
  );
});

test("RATE_LIMITED without retryAfterSeconds", () => {
  const err = makeError("RATE_LIMITED");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Too many requests right now. Please wait a moment and retry."
  );
});

test("DOCUMENT_NOT_LECTURE", () => {
  const err = makeError("DOCUMENT_NOT_LECTURE");
  assert.equal(getErrorMessage(err, FALLBACK), "Quiz is available only for lecture documents.");
});

test("DOCUMENT_UNSUPPORTED", () => {
  const err = makeError("DOCUMENT_UNSUPPORTED");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Only supported document types can be processed."
  );
});

test("UNSUPPORTED_MEDIA_TYPE", () => {
  const err = makeError("UNSUPPORTED_MEDIA_TYPE");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Only supported document types can be processed."
  );
});

test("FILE_TOO_LARGE", () => {
  const err = makeError("FILE_TOO_LARGE");
  assert.equal(getErrorMessage(err, FALLBACK), "File is too large. Max size is 50MB.");
});

test("MISSING_FILE", () => {
  const err = makeError("MISSING_FILE");
  assert.equal(getErrorMessage(err, FALLBACK), "Please choose a file before uploading.");
});

test("EXTRACTION_FAILED", () => {
  const err = makeError("EXTRACTION_FAILED");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "We could not process this file. Please try another one."
  );
});

test("INVALID_GOOGLE_TOKEN", () => {
  const err = makeError("INVALID_GOOGLE_TOKEN");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Google sign-in failed. Please try signing in again."
  );
});

test("EMAIL_NOT_VERIFIED", () => {
  const err = makeError("EMAIL_NOT_VERIFIED");
  assert.equal(getErrorMessage(err, FALLBACK), "Your Google email is not verified.");
});

test("AUTH_PROVIDER_UNAVAILABLE", () => {
  const err = makeError("AUTH_PROVIDER_UNAVAILABLE");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Google sign-in is temporarily unavailable. Please try again later."
  );
});

test("GENERATION_FAILED", () => {
  const err = makeError("GENERATION_FAILED");
  assert.equal(
    getErrorMessage(err, FALLBACK),
    "Generation is temporarily unavailable. Please try again later."
  );
});

test("unknown code with non-empty message returns the message", () => {
  const err = makeError("SOME_UNKNOWN_CODE", { message: "Custom server message." });
  assert.equal(getErrorMessage(err, FALLBACK), "Custom server message.");
});

test("unknown code with blank message returns fallback", () => {
  const err = makeError("SOME_UNKNOWN_CODE", { message: "   " });
  assert.equal(getErrorMessage(err, FALLBACK), FALLBACK);
});

test("unknown code with empty message returns fallback", () => {
  const err = makeError("SOME_UNKNOWN_CODE", { message: "" });
  assert.equal(getErrorMessage(err, FALLBACK), FALLBACK);
});
