import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { DocumentRecord } from "../store/memoryStore.js";

// The memoryStore module captures `const db = getDb()` at module scope.
// Calling closeDatabase() invalidates that reference for all subsequent calls.
// Therefore all store tests must share a single DB lifecycle.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-store-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

const sqlite = await import("../db/sqlite.js");
const store = await import("../store/memoryStore.js");

sqlite.initializeDatabase();

function makeDoc(id: string, userId: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id,
    userId,
    userEmail: `${userId}@example.com`,
    filename: `${id}.docx`,
    fileType: "DOCX",
    documentType: "LECTURE",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 0,
    paragraphCount: 3,
    extractedText: "Lecture slides for module week chapter learning objectives content.",
    studyGuide: null,
    quiz: null,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

test("saveDocument and getDocument round-trip correctly", () => {
  const doc = makeDoc("aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa", "user-crud-1");
  store.saveDocument(doc);

  const retrieved = store.getDocument("aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa");
  assert.ok(retrieved);
  assert.equal(retrieved.id, doc.id);
  assert.equal(retrieved.userId, doc.userId);
  assert.equal(retrieved.filename, doc.filename);
  assert.equal(retrieved.fileType, "DOCX");
  assert.equal(retrieved.documentType, "LECTURE");
  assert.equal(retrieved.status, "uploaded");
  assert.ok(retrieved.extractedText.length > 0);
});

test("getDocument returns undefined for non-existent document", () => {
  const result = store.getDocument("aaaaaaaa-0000-4aaa-8aaa-000000000000");
  assert.equal(result, undefined);
});

test("listDocumentsByUser returns only that user's documents", () => {
  store.saveDocument(makeDoc("aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa", "user-a"));
  store.saveDocument(makeDoc("bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb", "user-a"));
  store.saveDocument(makeDoc("cccccccc-2222-4ccc-8ccc-cccccccccccc", "user-b"));

  const userADocs = store.listDocumentsByUser("user-a");
  const userBDocs = store.listDocumentsByUser("user-b");
  const userCDocs = store.listDocumentsByUser("user-c");

  assert.equal(userADocs.length, 2);
  assert.equal(userBDocs.length, 1);
  assert.equal(userCDocs.length, 0);
});

test("updateDocument mutates and persists document state", () => {
  store.saveDocument(makeDoc("aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa", "user-update"));

  const updated = store.updateDocument("aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa", (c) => ({
    ...c,
    status: "processing",
    errorCode: "STUDY_GUIDE_PROCESSING",
  }));

  assert.ok(updated);
  assert.equal(updated.status, "processing");
  assert.equal(updated.errorCode, "STUDY_GUIDE_PROCESSING");

  const reloaded = store.getDocument("aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa");
  assert.ok(reloaded);
  assert.equal(reloaded.status, "processing");
  assert.equal(reloaded.errorCode, "STUDY_GUIDE_PROCESSING");
});

test("updateDocument returns undefined for non-existent document", () => {
  const result = store.updateDocument("aaaaaaaa-0000-4aaa-8aaa-000000000000", (c) => c);
  assert.equal(result, undefined);
});

test("deleteDocumentsByUser removes all documents and user record", () => {
  store.saveDocument(makeDoc("aaaaaaaa-4444-4aaa-8aaa-aaaaaaaaaaaa", "user-del"));
  store.saveDocument(makeDoc("bbbbbbbb-4444-4bbb-8bbb-bbbbbbbbbbbb", "user-del"));
  store.saveDocument(makeDoc("cccccccc-4444-4ccc-8ccc-cccccccccccc", "user-keep"));

  assert.equal(store.listDocumentsByUser("user-del").length, 2);

  store.deleteDocumentsByUser("user-del");

  assert.equal(store.listDocumentsByUser("user-del").length, 0);
  assert.equal(store.listDocumentsByUser("user-keep").length, 1);
});

test("purgeExpiredDocuments removes old documents and keeps recent ones", () => {
  const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const recentDate = new Date().toISOString();

  store.saveDocument(makeDoc("aaaaaaaa-5555-4aaa-8aaa-aaaaaaaaaaaa", "user-purge", {
    uploadedAt: oldDate,
  }));
  store.saveDocument(makeDoc("bbbbbbbb-5555-4bbb-8bbb-bbbbbbbbbbbb", "user-purge", {
    uploadedAt: recentDate,
  }));

  const purged = store.purgeExpiredDocuments(30);
  assert.equal(purged, 1);

  const remaining = store.listDocumentsByUser("user-purge");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "bbbbbbbb-5555-4bbb-8bbb-bbbbbbbbbbbb");
});

test("saveDocument with studyGuide syncs checklist items to DB", () => {
  const studyGuide = {
    overview: { title: "Test", document_type: "LECTURE" as const, summary: "Sum" },
    key_actions: [],
    checklist: [
      {
        id: "cl-1",
        label: "Review notes",
        supporting_quote: "learning objectives",
        citations: [{ source_type: "docx" as const, anchor_type: "paragraph" as const, paragraph: 1, excerpt: "learning objectives" }],
      },
      {
        id: "cl-2",
        label: "Do exercises",
        supporting_quote: "module content",
        citations: [{ source_type: "docx" as const, anchor_type: "paragraph" as const, paragraph: 2, excerpt: "module content" }],
      },
    ],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [],
  };

  const doc = makeDoc("aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa", "user-checklist", {
    status: "ready",
    extractedText: "learning objectives and module content for the course",
    studyGuide,
  });
  store.saveDocument(doc);

  const ok1 = store.updateChecklistItem("aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa", "cl-1", true);
  assert.equal(ok1, true);

  const ok2 = store.updateChecklistItem("aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa", "cl-2", false);
  assert.equal(ok2, true);

  const notFound = store.updateChecklistItem("aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa", "cl-999", true);
  assert.equal(notFound, false);
});

// Cleanup: close DB and remove temp dir after all tests in this file
test("cleanup store test environment", () => {
  sqlite.closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  assert.ok(true);
});
