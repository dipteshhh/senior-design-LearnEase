import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

type SqliteDatabase = any;

let dbInstance: SqliteDatabase | null = null;

function resolveDatabasePath(): string {
  const configuredPath = process.env.DATABASE_PATH?.trim();
  if (!configuredPath) {
    return path.resolve(process.cwd(), "data", "learnease.sqlite");
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.resolve(process.cwd(), configuredPath);
}

function createDatabase(): SqliteDatabase {
  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

interface TableInfoRow {
  name: string;
}

function hasColumn(db: SqliteDatabase, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((row) => row.name === columnName);
}

function ensureDocumentFlowColumns(db: SqliteDatabase): void {
  const columnDefinitions: Array<{ name: string; sql: string }> = [
    {
      name: "study_guide_status",
      sql: "TEXT NOT NULL DEFAULT 'idle' CHECK (study_guide_status IN ('idle', 'processing', 'ready', 'failed'))",
    },
    { name: "study_guide_error_code", sql: "TEXT" },
    { name: "study_guide_error_message", sql: "TEXT" },
    {
      name: "quiz_status",
      sql: "TEXT NOT NULL DEFAULT 'idle' CHECK (quiz_status IN ('idle', 'processing', 'ready', 'failed'))",
    },
    { name: "quiz_error_code", sql: "TEXT" },
    { name: "quiz_error_message", sql: "TEXT" },
  ];

  for (const column of columnDefinitions) {
    if (!hasColumn(db, "documents", column.name)) {
      db.exec(`ALTER TABLE documents ADD COLUMN ${column.name} ${column.sql};`);
    }
  }
}

function backfillDocumentFlowState(db: SqliteDatabase): void {
  db.exec(`
    UPDATE documents
    SET study_guide_status = CASE
      WHEN study_guide_status = 'idle'
        AND EXISTS (SELECT 1 FROM study_guides sg WHERE sg.document_id = documents.id) THEN 'ready'
      WHEN study_guide_status = 'idle'
        AND status = 'processing'
        AND error_code = 'STUDY_GUIDE_PROCESSING' THEN 'processing'
      WHEN study_guide_status = 'idle'
        AND status = 'failed'
        AND error_code LIKE 'STUDY_GUIDE:%' THEN 'failed'
      ELSE study_guide_status
    END;

    UPDATE documents
    SET quiz_status = CASE
      WHEN quiz_status = 'idle'
        AND EXISTS (SELECT 1 FROM quizzes q WHERE q.document_id = documents.id) THEN 'ready'
      WHEN quiz_status = 'idle'
        AND status = 'processing'
        AND error_code = 'QUIZ_PROCESSING' THEN 'processing'
      WHEN quiz_status = 'idle'
        AND status = 'failed'
        AND error_code LIKE 'QUIZ:%' THEN 'failed'
      ELSE quiz_status
    END;

    UPDATE documents
    SET study_guide_error_code = COALESCE(
      study_guide_error_code,
      CASE
        WHEN study_guide_status = 'processing' THEN 'STUDY_GUIDE_PROCESSING'
        WHEN status = 'failed' AND error_code LIKE 'STUDY_GUIDE:%' THEN error_code
        ELSE NULL
      END
    );

    UPDATE documents
    SET quiz_error_code = COALESCE(
      quiz_error_code,
      CASE
        WHEN quiz_status = 'processing' THEN 'QUIZ_PROCESSING'
        WHEN status = 'failed' AND error_code LIKE 'QUIZ:%' THEN error_code
        ELSE NULL
      END
    );

    UPDATE documents
    SET study_guide_error_message = COALESCE(
      study_guide_error_message,
      CASE
        WHEN study_guide_status = 'failed' AND status = 'failed' AND error_code LIKE 'STUDY_GUIDE:%'
          THEN error_message
        ELSE NULL
      END
    );

    UPDATE documents
    SET quiz_error_message = COALESCE(
      quiz_error_message,
      CASE
        WHEN quiz_status = 'failed' AND status = 'failed' AND error_code LIKE 'QUIZ:%'
          THEN error_message
        ELSE NULL
      END
    );
  `);
}

export function getDb(): SqliteDatabase {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }
  return dbInstance;
}

export function initializeDatabase(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_type TEXT NOT NULL CHECK (file_type IN ('PDF', 'DOCX')),
      page_count INTEGER,
      paragraph_count INTEGER,
      document_type TEXT NOT NULL CHECK (document_type IN ('HOMEWORK', 'LECTURE', 'SYLLABUS', 'UNSUPPORTED')),
      status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
      uploaded_at TEXT NOT NULL,
      processed_at TEXT,
      error_code TEXT,
      error_message TEXT,
      study_guide_status TEXT NOT NULL DEFAULT 'idle' CHECK (study_guide_status IN ('idle', 'processing', 'ready', 'failed')),
      study_guide_error_code TEXT,
      study_guide_error_message TEXT,
      quiz_status TEXT NOT NULL DEFAULT 'idle' CHECK (quiz_status IN ('idle', 'processing', 'ready', 'failed')),
      quiz_error_code TEXT,
      quiz_error_message TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at);

    CREATE TABLE IF NOT EXISTS document_artifacts (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      artifact_type TEXT NOT NULL CHECK (artifact_type IN ('ORIGINAL_FILE', 'EXTRACTED_TEXT')),
      encrypted_path TEXT NOT NULL,
      content_hash TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE (document_id, artifact_type)
    );

    CREATE TABLE IF NOT EXISTS study_guides (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL UNIQUE,
      study_guide_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL UNIQUE,
      quiz_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      label TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_checklist_document_id ON checklist_items(document_id);
  `);

  ensureDocumentFlowColumns(db);
  backfillDocumentFlowState(db);
}

export function closeDatabase(): void {
  if (!dbInstance) {
    return;
  }
  dbInstance.close();
  dbInstance = null;
}
