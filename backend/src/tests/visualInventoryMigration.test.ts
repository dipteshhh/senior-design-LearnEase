import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

// Isolated DB so we can exercise the VISUAL_INVENTORY artifact-type migration
// starting from the pre-Phase-2A schema (CHECK without VISUAL_INVENTORY).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-migration-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

const sqlite = await import("../db/sqlite.js");

function tableSql(name: string): string | null {
  const row = sqlite
    .getDb()
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { sql: string | null } | undefined;
  return row?.sql ?? null;
}

function tableExists(name: string): boolean {
  const row = sqlite
    .getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== undefined;
}

test("ensureVisualInventoryArtifactType migrates a legacy document_artifacts table safely", () => {
  sqlite.initializeDatabase();
  const db = sqlite.getDb();

  // Seed a user + document + artifact so the FK + INSERT...SELECT path is exercised.
  db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(
    "user-mig-1",
    "2026-06-26T12:00:00.000Z"
  );
  db.prepare(
    `INSERT INTO documents (id, user_id, original_filename, file_type, document_type, status, uploaded_at)
     VALUES (?, ?, ?, 'DOCX', 'LECTURE', 'uploaded', ?)`
  ).run("doc-mig-1", "user-mig-1", "legacy.docx", "2026-06-26T12:00:00.000Z");
  db.prepare(
    `INSERT INTO document_artifacts (id, document_id, artifact_type, encrypted_path, content_hash, created_at)
     VALUES (?, ?, 'ORIGINAL_FILE', ?, ?, ?)`
  ).run(
    "artifact-mig-1",
    "doc-mig-1",
    "/tmp/original.docx",
    "hash-original",
    "2026-06-26T12:00:00.000Z"
  );

  // Downgrade document_artifacts to the legacy CHECK (no VISUAL_INVENTORY),
  // preserving the seeded row, to simulate an existing pre-Phase-2A database.
  const downgrade = db.transaction(() => {
    db.exec(`
      ALTER TABLE document_artifacts RENAME TO document_artifacts_old;

      CREATE TABLE document_artifacts (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL CHECK (artifact_type IN ('ORIGINAL_FILE', 'EXTRACTED_TEXT')),
        encrypted_path TEXT NOT NULL,
        content_hash TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        UNIQUE (document_id, artifact_type)
      );

      INSERT INTO document_artifacts
        SELECT id, document_id, artifact_type, encrypted_path, content_hash, created_at
        FROM document_artifacts_old;

      DROP TABLE document_artifacts_old;
    `);
  });
  downgrade();

  assert.equal(tableSql("document_artifacts")?.includes("'VISUAL_INVENTORY'"), false);

  // Re-run initialization: the migration should upgrade the CHECK in place.
  sqlite.initializeDatabase();

  assert.equal(tableSql("document_artifacts")?.includes("'VISUAL_INVENTORY'"), true);
  assert.equal(tableExists("document_artifacts_legacy"), false);

  // Existing row preserved through the migration.
  const seeded = db
    .prepare("SELECT artifact_type, encrypted_path, content_hash FROM document_artifacts WHERE id = ?")
    .get("artifact-mig-1") as
    | { artifact_type: string; encrypted_path: string; content_hash: string | null }
    | undefined;
  assert.ok(seeded);
  assert.equal(seeded.artifact_type, "ORIGINAL_FILE");
  assert.equal(seeded.encrypted_path, "/tmp/original.docx");
  assert.equal(seeded.content_hash, "hash-original");

  // The relaxed CHECK now accepts VISUAL_INVENTORY rows.
  db.prepare(
    `INSERT INTO document_artifacts (id, document_id, artifact_type, encrypted_path, content_hash, created_at)
     VALUES (?, ?, 'VISUAL_INVENTORY', ?, ?, ?)`
  ).run(
    "artifact-mig-visual",
    "doc-mig-1",
    "/tmp/visual-inventory.json",
    "hash-visual",
    "2026-06-26T12:00:00.000Z"
  );
  const visualRow = db
    .prepare("SELECT artifact_type FROM document_artifacts WHERE id = ?")
    .get("artifact-mig-visual") as { artifact_type: string } | undefined;
  assert.equal(visualRow?.artifact_type, "VISUAL_INVENTORY");
});

test("ensureVisualInventoryArtifactType is idempotent on an already-migrated database", () => {
  const beforeCount = (
    sqlite
      .getDb()
      .prepare("SELECT COUNT(*) AS count FROM document_artifacts")
      .get() as { count: number }
  ).count;

  // Running initialization again must not error, recreate, or strand a legacy table.
  sqlite.initializeDatabase();
  sqlite.initializeDatabase();

  assert.equal(tableExists("document_artifacts_legacy"), false);
  const afterCount = (
    sqlite
      .getDb()
      .prepare("SELECT COUNT(*) AS count FROM document_artifacts")
      .get() as { count: number }
  ).count;
  assert.equal(afterCount, beforeCount);
});

test("cleanup migration test environment", () => {
  sqlite.closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
