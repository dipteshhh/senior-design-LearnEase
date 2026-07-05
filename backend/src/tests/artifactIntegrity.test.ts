/**
 * Task 4 artifact integrity checker tests:
 * - healthy store reports OK with correct counts
 * - missing artifact file → file_missing
 * - corrupted artifact bytes → decrypt_failed
 * - valid encryption but broken JSON → parse_failed
 * - orphan artifact directory detection
 * - orphan artifact row detection
 * - output never contains decrypted document content
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

// Set up isolated test DB + encryption before any store imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-integrity-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

const { runIntegrityCheck, formatReportText } = await import("../cli/checkArtifactIntegrity.js");
const { saveDocument, saveVisualObservationsArtifact, deleteDocumentById } = await import(
  "../store/memoryStore.js"
);
const { writeEncryptedText } = await import("../lib/encryption.js");

type DocumentRecord = import("../store/memoryStore.js").DocumentRecord;

const SECRET_SENTINEL = "TOP-SECRET-DOCUMENT-CONTENT-9f8e7d";

function seedDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const doc: DocumentRecord = {
    id: randomUUID(),
    userId: "integrity-user",
    userEmail: "integrity@example.edu",
    filename: "integrity.pdf",
    fileType: "PDF",
    documentType: "LECTURE",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 1,
    paragraphCount: null,
    extractedText: `Lecture text. ${SECRET_SENTINEL}`,
    originalFileBuffer: Buffer.from(`%PDF-1.4 fake ${SECRET_SENTINEL}`, "utf8"),
    studyGuide: null,
    studyGuideStatus: "idle",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    quiz: null,
    quizStatus: "idle",
    quizErrorCode: null,
    quizErrorMessage: null,
    errorCode: null,
    errorMessage: null,
    assignmentDueDate: null,
    assignmentDueTime: null,
    reminderOptIn: false,
    reminderStatus: "pending",
    reminderDeadlineKey: null,
    reminderLastError: null,
    reminderAttemptedAt: null,
    ...overrides,
  };
  saveDocument(doc);
  return doc;
}

function getArtifactPath(documentId: string, artifactType: string): string {
  const row = sqlite
    .getDb()
    .prepare(
      "SELECT encrypted_path FROM document_artifacts WHERE document_id = ? AND artifact_type = ?"
    )
    .get(documentId, artifactType) as { encrypted_path: string } | undefined;
  assert.ok(row, `expected ${artifactType} artifact row for ${documentId}`);
  return row.encrypted_path;
}

function cleanupDocument(documentId: string): void {
  deleteDocumentById(documentId);
}

test("healthy store reports OK with correct counts", () => {
  const doc = seedDocument();
  try {
    const report = runIntegrityCheck();
    assert.equal(report.ok, true);
    assert.ok(report.documentCount >= 1);
    assert.ok((report.artifactCountByType.EXTRACTED_TEXT ?? 0) >= 1);
    assert.ok((report.artifactCountByType.ORIGINAL_FILE ?? 0) >= 1);
    assert.equal(report.problems.length, 0);
    assert.equal(report.orphanDirectories.length, 0);
    assert.equal(report.orphanArtifactRows, 0);
  } finally {
    cleanupDocument(doc.id);
  }
});

test("missing artifact file is reported as file_missing", () => {
  const doc = seedDocument();
  try {
    const extractedPath = getArtifactPath(doc.id, "EXTRACTED_TEXT");
    fs.rmSync(extractedPath);

    const report = runIntegrityCheck();
    assert.equal(report.ok, false);
    const problem = report.problems.find(
      (entry) => entry.documentId === doc.id && entry.artifactType === "EXTRACTED_TEXT"
    );
    assert.ok(problem);
    assert.equal(problem.reason, "file_missing");
  } finally {
    cleanupDocument(doc.id);
  }
});

test("corrupted artifact bytes are reported as decrypt_failed", () => {
  const doc = seedDocument();
  try {
    const extractedPath = getArtifactPath(doc.id, "EXTRACTED_TEXT");
    fs.writeFileSync(extractedPath, Buffer.from("garbage-not-an-envelope"));

    const report = runIntegrityCheck();
    assert.equal(report.ok, false);
    const problem = report.problems.find(
      (entry) => entry.documentId === doc.id && entry.artifactType === "EXTRACTED_TEXT"
    );
    assert.ok(problem);
    assert.equal(problem.reason, "decrypt_failed");
  } finally {
    cleanupDocument(doc.id);
  }
});

test("valid encryption with broken JSON is reported as parse_failed", () => {
  const doc = seedDocument();
  try {
    saveVisualObservationsArtifact(doc.id, {
      document_id: doc.id,
      status: "skipped",
      model: "test-model",
      created_at: new Date().toISOString(),
      source_inventory_artifact_hash: "inventory-hash",
      observations: [],
      warnings: [],
    } as never);
    const observationsPath = getArtifactPath(doc.id, "VISUAL_OBSERVATIONS");
    writeEncryptedText(observationsPath, "this is { not valid json");

    const report = runIntegrityCheck();
    assert.equal(report.ok, false);
    const problem = report.problems.find(
      (entry) => entry.documentId === doc.id && entry.artifactType === "VISUAL_OBSERVATIONS"
    );
    assert.ok(problem);
    assert.equal(problem.reason, "parse_failed");
  } finally {
    cleanupDocument(doc.id);
  }
});

test("healthy visual observations artifact is summarized safely", () => {
  const doc = seedDocument();
  try {
    saveVisualObservationsArtifact(doc.id, {
      document_id: doc.id,
      status: "skipped",
      model: "test-model",
      created_at: new Date().toISOString(),
      source_inventory_artifact_hash: "inventory-hash",
      observations: [],
      warnings: ["Visual observations are only available for lecture documents."],
    } as never);

    const report = runIntegrityCheck();
    const summary = report.visualObservations.find((entry) => entry.documentId === doc.id);
    assert.ok(summary);
    assert.equal(summary.status, "skipped");
    assert.equal(summary.itemCount, 0);
    assert.equal(summary.warningCount, 1);
  } finally {
    cleanupDocument(doc.id);
  }
});

test("orphan artifact directory is detected", () => {
  const orphanId = randomUUID();
  const orphanDir = path.join(process.env.ARTIFACTS_DIR as string, orphanId);
  fs.mkdirSync(orphanDir, { recursive: true });
  fs.writeFileSync(path.join(orphanDir, "leftover.bin"), Buffer.from("leftover"));
  try {
    const report = runIntegrityCheck();
    assert.equal(report.ok, false);
    assert.ok(report.orphanDirectories.includes(orphanId));
  } finally {
    fs.rmSync(orphanDir, { recursive: true, force: true });
  }
});

test("orphan artifact row (no matching document) is detected", () => {
  const db = sqlite.getDb();
  const orphanRowId = randomUUID();
  const orphanDocId = randomUUID();
  db.pragma("foreign_keys = OFF");
  try {
    db.prepare(
      `
        INSERT INTO document_artifacts (id, document_id, artifact_type, encrypted_path, content_hash, created_at)
        VALUES (?, ?, 'EXTRACTED_TEXT', ?, NULL, ?)
      `
    ).run(
      orphanRowId,
      orphanDocId,
      path.join(process.env.ARTIFACTS_DIR as string, orphanDocId, "extracted.txt"),
      new Date().toISOString()
    );

    const report = runIntegrityCheck();
    assert.equal(report.ok, false);
    assert.ok(report.orphanArtifactRows >= 1);
  } finally {
    db.prepare("DELETE FROM document_artifacts WHERE id = ?").run(orphanRowId);
    db.pragma("foreign_keys = ON");
  }
});

test("report output never contains decrypted document content", () => {
  const doc = seedDocument();
  try {
    saveVisualObservationsArtifact(doc.id, {
      document_id: doc.id,
      status: "skipped",
      model: "test-model",
      created_at: new Date().toISOString(),
      source_inventory_artifact_hash: "inventory-hash",
      observations: [],
      warnings: [],
    } as never);

    const report = runIntegrityCheck();
    const jsonOutput = JSON.stringify(report);
    const textOutput = formatReportText(report).join("\n");

    assert.ok(!jsonOutput.includes(SECRET_SENTINEL), "JSON output must not leak document text");
    assert.ok(!textOutput.includes(SECRET_SENTINEL), "text output must not leak document text");
    assert.ok(
      !jsonOutput.includes(process.env.FILE_ENCRYPTION_KEY as string),
      "output must not leak the encryption key"
    );
  } finally {
    cleanupDocument(doc.id);
  }
});

test("deleting a document leaves no artifact rows, files, or directories behind", () => {
  const doc = seedDocument();
  const artifactDir = path.join(process.env.ARTIFACTS_DIR as string, doc.id);
  assert.ok(fs.existsSync(artifactDir), "artifact directory should exist before delete");

  deleteDocumentById(doc.id);

  assert.equal(fs.existsSync(artifactDir), false, "artifact directory must be removed");
  const report = runIntegrityCheck();
  const remaining = report.problems.filter((entry) => entry.documentId === doc.id);
  assert.equal(remaining.length, 0);
  assert.ok(!report.orphanDirectories.includes(doc.id));
});
