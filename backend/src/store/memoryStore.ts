import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import type { DocumentType, Quiz, StudyGuide } from "../schemas/analyze.js";
import { getDb } from "../db/sqlite.js";
import {
  readEncryptedText,
  writeEncryptedBuffer,
  writeEncryptedText,
} from "../lib/encryption.js";

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";
export type GenerationStatus = "idle" | "processing" | "ready" | "failed";
export type FileType = "PDF" | "DOCX";

const FLOW_PROCESSING_CODE = {
  STUDY_GUIDE: "STUDY_GUIDE_PROCESSING",
  QUIZ: "QUIZ_PROCESSING",
} as const;

const FLOW_INTERRUPTED_ERROR_CODE = {
  STUDY_GUIDE: "STUDY_GUIDE:GENERATION_INTERRUPTED",
  QUIZ: "QUIZ:GENERATION_INTERRUPTED",
} as const;

const FLOW_INTERRUPTED_ERROR_MESSAGE = {
  STUDY_GUIDE: "Study guide generation was interrupted by server restart. Retry generation.",
  QUIZ: "Quiz generation was interrupted by server restart. Retry generation.",
} as const;

export interface DocumentRecord {
  id: string;
  userId: string;
  userEmail?: string;
  filename: string;
  fileType: FileType;
  documentType: DocumentType;
  status: DocumentStatus;
  uploadedAt: string;
  pageCount: number;
  paragraphCount: number | null;
  extractedText: string;
  originalFileBuffer?: Buffer;
  studyGuide: StudyGuide | null;
  studyGuideStatus: GenerationStatus;
  studyGuideErrorCode: string | null;
  studyGuideErrorMessage: string | null;
  quiz: Quiz | null;
  quizStatus: GenerationStatus;
  quizErrorCode: string | null;
  quizErrorMessage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface DocumentRow {
  id: string;
  user_id: string;
  original_filename: string;
  file_type: FileType;
  page_count: number | null;
  paragraph_count: number | null;
  document_type: DocumentType;
  status: DocumentStatus;
  uploaded_at: string;
  error_code: string | null;
  error_message: string | null;
  study_guide_status: string | null;
  study_guide_error_code: string | null;
  study_guide_error_message: string | null;
  quiz_status: string | null;
  quiz_error_code: string | null;
  quiz_error_message: string | null;
  study_guide_json: string | null;
  quiz_json: string | null;
  extracted_text_path: string | null;
}

interface HydrationOptions {
  includeExtractedText: boolean;
}

const db = getDb();

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isGenerationStatus(value: string | null): value is GenerationStatus {
  return value === "idle" || value === "processing" || value === "ready" || value === "failed";
}

function normalizeFlowStatus(
  value: string | null,
  fallback: GenerationStatus
): GenerationStatus {
  if (isGenerationStatus(value)) {
    return value;
  }
  return fallback;
}

function deriveOverallState(doc: Pick<
  DocumentRecord,
  | "studyGuide"
  | "studyGuideStatus"
  | "studyGuideErrorCode"
  | "studyGuideErrorMessage"
  | "quiz"
  | "quizStatus"
  | "quizErrorCode"
  | "quizErrorMessage"
>): {
  status: DocumentStatus;
  errorCode: string | null;
  errorMessage: string | null;
} {
  if (doc.studyGuideStatus === "processing" || doc.quizStatus === "processing") {
    return {
      status: "processing",
      errorCode:
        doc.studyGuideStatus === "processing"
          ? FLOW_PROCESSING_CODE.STUDY_GUIDE
          : FLOW_PROCESSING_CODE.QUIZ,
      errorMessage: null,
    };
  }

  if (doc.studyGuideStatus === "failed") {
    return {
      status: "failed",
      errorCode: doc.studyGuideErrorCode,
      errorMessage: doc.studyGuideErrorMessage,
    };
  }

  if (doc.quizStatus === "failed") {
    return {
      status: "failed",
      errorCode: doc.quizErrorCode,
      errorMessage: doc.quizErrorMessage,
    };
  }

  if (
    doc.studyGuideStatus === "ready" ||
    doc.quizStatus === "ready" ||
    doc.studyGuide !== null ||
    doc.quiz !== null
  ) {
    return {
      status: "ready",
      errorCode: null,
      errorMessage: null,
    };
  }

  return {
    status: "uploaded",
    errorCode: null,
    errorMessage: null,
  };
}

function withDerivedOverallState(doc: DocumentRecord): DocumentRecord {
  const normalizedStudyGuideStatus =
    doc.studyGuide !== null && doc.studyGuideStatus === "idle" ? "ready" : doc.studyGuideStatus;
  const normalizedQuizStatus =
    doc.quiz !== null && doc.quizStatus === "idle" ? "ready" : doc.quizStatus;

  const normalizedDoc: DocumentRecord = {
    ...doc,
    studyGuideStatus: normalizedStudyGuideStatus,
    quizStatus: normalizedQuizStatus,
  };

  const overall = deriveOverallState(normalizedDoc);
  return {
    ...normalizedDoc,
    status: overall.status,
    errorCode: overall.errorCode,
    errorMessage: overall.errorMessage,
  };
}

function removePathIfExists(targetPath: string): void {
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch {
    // Best-effort cleanup for retention/user deletion.
  }
}

function cleanupDocumentDirectory(documentId: string): void {
  const dir = path.resolve(resolveArtifactsRoot(), documentId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup for retention/user deletion.
  }
}

function resolveArtifactsRoot(): string {
  const configuredPath = process.env.ARTIFACTS_DIR?.trim();
  if (!configuredPath) {
    return path.resolve(process.cwd(), "data", "artifacts");
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.resolve(process.cwd(), configuredPath);
}

function ensureDocumentArtifactDir(documentId: string): string {
  const artifactDir = path.resolve(resolveArtifactsRoot(), documentId);
  fs.mkdirSync(artifactDir, { recursive: true });
  return artifactDir;
}

function writeOriginalArtifact(doc: DocumentRecord): string | null {
  if (!doc.originalFileBuffer) return null;
  const ext = doc.fileType === "PDF" ? "pdf" : "docx";
  const artifactDir = ensureDocumentArtifactDir(doc.id);
  const artifactPath = path.resolve(artifactDir, `original.${ext}`);
  writeEncryptedBuffer(artifactPath, doc.originalFileBuffer);
  return artifactPath;
}

function writeExtractedTextArtifact(doc: DocumentRecord): string {
  const artifactDir = ensureDocumentArtifactDir(doc.id);
  const artifactPath = path.resolve(artifactDir, "extracted.txt");
  writeEncryptedText(artifactPath, doc.extractedText);
  return artifactPath;
}

function upsertUser(userId: string, email?: string, name?: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO users (id, email, name, created_at)
      VALUES (@id, @email, @name, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        email = COALESCE(excluded.email, users.email),
        name = COALESCE(excluded.name, users.name)
    `
  ).run({
    id: userId,
    email: email ?? null,
    name: name ?? null,
    created_at: now,
  });
}

export function upsertAuthenticatedUser(userId: string, email: string, name?: string): void {
  upsertUser(userId, email, name);
}

function upsertArtifact(
  documentId: string,
  artifactType: "ORIGINAL_FILE" | "EXTRACTED_TEXT",
  encryptedPath: string,
  contentHash: string | null
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
      INSERT INTO document_artifacts (
        id,
        document_id,
        artifact_type,
        encrypted_path,
        content_hash,
        created_at
      )
      VALUES (@id, @document_id, @artifact_type, @encrypted_path, @content_hash, @created_at)
      ON CONFLICT(document_id, artifact_type) DO UPDATE SET
        encrypted_path = excluded.encrypted_path,
        content_hash = excluded.content_hash,
        created_at = excluded.created_at
    `
  ).run({
    id: randomUUID(),
    document_id: documentId,
    artifact_type: artifactType,
    encrypted_path: encryptedPath,
    content_hash: contentHash,
    created_at: now,
  });
}

function toStoredChecklistId(documentId: string, itemId: string): string {
  return `${documentId}::${itemId}`;
}

function toLogicalChecklistId(documentId: string, storedId: string): string {
  const prefix = `${documentId}::`;
  if (storedId.startsWith(prefix)) {
    return storedId.slice(prefix.length);
  }
  return storedId;
}

function syncChecklistItems(documentId: string, studyGuide: StudyGuide | null): void {
  if (!studyGuide) return;

  const nextChecklist = studyGuide.checklist.map((item) => ({
    logicalId: item.id,
    storedId: toStoredChecklistId(documentId, item.id),
    label: item.label,
  }));

  const existingRows = db
    .prepare(
      `
        SELECT id, completed
        FROM checklist_items
        WHERE document_id = ?
      `
    )
    .all(documentId) as Array<{ id: string; completed: number }>;

  const completedById = new Map(
    existingRows.map((row) => [
      toLogicalChecklistId(documentId, row.id),
      row.completed === 1,
    ])
  );

  const upsertChecklistItem = db.prepare(
    `
      INSERT INTO checklist_items (id, document_id, label, completed, created_at)
      VALUES (@id, @document_id, @label, @completed, @created_at)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        completed = excluded.completed
    `
  );

  const now = new Date().toISOString();
  for (const item of nextChecklist) {
    upsertChecklistItem.run({
      id: item.storedId,
      document_id: documentId,
      label: item.label,
      completed: completedById.get(item.logicalId) ? 1 : 0,
      created_at: now,
    });
  }

  if (nextChecklist.length === 0) {
    db.prepare("DELETE FROM checklist_items WHERE document_id = ?").run(documentId);
    return;
  }

  const keepIds = nextChecklist.map((item) => item.storedId);
  const placeholders = keepIds.map(() => "?").join(",");
  db.prepare(
    `
      DELETE FROM checklist_items
      WHERE document_id = ? AND id NOT IN (${placeholders})
    `
  ).run(documentId, ...keepIds);
}

function upsertDocument(doc: DocumentRecord): void {
  const processedAt = doc.status === "ready" ? new Date().toISOString() : null;

  db.prepare(
    `
      INSERT INTO documents (
        id,
        user_id,
        original_filename,
        file_type,
        page_count,
        paragraph_count,
        document_type,
        status,
        uploaded_at,
        processed_at,
        error_code,
        error_message,
        study_guide_status,
        study_guide_error_code,
        study_guide_error_message,
        quiz_status,
        quiz_error_code,
        quiz_error_message
      )
      VALUES (
        @id,
        @user_id,
        @original_filename,
        @file_type,
        @page_count,
        @paragraph_count,
        @document_type,
        @status,
        @uploaded_at,
        @processed_at,
        @error_code,
        @error_message,
        @study_guide_status,
        @study_guide_error_code,
        @study_guide_error_message,
        @quiz_status,
        @quiz_error_code,
        @quiz_error_message
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        original_filename = excluded.original_filename,
        file_type = excluded.file_type,
        page_count = excluded.page_count,
        paragraph_count = excluded.paragraph_count,
        document_type = excluded.document_type,
        status = excluded.status,
        uploaded_at = excluded.uploaded_at,
        processed_at = excluded.processed_at,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        study_guide_status = excluded.study_guide_status,
        study_guide_error_code = excluded.study_guide_error_code,
        study_guide_error_message = excluded.study_guide_error_message,
        quiz_status = excluded.quiz_status,
        quiz_error_code = excluded.quiz_error_code,
        quiz_error_message = excluded.quiz_error_message
    `
  ).run({
    id: doc.id,
    user_id: doc.userId,
    original_filename: doc.filename,
    file_type: doc.fileType,
    page_count: doc.pageCount,
    paragraph_count: doc.paragraphCount,
    document_type: doc.documentType,
    status: doc.status,
    uploaded_at: doc.uploadedAt,
    processed_at: processedAt,
    error_code: doc.errorCode,
    error_message: doc.errorMessage,
    study_guide_status: doc.studyGuideStatus,
    study_guide_error_code: doc.studyGuideErrorCode,
    study_guide_error_message: doc.studyGuideErrorMessage,
    quiz_status: doc.quizStatus,
    quiz_error_code: doc.quizErrorCode,
    quiz_error_message: doc.quizErrorMessage,
  });

  if (doc.studyGuide) {
    db.prepare(
      `
        INSERT INTO study_guides (id, document_id, study_guide_json, created_at)
        VALUES (@id, @document_id, @study_guide_json, @created_at)
        ON CONFLICT(document_id) DO UPDATE SET
          study_guide_json = excluded.study_guide_json,
          created_at = excluded.created_at
      `
    ).run({
      id: randomUUID(),
      document_id: doc.id,
      study_guide_json: JSON.stringify(doc.studyGuide),
      created_at: new Date().toISOString(),
    });

    syncChecklistItems(doc.id, doc.studyGuide);
  }

  if (doc.quiz) {
    db.prepare(
      `
        INSERT INTO quizzes (id, document_id, quiz_json, created_at)
        VALUES (@id, @document_id, @quiz_json, @created_at)
        ON CONFLICT(document_id) DO UPDATE SET
          quiz_json = excluded.quiz_json,
          created_at = excluded.created_at
      `
    ).run({
      id: randomUUID(),
      document_id: doc.id,
      quiz_json: JSON.stringify(doc.quiz),
      created_at: new Date().toISOString(),
    });
  }

  if (doc.extractedText && doc.extractedText.trim().length > 0) {
    const extractedPath = writeExtractedTextArtifact(doc);
    const contentHash = createHash("sha256").update(doc.extractedText).digest("hex");
    upsertArtifact(doc.id, "EXTRACTED_TEXT", extractedPath, contentHash);
  }

  const originalPath = writeOriginalArtifact(doc);
  if (originalPath) {
    upsertArtifact(doc.id, "ORIGINAL_FILE", originalPath, null);
  }
}

function readDocumentRowById(id: string): DocumentRow | undefined {
  return db
    .prepare(
      `
        SELECT
          d.id,
          d.user_id,
          d.original_filename,
          d.file_type,
          d.page_count,
          d.paragraph_count,
          d.document_type,
          d.status,
          d.uploaded_at,
          d.error_code,
          d.error_message,
          d.study_guide_status,
          d.study_guide_error_code,
          d.study_guide_error_message,
          d.quiz_status,
          d.quiz_error_code,
          d.quiz_error_message,
          sg.study_guide_json,
          q.quiz_json,
          da.encrypted_path AS extracted_text_path
        FROM documents d
        LEFT JOIN study_guides sg ON sg.document_id = d.id
        LEFT JOIN quizzes q ON q.document_id = d.id
        LEFT JOIN document_artifacts da
          ON da.document_id = d.id
          AND da.artifact_type = 'EXTRACTED_TEXT'
        WHERE d.id = ?
      `
    )
    .get(id) as DocumentRow | undefined;
}

function hydrateDocument(row: DocumentRow, options: HydrationOptions): DocumentRecord {
  let extractedText = "";
  if (options.includeExtractedText && row.extracted_text_path) {
    try {
      extractedText = readEncryptedText(row.extracted_text_path);
    } catch {
      extractedText = "";
    }
  }

  const studyGuide = parseJson<StudyGuide>(row.study_guide_json);
  const quiz = parseJson<Quiz>(row.quiz_json);

  const studyGuideStatus = normalizeFlowStatus(
    row.study_guide_status,
    studyGuide ? "ready" : "idle"
  );
  const quizStatus = normalizeFlowStatus(row.quiz_status, quiz ? "ready" : "idle");

  const studyGuideErrorCode =
    row.study_guide_error_code ??
    (row.error_code?.startsWith("STUDY_GUIDE:") ? row.error_code : null);
  const quizErrorCode =
    row.quiz_error_code ?? (row.error_code?.startsWith("QUIZ:") ? row.error_code : null);

  const studyGuideErrorMessage =
    row.study_guide_error_message ??
    (studyGuideStatus === "failed" && row.error_code?.startsWith("STUDY_GUIDE:")
      ? row.error_message
      : null);
  const quizErrorMessage =
    row.quiz_error_message ??
    (quizStatus === "failed" && row.error_code?.startsWith("QUIZ:") ? row.error_message : null);

  const base: DocumentRecord = {
    id: row.id,
    userId: row.user_id,
    filename: row.original_filename,
    fileType: row.file_type,
    documentType: row.document_type,
    status: row.status,
    uploadedAt: row.uploaded_at,
    pageCount: row.page_count ?? 0,
    paragraphCount: row.paragraph_count,
    extractedText,
    studyGuide,
    studyGuideStatus,
    studyGuideErrorCode,
    studyGuideErrorMessage,
    quiz,
    quizStatus,
    quizErrorCode,
    quizErrorMessage,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };

  return withDerivedOverallState(base);
}

export function saveDocument(doc: DocumentRecord): void {
  const normalizedDoc = withDerivedOverallState(doc);
  const tx = db.transaction(() => {
    upsertUser(normalizedDoc.userId, normalizedDoc.userEmail);
    upsertDocument(normalizedDoc);
  });
  tx();
}

export function getDocument(id: string): DocumentRecord | undefined {
  const row = readDocumentRowById(id);
  return row ? hydrateDocument(row, { includeExtractedText: true }) : undefined;
}

export function listDocuments(): DocumentRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          d.id,
          d.user_id,
          d.original_filename,
          d.file_type,
          d.page_count,
          d.paragraph_count,
          d.document_type,
          d.status,
          d.uploaded_at,
          d.error_code,
          d.error_message,
          d.study_guide_status,
          d.study_guide_error_code,
          d.study_guide_error_message,
          d.quiz_status,
          d.quiz_error_code,
          d.quiz_error_message,
          sg.study_guide_json,
          q.quiz_json,
          NULL AS extracted_text_path
        FROM documents d
        LEFT JOIN study_guides sg ON sg.document_id = d.id
        LEFT JOIN quizzes q ON q.document_id = d.id
        ORDER BY d.uploaded_at DESC
      `
    )
    .all() as DocumentRow[];

  return rows.map((row) => hydrateDocument(row, { includeExtractedText: false }));
}

export function listDocumentsByUser(userId: string): DocumentRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          d.id,
          d.user_id,
          d.original_filename,
          d.file_type,
          d.page_count,
          d.paragraph_count,
          d.document_type,
          d.status,
          d.uploaded_at,
          d.error_code,
          d.error_message,
          d.study_guide_status,
          d.study_guide_error_code,
          d.study_guide_error_message,
          d.quiz_status,
          d.quiz_error_code,
          d.quiz_error_message,
          sg.study_guide_json,
          q.quiz_json,
          NULL AS extracted_text_path
        FROM documents d
        LEFT JOIN study_guides sg ON sg.document_id = d.id
        LEFT JOIN quizzes q ON q.document_id = d.id
        WHERE d.user_id = ?
        ORDER BY d.uploaded_at DESC
      `
    )
    .all(userId) as DocumentRow[];

  return rows.map((row) => hydrateDocument(row, { includeExtractedText: false }));
}

export function updateDocument(
  id: string,
  mutator: (current: DocumentRecord) => DocumentRecord
): DocumentRecord | undefined {
  const current = getDocument(id);
  if (!current) return undefined;

  const next = withDerivedOverallState(mutator(current));
  const tx = db.transaction(() => {
    upsertUser(next.userId, next.userEmail);
    upsertDocument(next);
  });
  tx();
  return next;
}

function listArtifactPathsByDocumentIds(documentIds: string[]): string[] {
  if (documentIds.length === 0) return [];
  const placeholders = documentIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
        SELECT encrypted_path
        FROM document_artifacts
        WHERE document_id IN (${placeholders})
      `
    )
    .all(...documentIds) as Array<{ encrypted_path: string }>;
  return rows.map((row) => row.encrypted_path);
}

export function deleteAllDocuments(): void {
  const documentIds = db
    .prepare("SELECT id FROM documents")
    .all() as Array<{ id: string }>;
  const ids = documentIds.map((row) => row.id);
  const artifactPaths = listArtifactPathsByDocumentIds(ids);

  db.prepare("DELETE FROM documents").run();

  for (const artifactPath of artifactPaths) {
    removePathIfExists(artifactPath);
  }
  for (const documentId of ids) {
    cleanupDocumentDirectory(documentId);
  }
}

export function deleteDocumentsByUser(userId: string): void {
  const documentIds = db
    .prepare(
      `
        SELECT id
        FROM documents
        WHERE user_id = ?
      `
    )
    .all(userId) as Array<{ id: string }>;
  const ids = documentIds.map((row) => row.id);
  const artifactPaths = listArtifactPathsByDocumentIds(ids);

  db.prepare("DELETE FROM documents WHERE user_id = ?").run(userId);

  for (const artifactPath of artifactPaths) {
    removePathIfExists(artifactPath);
  }
  for (const documentId of ids) {
    cleanupDocumentDirectory(documentId);
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

export function deleteDocumentById(documentId: string): boolean {
  const artifactPaths = listArtifactPathsByDocumentIds([documentId]);
  const result = db
    .prepare(
      `
        DELETE FROM documents
        WHERE id = ?
      `
    )
    .run(documentId);
  if (result.changes === 0) {
    return false;
  }

  for (const artifactPath of artifactPaths) {
    removePathIfExists(artifactPath);
  }
  cleanupDocumentDirectory(documentId);

  return true;
}

export function updateChecklistItem(
  documentId: string,
  itemId: string,
  completed: boolean
): boolean {
  const storedId = toStoredChecklistId(documentId, itemId);
  const result = db
    .prepare(
      `
        UPDATE checklist_items
        SET completed = ?
        WHERE document_id = ? AND (id = ? OR id = ?)
      `
    )
    .run(completed ? 1 : 0, documentId, storedId, itemId);
  return result.changes > 0;
}

export function purgeExpiredDocuments(retentionDays = 30): number {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `
        SELECT id
        FROM documents
        WHERE uploaded_at < ?
      `
    )
    .all(cutoff) as Array<{ id: string }>;

  if (rows.length === 0) {
    return 0;
  }

  const ids = rows.map((row) => row.id);
  const artifactPaths = listArtifactPathsByDocumentIds(ids);

  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM documents WHERE id IN (${placeholders})`).run(...ids);

  for (const artifactPath of artifactPaths) {
    removePathIfExists(artifactPath);
  }
  for (const documentId of ids) {
    cleanupDocumentDirectory(documentId);
  }

  return ids.length;
}

export function recoverInterruptedProcessingDocuments(): number {
  const markStudyGuideInterrupted = db
    .prepare(
      `
        UPDATE documents
        SET
          study_guide_status = 'failed',
          study_guide_error_code = ?,
          study_guide_error_message = ?
        WHERE study_guide_status = 'processing'
      `
    )
    .run(
      FLOW_INTERRUPTED_ERROR_CODE.STUDY_GUIDE,
      FLOW_INTERRUPTED_ERROR_MESSAGE.STUDY_GUIDE
    );

  const markQuizInterrupted = db
    .prepare(
      `
        UPDATE documents
        SET
          quiz_status = 'failed',
          quiz_error_code = ?,
          quiz_error_message = ?
        WHERE quiz_status = 'processing'
      `
    )
    .run(FLOW_INTERRUPTED_ERROR_CODE.QUIZ, FLOW_INTERRUPTED_ERROR_MESSAGE.QUIZ);

  const legacyStudyGuide = db
    .prepare(
      `
        UPDATE documents
        SET
          study_guide_status = 'failed',
          study_guide_error_code = ?,
          study_guide_error_message = ?
        WHERE
          study_guide_status = 'idle'
          AND status = 'processing'
          AND error_code = 'STUDY_GUIDE_PROCESSING'
      `
    )
    .run(
      FLOW_INTERRUPTED_ERROR_CODE.STUDY_GUIDE,
      FLOW_INTERRUPTED_ERROR_MESSAGE.STUDY_GUIDE
    );

  const legacyQuiz = db
    .prepare(
      `
        UPDATE documents
        SET
          quiz_status = 'failed',
          quiz_error_code = ?,
          quiz_error_message = ?
        WHERE
          quiz_status = 'idle'
          AND status = 'processing'
          AND error_code = 'QUIZ_PROCESSING'
      `
    )
    .run(FLOW_INTERRUPTED_ERROR_CODE.QUIZ, FLOW_INTERRUPTED_ERROR_MESSAGE.QUIZ);

  return (
    markStudyGuideInterrupted.changes +
    markQuizInterrupted.changes +
    legacyStudyGuide.changes +
    legacyQuiz.changes
  );
}
