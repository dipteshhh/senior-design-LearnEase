import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { DocumentRecord } from "../store/memoryStore.js";

function makeStudyGuide(itemId: string, label: string) {
  return {
    overview: {
      title: "Sample",
      document_type: "HOMEWORK" as const,
      summary: "Summary",
    },
    key_actions: [],
    checklist: [
      {
        id: itemId,
        label,
        supporting_quote: "Submit by Friday.",
        citations: [
          {
            source_type: "docx" as const,
            anchor_type: "paragraph" as const,
            paragraph: 1,
            excerpt: "Submit by Friday.",
          },
        ],
      },
    ],
    important_details: {
      dates: [],
      policies: [],
      contacts: [],
      logistics: [],
    },
    sections: [],
  };
}

function makeDocument(id: string, userId: string, checklistLabel: string): DocumentRecord {
  return {
    id,
    userId,
    userEmail: `${userId}@example.com`,
    filename: `${id}.docx`,
    fileType: "DOCX",
    documentType: "HOMEWORK",
    status: "ready",
    uploadedAt: new Date().toISOString(),
    pageCount: 0,
    paragraphCount: 1,
    extractedText: "Submit by Friday.",
    studyGuide: makeStudyGuide("1", checklistLabel),
    studyGuideStatus: "ready",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    quiz: null,
    quizStatus: "idle",
    quizErrorCode: null,
    quizErrorMessage: null,
    errorCode: null,
    errorMessage: null,
  };
}

test("checklist item IDs do not collide across documents", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-checklist-"));
  process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
  process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

  const sqlite = await import("../db/sqlite.js");
  const store = await import("../store/memoryStore.js");

  try {
    sqlite.initializeDatabase();

    store.saveDocument(makeDocument("doc-a", "user-a", "Checklist A"));
    store.saveDocument(makeDocument("doc-b", "user-a", "Checklist B"));

    const updatedDocA = store.updateChecklistItem("doc-a", "1", true);
    const updatedDocB = store.updateChecklistItem("doc-b", "1", true);

    assert.equal(updatedDocA, true);
    assert.equal(updatedDocB, true);
  } finally {
    sqlite.closeDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
