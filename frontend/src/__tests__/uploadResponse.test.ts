import test from "node:test";
import assert from "node:assert/strict";
import {
  getDuplicateReuseMessage,
  getUploadRedirectPath,
  shouldTriggerStudyGuideCreate,
} from "@/lib/uploadResponse";

test("getDuplicateReuseMessage returns null for normal upload responses", () => {
  assert.equal(getDuplicateReuseMessage({ reused_existing: false }), null);
  assert.equal(getDuplicateReuseMessage({}), null);
});

test("getDuplicateReuseMessage returns server message for duplicate reuse", () => {
  assert.equal(
    getDuplicateReuseMessage({
      reused_existing: true,
      message: "This document was already uploaded.",
    }),
    "This document was already uploaded."
  );
});

test("getDuplicateReuseMessage falls back to default duplicate message", () => {
  assert.equal(
    getDuplicateReuseMessage({ reused_existing: true }),
    "This file was already uploaded. We reused the existing document and study guide state."
  );
});

test("shouldTriggerStudyGuideCreate only for non-reused uploads", () => {
  assert.equal(shouldTriggerStudyGuideCreate({ reused_existing: false }), true);
  assert.equal(shouldTriggerStudyGuideCreate({}), true);
  assert.equal(shouldTriggerStudyGuideCreate({ reused_existing: true, status: "ready" }), false);
  assert.equal(shouldTriggerStudyGuideCreate({ reused_existing: true, status: "processing" }), false);
  assert.equal(shouldTriggerStudyGuideCreate({ reused_existing: true, status: "failed" }), false);
});

test("getUploadRedirectPath routes by reused document status", () => {
  assert.equal(
    getUploadRedirectPath("doc-1", { reused_existing: false, status: "uploaded" }),
    "/documents/doc-1/processing"
  );
  assert.equal(
    getUploadRedirectPath("doc-1", { reused_existing: true, status: "ready" }),
    "/documents/doc-1"
  );
  assert.equal(
    getUploadRedirectPath("doc-1", { reused_existing: true, status: "processing" }),
    "/documents/doc-1/processing"
  );
  assert.equal(
    getUploadRedirectPath("doc-1", { reused_existing: true, status: "failed" }),
    "/documents/doc-1"
  );
});
