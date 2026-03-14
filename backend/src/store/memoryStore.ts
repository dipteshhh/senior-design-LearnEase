import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import type { DocumentType, Quiz, StudyGuide } from "../schemas/analyze.js";
import { getDb } from "../db/sqlite.js";
import {
  readEncryptedBuffer,
  readEncryptedText,
  writeEncryptedBuffer,
  writeEncryptedText,
} from "../lib/encryption.js";

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";
export type GenerationStatus = "idle" | "processing" | "ready" | "failed";
export type FileType = "PDF" | "DOCX";
export type ReminderStatus = "pending" | "sending" | "sent" | "failed" | "skipped" | "past_due";

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
  contentHash?: string | null;
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
  assignmentDueDate: string | null;
  assignmentDueTime: string | null;
  reminderOptIn: boolean;
  reminderStatus: ReminderStatus;
  reminderDeadlineKey: string | null;
  reminderLastError: string | null;
  reminderAttemptedAt: string | null;
}

interface DocumentRow {
  id: string;
  user_id: string;
  original_filename: string;
  file_type: FileType;
  content_hash?: string | null;
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
  assignment_due_date: string | null;
  assignment_due_time: string | null;
  reminder_sent: number | null;
  reminder_opt_in: number | null;
  reminder_status: string | null;
  reminder_deadline_key: string | null;
  reminder_last_error: string | null;
  reminder_attempted_at: string | null;
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
        content_hash,
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
        quiz_error_message,
        assignment_due_date,
        assignment_due_time,
        reminder_sent,
        reminder_opt_in,
        reminder_status,
        reminder_deadline_key,
        reminder_last_error,
        reminder_attempted_at
      )
      VALUES (
        @id,
        @user_id,
        @original_filename,
        @file_type,
        @content_hash,
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
        @quiz_error_message,
        @assignment_due_date,
        @assignment_due_time,
        @reminder_sent,
        @reminder_opt_in,
        @reminder_status,
        @reminder_deadline_key,
        @reminder_last_error,
        @reminder_attempted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        original_filename = excluded.original_filename,
        file_type = excluded.file_type,
        content_hash = excluded.content_hash,
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
        quiz_error_message = excluded.quiz_error_message,
        assignment_due_date = excluded.assignment_due_date,
        assignment_due_time = excluded.assignment_due_time,
        reminder_sent = excluded.reminder_sent,
        reminder_opt_in = excluded.reminder_opt_in,
        reminder_status = excluded.reminder_status,
        reminder_deadline_key = excluded.reminder_deadline_key,
        reminder_last_error = excluded.reminder_last_error,
        reminder_attempted_at = excluded.reminder_attempted_at
    `
  ).run({
    id: doc.id,
    user_id: doc.userId,
    original_filename: doc.filename,
    file_type: doc.fileType,
    content_hash: doc.contentHash ?? null,
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
    assignment_due_date: doc.assignmentDueDate,
    assignment_due_time: doc.assignmentDueTime,
    reminder_sent: doc.reminderStatus === "sent" ? 1 : 0,
    reminder_opt_in: doc.reminderOptIn ? 1 : 0,
    reminder_status: doc.reminderStatus,
    reminder_deadline_key: doc.reminderDeadlineKey,
    reminder_last_error: doc.reminderLastError,
    reminder_attempted_at: doc.reminderAttemptedAt,
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
          d.content_hash,
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
          da.encrypted_path AS extracted_text_path,
          d.assignment_due_date,
          d.assignment_due_time,
          d.reminder_sent,
          d.reminder_opt_in,
          d.reminder_status,
          d.reminder_deadline_key,
          d.reminder_last_error,
          d.reminder_attempted_at
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
    contentHash: row.content_hash ?? null,
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
    assignmentDueDate: row.assignment_due_date ?? null,
    assignmentDueTime: row.assignment_due_time ?? null,
    reminderOptIn: (row.reminder_opt_in ?? 0) === 1,
    reminderStatus: (row.reminder_status as ReminderStatus) ?? "pending",
    reminderDeadlineKey: row.reminder_deadline_key ?? null,
    reminderLastError: row.reminder_last_error ?? null,
    reminderAttemptedAt: row.reminder_attempted_at ?? null,
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

/**
 * Lightweight ownership check — returns only user_id without full hydration,
 * decryption, or JSON parsing. Use for auth gates that only need to verify
 * the document exists and is owned by the requesting user.
 */
export function getDocumentOwnerId(id: string): string | undefined {
  const row = db
    .prepare("SELECT user_id FROM documents WHERE id = ?")
    .get(id) as { user_id: string } | undefined;
  return row?.user_id;
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
          d.content_hash,
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
          NULL AS extracted_text_path,
          d.assignment_due_date,
          d.assignment_due_time,
          d.reminder_sent,
          d.reminder_opt_in,
          d.reminder_status,
          d.reminder_deadline_key,
          d.reminder_last_error,
          d.reminder_attempted_at
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
          d.content_hash,
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
          NULL AS extracted_text_path,
          d.assignment_due_date,
          d.assignment_due_time,
          d.reminder_sent,
          d.reminder_opt_in,
          d.reminder_status,
          d.reminder_deadline_key,
          d.reminder_last_error,
          d.reminder_attempted_at
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

/**
 * Lightweight list query for dashboard/list views that avoids loading and
 * parsing full study_guide/quiz JSON blobs. Uses EXISTS subqueries instead
 * of JOINs to determine has_study_guide/has_quiz as boolean flags.
 */
export interface DocumentSummary {
  id: string;
  userId: string;
  filename: string;
  fileType: FileType;
  documentType: DocumentType;
  status: DocumentStatus;
  uploadedAt: string;
  pageCount: number;
  studyGuideStatus: GenerationStatus;
  quizStatus: GenerationStatus;
  errorCode: string | null;
  errorMessage: string | null;
  hasStudyGuide: boolean;
  hasQuiz: boolean;
  assignmentDueDate: string | null;
  assignmentDueTime: string | null;
  reminderOptIn: boolean;
  reminderStatus: ReminderStatus;
}

interface DocumentSummaryRow {
  id: string;
  user_id: string;
  original_filename: string;
  file_type: FileType;
  page_count: number | null;
  document_type: DocumentType;
  status: DocumentStatus;
  uploaded_at: string;
  error_code: string | null;
  error_message: string | null;
  study_guide_status: string | null;
  quiz_status: string | null;
  has_study_guide: number;
  has_quiz: number;
  assignment_due_date: string | null;
  assignment_due_time: string | null;
  reminder_opt_in: number | null;
  reminder_status: string | null;
}

export function listDocumentSummariesByUser(userId: string): DocumentSummary[] {
  const rows = db
    .prepare(
      `
        SELECT
          d.id,
          d.user_id,
          d.original_filename,
          d.file_type,
          d.page_count,
          d.document_type,
          d.status,
          d.uploaded_at,
          d.error_code,
          d.error_message,
          d.study_guide_status,
          d.quiz_status,
          EXISTS (SELECT 1 FROM study_guides sg WHERE sg.document_id = d.id) AS has_study_guide,
          EXISTS (SELECT 1 FROM quizzes q WHERE q.document_id = d.id) AS has_quiz,
          d.assignment_due_date,
          d.assignment_due_time,
          d.reminder_opt_in,
          d.reminder_status
        FROM documents d
        WHERE d.user_id = ?
        ORDER BY d.uploaded_at DESC
      `
    )
    .all(userId) as DocumentSummaryRow[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    filename: row.original_filename,
    fileType: row.file_type,
    documentType: row.document_type,
    status: row.status,
    uploadedAt: row.uploaded_at,
    pageCount: row.page_count ?? 0,
    studyGuideStatus: normalizeFlowStatus(
      row.study_guide_status,
      row.has_study_guide ? "ready" : "idle"
    ),
    quizStatus: normalizeFlowStatus(
      row.quiz_status,
      row.has_quiz ? "ready" : "idle"
    ),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    hasStudyGuide: row.has_study_guide === 1,
    hasQuiz: row.has_quiz === 1,
    assignmentDueDate: row.assignment_due_date ?? null,
    assignmentDueTime: row.assignment_due_time ?? null,
    reminderOptIn: (row.reminder_opt_in ?? 0) === 1,
    reminderStatus: (row.reminder_status as ReminderStatus) ?? "pending",
  }));
}

export function findDocumentIdByUserAndContentHash(
  userId: string,
  contentHash: string
): string | undefined {
  const row = db
    .prepare(
      `
        SELECT id
        FROM documents
        WHERE user_id = ? AND content_hash = ?
        ORDER BY uploaded_at DESC
        LIMIT 1
      `
    )
    .get(userId, contentHash) as { id: string } | undefined;
  return row?.id;
}

export function backfillMissingContentHashesForUser(userId: string): number {
  const rows = db
    .prepare(
      `
        SELECT
          d.id AS document_id,
          da.encrypted_path AS original_file_path
        FROM documents d
        LEFT JOIN document_artifacts da
          ON da.document_id = d.id
          AND da.artifact_type = 'ORIGINAL_FILE'
        WHERE d.user_id = ?
          AND d.content_hash IS NULL
          AND da.encrypted_path IS NOT NULL
      `
    )
    .all(userId) as Array<{ document_id: string; original_file_path: string }>;

  if (rows.length === 0) {
    return 0;
  }

  const updateHash = db.prepare(
    `
      UPDATE documents
      SET content_hash = ?
      WHERE id = ?
        AND user_id = ?
        AND content_hash IS NULL
    `
  );

  let backfilled = 0;
  for (const row of rows) {
    try {
      const originalBuffer = readEncryptedBuffer(row.original_file_path);
      const contentHash = createHash("sha256").update(originalBuffer).digest("hex");
      const result = updateHash.run(contentHash, row.document_id, userId);
      backfilled += result.changes;
    } catch {
      // Ignore unreadable legacy artifacts; they remain null and can be handled later.
    }
  }

  return backfilled;
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

/**
 * Lightweight status-only update that writes directly to the documents table
 * without full hydration, decryption, or artifact rewrites.
 * Use this for status/error transitions where no study guide, quiz, or
 * extracted-text content changes.
 */
export interface StatusFields {
  documentType?: DocumentType;
  studyGuideStatus?: GenerationStatus;
  studyGuideErrorCode?: string | null;
  studyGuideErrorMessage?: string | null;
  quizStatus?: GenerationStatus;
  quizErrorCode?: string | null;
  quizErrorMessage?: string | null;
}

export function updateDocumentStatus(
  id: string,
  fields: StatusFields
): boolean {
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id };

  if (fields.documentType !== undefined) {
    setClauses.push("document_type = @document_type");
    params.document_type = fields.documentType;
  }
  if (fields.studyGuideStatus !== undefined) {
    setClauses.push("study_guide_status = @study_guide_status");
    params.study_guide_status = fields.studyGuideStatus;
  }
  if (fields.studyGuideErrorCode !== undefined) {
    setClauses.push("study_guide_error_code = @study_guide_error_code");
    params.study_guide_error_code = fields.studyGuideErrorCode;
  }
  if (fields.studyGuideErrorMessage !== undefined) {
    setClauses.push("study_guide_error_message = @study_guide_error_message");
    params.study_guide_error_message = fields.studyGuideErrorMessage;
  }
  if (fields.quizStatus !== undefined) {
    setClauses.push("quiz_status = @quiz_status");
    params.quiz_status = fields.quizStatus;
  }
  if (fields.quizErrorCode !== undefined) {
    setClauses.push("quiz_error_code = @quiz_error_code");
    params.quiz_error_code = fields.quizErrorCode;
  }
  if (fields.quizErrorMessage !== undefined) {
    setClauses.push("quiz_error_message = @quiz_error_message");
    params.quiz_error_message = fields.quizErrorMessage;
  }

  if (setClauses.length === 0) return false;

  // Derive overall status/error from the merged state
  // We need to read the current flow statuses to derive properly
  const row = db
    .prepare("SELECT study_guide_status, quiz_status FROM documents WHERE id = @id")
    .get({ id }) as { study_guide_status: string; quiz_status: string } | undefined;
  if (!row) return false;

  const effectiveSgStatus = fields.studyGuideStatus ?? row.study_guide_status;
  const effectiveQzStatus = fields.quizStatus ?? row.quiz_status;

  let overallStatus: DocumentStatus;
  let overallErrorCode: string | null = null;
  let overallErrorMessage: string | null = null;

  if (effectiveSgStatus === "processing" || effectiveQzStatus === "processing") {
    overallStatus = "processing";
    overallErrorCode =
      effectiveSgStatus === "processing"
        ? FLOW_PROCESSING_CODE.STUDY_GUIDE
        : FLOW_PROCESSING_CODE.QUIZ;
  } else if (effectiveSgStatus === "failed") {
    overallStatus = "failed";
    overallErrorCode = (fields.studyGuideErrorCode !== undefined
      ? fields.studyGuideErrorCode
      : null) as string | null;
    overallErrorMessage = (fields.studyGuideErrorMessage !== undefined
      ? fields.studyGuideErrorMessage
      : null) as string | null;
  } else if (effectiveQzStatus === "failed") {
    overallStatus = "failed";
    overallErrorCode = (fields.quizErrorCode !== undefined
      ? fields.quizErrorCode
      : null) as string | null;
    overallErrorMessage = (fields.quizErrorMessage !== undefined
      ? fields.quizErrorMessage
      : null) as string | null;
  } else if (effectiveSgStatus === "ready" || effectiveQzStatus === "ready") {
    overallStatus = "ready";
  } else {
    overallStatus = "uploaded";
  }

  setClauses.push("status = @status");
  params.status = overallStatus;
  setClauses.push("error_code = @error_code");
  params.error_code = overallErrorCode;
  setClauses.push("error_message = @error_message");
  params.error_message = overallErrorMessage;

  const result = db
    .prepare(`UPDATE documents SET ${setClauses.join(", ")} WHERE id = @id`)
    .run(params);
  return result.changes > 0;
}

/**
 * Update the reminder opt-in preference for a document.
 * When opting in, resets reminder state to 'pending' so the scheduler picks it up.
 * When opting out, sets status to 'skipped' to stop processing.
 */
export function updateReminderOptIn(id: string, optIn: boolean): boolean {
  if (optIn) {
    const result = db
      .prepare(
        `UPDATE documents
         SET reminder_opt_in = 1,
             reminder_status = 'pending',
             reminder_deadline_key = NULL,
             reminder_last_error = NULL,
             reminder_attempted_at = NULL,
             reminder_sent = 0
         WHERE id = ?`
      )
      .run(id);
    return result.changes > 0;
  } else {
    const result = db
      .prepare(
        `UPDATE documents
         SET reminder_opt_in = 0,
             reminder_status = 'skipped',
             reminder_deadline_key = NULL,
             reminder_last_error = NULL,
             reminder_attempted_at = NULL,
             reminder_sent = 0
         WHERE id = ?`
      )
      .run(id);
    return result.changes > 0;
  }
}

export function buildDeadlineKey(dueDate: string, dueTime: string): string {
  return `${dueDate}T${dueTime}`;
}

export function updateAssignmentDueDate(
  id: string,
  dueDate: string | null
): boolean {
  // Reset reminder state when deadline changes so a new reminder can be sent.
  const result = db
    .prepare(
      `UPDATE documents
       SET assignment_due_date = ?,
           reminder_status = 'pending',
           reminder_deadline_key = NULL,
           reminder_last_error = NULL,
           reminder_attempted_at = NULL,
           reminder_sent = 0
       WHERE id = ?`
    )
    .run(dueDate, id);
  return result.changes > 0;
}

export function updateAssignmentDueTime(
  id: string,
  dueTime: string | null
): boolean {
  // Reset reminder state when deadline changes so a new reminder can be sent.
  const result = db
    .prepare(
      `UPDATE documents
       SET assignment_due_time = ?,
           reminder_status = 'pending',
           reminder_deadline_key = NULL,
           reminder_last_error = NULL,
           reminder_attempted_at = NULL,
           reminder_sent = 0
       WHERE id = ?`
    )
    .run(dueTime, id);
  return result.changes > 0;
}

export interface ReminderCandidate {
  documentId: string;
  userId: string;
  userEmail: string | null;
  filename: string;
  assignmentDueDate: string;
  assignmentDueTime: string;
}

/**
 * Lists HOMEWORK documents eligible for a reminder:
 * - user has opted in (reminder_opt_in = 1)
 * - has both due date and due time
 * - reminder_status is 'pending' (includes transient-retry rows reset to pending)
 *
 * Rows in 'sending', 'sent', 'failed', 'skipped', or 'past_due' are excluded.
 * Transient failures are set back to 'pending' by markReminderPendingRetry,
 * so they re-enter here automatically. Terminal failures ('failed', 'skipped', 'past_due')
 * only become eligible again when the deadline changes (which resets to 'pending').
 */
export function listPendingReminders(): ReminderCandidate[] {
  const rows = db
    .prepare(
      `
        SELECT
          d.id AS document_id,
          d.user_id,
          u.email AS user_email,
          d.original_filename,
          d.assignment_due_date,
          d.assignment_due_time
        FROM documents d
        LEFT JOIN users u ON u.id = d.user_id
        WHERE d.document_type = 'HOMEWORK'
          AND d.reminder_opt_in = 1
          AND d.assignment_due_date IS NOT NULL
          AND d.assignment_due_time IS NOT NULL
          AND d.reminder_status = 'pending'
      `
    )
    .all() as Array<{
      document_id: string;
      user_id: string;
      user_email: string | null;
      original_filename: string;
      assignment_due_date: string;
      assignment_due_time: string;
    }>;

  return rows.map((row) => ({
    documentId: row.document_id,
    userId: row.user_id,
    userEmail: row.user_email,
    filename: row.original_filename,
    assignmentDueDate: row.assignment_due_date,
    assignmentDueTime: row.assignment_due_time,
  }));
}

/**
 * Atomically claim a reminder for sending. Returns true if this call
 * successfully transitioned the row from pending → sending.
 * Returns false if another scheduler tick already claimed it, or if the
 * stored deadline has changed since the scheduler snapshot was taken.
 */
export function claimReminderForSending(
  documentId: string,
  deadlineKey: string
): boolean {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'sending',
           reminder_deadline_key = ?,
           reminder_attempted_at = ?,
           reminder_last_error = NULL
       WHERE id = ?
         AND reminder_status = 'pending'
         AND (assignment_due_date || 'T' || assignment_due_time) = ?`
    )
    .run(deadlineKey, now, documentId, deadlineKey);
  return result.changes > 0;
}

/**
 * Mark a reminder as successfully sent. Also sets legacy reminder_sent=1.
 */
export function markReminderSent(documentId: string, deadlineKey: string): boolean {
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'sent',
           reminder_sent = 1,
           reminder_last_error = NULL
       WHERE id = ?
         AND reminder_deadline_key = ?`
    )
    .run(documentId, deadlineKey);
  return result.changes > 0;
}

/**
 * Transition a reminder back to 'pending' after a transient send failure.
 * This allows it to be re-selected and re-claimed on the next scheduler tick.
 * Preserves the deadline key and records the error + attempt timestamp.
 */
export function markReminderPendingRetry(
  documentId: string,
  deadlineKey: string,
  errorMessage: string
): boolean {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'pending',
           reminder_last_error = ?,
           reminder_attempted_at = ?
       WHERE id = ?
         AND reminder_deadline_key = ?`
    )
    .run(errorMessage, now, documentId, deadlineKey);
  return result.changes > 0;
}

/**
 * Mark a reminder as failed (terminal for this deadline). Failed reminders
 * are NOT automatically retried for the same deadline. They only become
 * eligible again if the deadline changes (which resets status to 'pending').
 */
export function markReminderFailed(
  documentId: string,
  deadlineKey: string,
  errorMessage: string
): boolean {
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'failed',
           reminder_last_error = ?
       WHERE id = ?
         AND reminder_deadline_key = ?`
    )
    .run(errorMessage, documentId, deadlineKey);
  return result.changes > 0;
}

/**
 * Mark a reminder as permanently skipped (terminal). Skipped reminders are
 * NOT retried unless the deadline changes, which resets status to 'pending'.
 * Use this for cases that can never succeed (e.g. no email address).
 */
export function markReminderSkipped(
  documentId: string,
  deadlineKey: string,
  reason: string
): boolean {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'skipped',
           reminder_deadline_key = ?,
           reminder_attempted_at = ?,
           reminder_last_error = ?
       WHERE id = ?`
    )
    .run(deadlineKey, now, reason, documentId);
  return result.changes > 0;
}

/**
 * Mark a reminder as past due (terminal). The deadline has already passed,
 * so no reminder email will be sent. Like 'skipped', this is terminal
 * unless the deadline changes (which resets status to 'pending').
 */
export function markReminderPastDue(
  documentId: string,
  deadlineKey: string
): boolean {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'past_due',
           reminder_deadline_key = ?,
           reminder_attempted_at = ?,
           reminder_last_error = 'Deadline already passed'
       WHERE id = ?`
    )
    .run(deadlineKey, now, documentId);
  return result.changes > 0;
}

/**
 * Recover any reminders stuck in 'sending' state (e.g. after a crash).
 * Transitions them back to 'pending' so they are retried on the next tick.
 * Called on startup.
 */
export function recoverStuckReminders(): number {
  const result = db
    .prepare(
      `UPDATE documents
       SET reminder_status = 'pending',
           reminder_last_error = 'Interrupted by server restart'
       WHERE reminder_status = 'sending'`
    )
    .run();
  return result.changes;
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

export function getChecklistCompletion(
  documentId: string
): Record<string, boolean> {
  const rows = db
    .prepare(
      `
        SELECT id, completed
        FROM checklist_items
        WHERE document_id = ?
      `
    )
    .all(documentId) as Array<{ id: string; completed: number }>;

  const result: Record<string, boolean> = {};
  for (const row of rows) {
    const logicalId = toLogicalChecklistId(documentId, row.id);
    result[logicalId] = row.completed === 1;
  }
  return result;
}

export function getDocumentMetadata(documentId: string): DocumentRecord | undefined {
  const row = readDocumentRowById(documentId);
  if (!row) return undefined;
  return hydrateDocument(row, { includeExtractedText: false });
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
