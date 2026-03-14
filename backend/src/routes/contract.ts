import { Request, Response } from "express";
import { createHash, randomUUID } from "crypto";
import { sendApiError } from "../lib/apiError.js";
import { logger } from "../lib/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { detectDocumentType } from "../services/documentDetector.js";
import { classifyWithLlm } from "../services/llmClassifier.js";
import { analyzeDocument } from "../services/contentAnalyzer.js";
import {
  FLOW_PROCESSING_CODE,
  makeFlowFailureCode,
} from "../services/generationState.js";
import { generateQuiz } from "../services/quizGenerator.js";
import { extractDueDeadline } from "../services/dueDateExtractor.js";
import { buildDeadlineDatetime } from "../services/reminderScheduler.js";
import { extractTextFromBuffer } from "../services/textExtractor.js";
import {
  ContractValidationError,
  normalizeDocumentText,
} from "../services/outputValidator.js";
import {
  deleteDocumentById,
  deleteDocumentsByUser,
  getChecklistCompletion,
  getDocument,
  getDocumentMetadata,
  getDocumentOwnerId,
  backfillMissingContentHashesForUser,
  findDocumentIdByUserAndContentHash,
  listDocumentsByUser,
  listDocumentSummariesByUser,
  saveDocument,
  updateChecklistItem,
  updateAssignmentDueDate,
  updateAssignmentDueTime,
  updateReminderOptIn,
  updateDocument,
  updateDocumentStatus,
} from "../store/memoryStore.js";

const PDF_SIGNATURE = "%PDF-";
const ZIP_SIGNATURE_BYTE_0 = 0x50; // P
const ZIP_SIGNATURE_BYTE_1 = 0x4b; // K

interface CreateBody {
  document_id?: string;
}

interface ChecklistBody {
  item_id?: string;
  completed?: boolean;
}

const UUID_V4_OR_V1_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALREADY_PROCESSING_RETRY_AFTER_SECONDS = "5";

/**
 * If the deadline is already past and the reminder hasn't been sent,
 * return "past_due" so the frontend shows "Past due" immediately
 * rather than a stale schedulable state. Uses the same APP_TIMEZONE
 * as the scheduler so the two always agree.
 */
function deriveEffectiveReminderStatus(
  doc: { assignmentDueDate: string | null; assignmentDueTime: string | null; reminderStatus: string }
): string {
  if (
    doc.assignmentDueDate &&
    doc.assignmentDueTime &&
    (doc.reminderStatus === "pending" || doc.reminderStatus === "sending")
  ) {
    const deadline = buildDeadlineDatetime(doc.assignmentDueDate, doc.assignmentDueTime);
    if (deadline && deadline.getTime() <= Date.now()) {
      return "past_due";
    }
  }
  return doc.reminderStatus;
}

function isUuid(value: string): boolean {
  return UUID_V4_OR_V1_REGEX.test(value);
}

function isContentHashUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  const message = error.message ?? "";
  return (
    maybeCode === "SQLITE_CONSTRAINT_UNIQUE" ||
    maybeCode === "SQLITE_CONSTRAINT" ||
    message.includes("UNIQUE constraint failed: documents.user_id, documents.content_hash")
  );
}

function readDocumentId(req: Request, res: Response): string | null {
  const body = req.body as CreateBody | undefined;
  const id = body?.document_id;
  if (typeof id !== "string" || id.trim().length === 0) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return null;
  }

  const normalized = id.trim();
  if (!isUuid(normalized)) {
    sendApiError(res, 422, "SCHEMA_VALIDATION_FAILED", "document_id must be a UUID.", {
      field: "document_id",
    });
    return null;
  }

  return normalized;
}

function readDocumentIdParam(req: Request, res: Response, paramName = "documentId"): string | null {
  const raw = req.params[paramName];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return null;
  }

  const normalized = raw.trim();
  if (!isUuid(normalized)) {
    sendApiError(res, 422, "SCHEMA_VALIDATION_FAILED", "document_id must be a UUID.", {
      field: paramName,
    });
    return null;
  }

  return normalized;
}

function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).auth.userId;
}

function getUserEmail(req: Request): string | undefined {
  return (req as AuthenticatedRequest).auth.email;
}

function ensureOwnership(req: Request, res: Response, documentId: string) {
  const userId = getUserId(req);
  const doc = getDocument(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return null;
  }
  if (doc.userId !== userId) {
    sendApiError(res, 403, "FORBIDDEN", "You do not own this document.");
    return null;
  }
  return doc;
}

/**
 * Lightweight ownership check — verifies existence and ownership without
 * full document hydration, decryption, or JSON parsing.
 * Returns true if ownership is confirmed, false if an error response was sent.
 */
function ensureOwnershipOnly(req: Request, res: Response, documentId: string): boolean {
  const userId = getUserId(req);
  const ownerId = getDocumentOwnerId(documentId);
  if (!ownerId) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return false;
  }
  if (ownerId !== userId) {
    sendApiError(res, 403, "FORBIDDEN", "You do not own this document.");
    return false;
  }
  return true;
}

function toFailureCode(error: unknown): { code: string; message: string; details?: Record<string, unknown> } {
  if (error instanceof ContractValidationError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: "GENERATION_FAILED",
      message: error.message,
    };
  }

  return {
    code: "GENERATION_FAILED",
    message: "Generation failed",
  };
}

function normalizePublicErrorCode(status: string, errorCode: string | null): string | null {
  if (status !== "failed" || !errorCode) {
    return null;
  }

  const markerSeparator = errorCode.indexOf(":");
  if (markerSeparator > 0) {
    return errorCode.slice(markerSeparator + 1);
  }

  return errorCode;
}

function toPublicErrorMessage(errorCode: string | null): string | null {
  if (!errorCode) return null;

  switch (errorCode) {
    case "SCHEMA_VALIDATION_FAILED":
    case "QUOTE_NOT_FOUND":
    case "CITATION_EXCERPT_NOT_FOUND":
    case "CITATION_OUT_OF_RANGE":
      return "Generated output failed validation. Retry generation.";
    case "ACADEMIC_INTEGRITY_VIOLATION":
      return "Generated output violated academic integrity guardrails. Retry generation.";
    case "DOCUMENT_UNSUPPORTED":
      return "Document type is not supported for generation.";
    case "DOCUMENT_TOO_LARGE_FOR_GENERATION":
      return "Document is too large to generate study materials. Upload a shorter document.";
    case "DOCUMENT_NOT_LECTURE":
      return "Quiz generation is only available for lecture documents.";
    case "ALREADY_PROCESSING":
      return "Generation is already in progress.";
    case "ILLEGAL_RETRY_STATE":
      return "Retry is only allowed after a failed generation.";
    case "GENERATION_INTERRUPTED":
      return "Generation was interrupted by server restart. Retry generation.";
    default:
      return "Generation failed. Retry generation.";
  }
}

function sendAlreadyProcessingError(res: Response, message: string): void {
  res.setHeader("Retry-After", ALREADY_PROCESSING_RETRY_AFTER_SECONDS);
  sendApiError(res, 409, "ALREADY_PROCESSING", message);
}

function isValidPdfSignature(fileBuffer: Buffer): boolean {
  if (fileBuffer.length < PDF_SIGNATURE.length) {
    return false;
  }
  return fileBuffer.subarray(0, PDF_SIGNATURE.length).toString("ascii") === PDF_SIGNATURE;
}

function isLikelyDocxSignature(fileBuffer: Buffer): boolean {
  if (fileBuffer.length < 4) {
    return false;
  }

  const hasZipHeader =
    fileBuffer[0] === ZIP_SIGNATURE_BYTE_0 && fileBuffer[1] === ZIP_SIGNATURE_BYTE_1;
  if (!hasZipHeader) {
    return false;
  }

  const fileContents = fileBuffer.toString("latin1");
  return (
    fileContents.includes("[Content_Types].xml") &&
    fileContents.includes("word/document.xml")
  );
}

function validateUploadedFileSignature(
  fileBuffer: Buffer,
  mimetype: string
): string | null {
  if (mimetype === "application/pdf") {
    return isValidPdfSignature(fileBuffer) ? null : "Uploaded file is not a valid PDF.";
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return isLikelyDocxSignature(fileBuffer) ? null : "Uploaded file is not a valid DOCX.";
  }

  return "Unsupported file type.";
}

export async function uploadDocumentHandler(req: Request, res: Response): Promise<void> {
  const file = req.file;
  let userId: string | null = null;
  try {
    userId = getUserId(req);
    if (!file) {
      sendApiError(res, 400, "MISSING_FILE", "Missing file upload.");
      return;
    }

    const signatureValidationError = validateUploadedFileSignature(file.buffer, file.mimetype);
    if (signatureValidationError) {
      sendApiError(res, 415, "UNSUPPORTED_MEDIA_TYPE", signatureValidationError);
      return;
    }

    const extracted = await extractTextFromBuffer(
      file.buffer,
      file.mimetype,
      file.originalname
    );
    const normalizedText = normalizeDocumentText(extracted.text, extracted.fileType);
    const detected = detectDocumentType(normalizedText);

    if (detected.documentType === "UNSUPPORTED") {
      sendApiError(
        res,
        422,
        "DOCUMENT_UNSUPPORTED_UPLOAD",
        "This document type is not supported. Only lecture notes, homework files, and class notes are accepted."
      );
      return;
    }

    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    let existingDocumentId = findDocumentIdByUserAndContentHash(userId, contentHash);
    if (!existingDocumentId) {
      const backfilled = backfillMissingContentHashesForUser(userId);
      if (backfilled > 0) {
        existingDocumentId = findDocumentIdByUserAndContentHash(userId, contentHash);
      }
    }
    if (existingDocumentId) {
      const existing = getDocumentMetadata(existingDocumentId);
      res.status(200).json({
        document_id: existingDocumentId,
        document_type: existing?.documentType ?? detected.documentType,
        status: existing?.status ?? "uploaded",
        reused_existing: true,
        message:
          "This document was already uploaded. We reused the existing study guide and document data.",
      });
      return;
    }

    const documentId = randomUUID();
    try {
      saveDocument({
        id: documentId,
        userId,
        userEmail: getUserEmail(req),
        filename: file.originalname,
        fileType: extracted.fileType,
        contentHash,
        documentType: detected.documentType,
        status: "uploaded",
        uploadedAt: new Date().toISOString(),
        pageCount: extracted.fileType === "PDF" ? Math.max(extracted.pageCount ?? 1, 1) : extracted.pageCount ?? 0,
        paragraphCount: extracted.paragraphCount,
        extractedText: normalizedText,
        originalFileBuffer: file.buffer,
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
      });
    } catch (persistError) {
      if (isContentHashUniqueConstraintError(persistError)) {
        const existingOnConflict = findDocumentIdByUserAndContentHash(userId, contentHash);
        if (existingOnConflict) {
          const existing = getDocumentMetadata(existingOnConflict);
          res.status(200).json({
            document_id: existingOnConflict,
            document_type: existing?.documentType ?? detected.documentType,
            status: existing?.status ?? "uploaded",
            reused_existing: true,
            message:
              "This document was already uploaded. We reused the existing study guide and document data.",
          });
          return;
        }
      }
      throw persistError;
    }

    res.status(201).json({
      document_id: documentId,
      document_type: detected.documentType,
      status: "uploaded",
      reused_existing: false,
    });
  } catch (error) {
    logger.error("Upload extraction failed", {
      error,
      userId,
      filename: file?.originalname ?? null,
    });
    sendApiError(res, 500, "EXTRACTION_FAILED", "Failed to process uploaded file.");
  }
}

export async function listDocumentsHandler(_req: Request, res: Response): Promise<void> {
  const userId = getUserId(_req);
  const items = listDocumentSummariesByUser(userId).map((doc) => {
    const publicErrorCode = normalizePublicErrorCode(doc.status, doc.errorCode);
    return {
      id: doc.id,
      filename: doc.filename,
      document_type: doc.documentType,
      status: doc.status,
      study_guide_status: doc.studyGuideStatus,
      quiz_status: doc.quizStatus,
      page_count: doc.pageCount,
      uploaded_at: doc.uploadedAt,
      error_code: publicErrorCode,
      error_message: toPublicErrorMessage(publicErrorCode),
      has_study_guide: doc.hasStudyGuide,
      has_quiz: doc.hasQuiz,
      assignment_due_date: doc.assignmentDueDate,
      assignment_due_time: doc.assignmentDueTime,
      reminder_opt_in: doc.reminderOptIn,
      reminder_status: doc.reminderStatus,
    };
  });
  res.status(200).json(items);
}

export async function getDocumentHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const userId = getUserId(req);
  let doc = getDocumentMetadata(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return;
  }
  if (doc.userId !== userId) {
    sendApiError(res, 403, "FORBIDDEN", "You do not own this document.");
    return;
  }

  // Older homework rows can still have a missing persisted due date even though the
  // extracted text contains one. Reconcile that lazily so the detail UI stays consistent.
  if (doc.documentType === "HOMEWORK" && doc.assignmentDueDate === null) {
    const fullDoc = getDocument(documentId);
    if (fullDoc?.userId === userId) {
      const deadline = extractDueDeadline(fullDoc.extractedText);
      if (deadline) {
        updateAssignmentDueDate(documentId, deadline.date);
        if (deadline.time) {
          updateAssignmentDueTime(documentId, deadline.time);
        }
        doc = getDocumentMetadata(documentId) ?? {
          ...doc,
          assignmentDueDate: deadline.date,
          reminderStatus: "pending",
          reminderDeadlineKey: null,
          reminderLastError: null,
          reminderAttemptedAt: null,
        };
      }
    }
  }

  // Legacy rows created under the old date-only extractor have a due date but no
  // due time. Re-extract from the source text and backfill just the time.
  if (doc.documentType === "HOMEWORK" && doc.assignmentDueDate !== null && doc.assignmentDueTime === null) {
    const fullDoc = getDocument(documentId);
    if (fullDoc?.userId === userId) {
      const deadline = extractDueDeadline(fullDoc.extractedText);
      if (deadline?.time) {
        updateAssignmentDueTime(documentId, deadline.time);
        doc = getDocumentMetadata(documentId) ?? {
          ...doc,
          assignmentDueTime: deadline.time,
        };
      }
    }
  }

  const effectiveReminderStatus = deriveEffectiveReminderStatus(doc);

  const publicErrorCode = normalizePublicErrorCode(doc.status, doc.errorCode);
  res.status(200).json({
    id: doc.id,
    filename: doc.filename,
    document_type: doc.documentType,
    status: doc.status,
    study_guide_status: doc.studyGuideStatus,
    quiz_status: doc.quizStatus,
    page_count: doc.pageCount,
    uploaded_at: doc.uploadedAt,
    error_code: publicErrorCode,
    error_message: toPublicErrorMessage(publicErrorCode),
    has_study_guide: doc.studyGuide !== null,
    has_quiz: doc.quiz !== null,
    assignment_due_date: doc.assignmentDueDate,
    assignment_due_time: doc.assignmentDueTime,
    reminder_opt_in: doc.reminderOptIn,
    reminder_status: effectiveReminderStatus,
  });
}

export async function createStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (doc.studyGuide) {
    res.status(200).json({ status: "ready", cached: true });
    return;
  }
  if (doc.studyGuideStatus === "processing") {
    sendAlreadyProcessingError(res, "Study guide is already processing.");
    return;
  }
  if (doc.studyGuideStatus === "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Use retry endpoint for failed documents.");
    return;
  }

  updateDocumentStatus(documentId, {
    studyGuideStatus: "processing",
    studyGuideErrorCode: FLOW_PROCESSING_CODE.STUDY_GUIDE,
    studyGuideErrorMessage: null,
  });

  void (async () => {
    try {
      // LLM pre-classification: gate generation on semantic document type check
      const classification = await classifyWithLlm(doc.extractedText);

      // Persist the LLM-determined type so all downstream flows
      // (list, detail, quiz, checklist) use the authoritative type.
      updateDocumentStatus(documentId, {
        documentType: classification.llmDocumentType,
      });

      if (classification.llmDocumentType === "UNSUPPORTED") {
        updateDocumentStatus(documentId, {
          studyGuideStatus: "failed",
          studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", "DOCUMENT_UNSUPPORTED"),
          studyGuideErrorMessage: "This document type is not supported for study guide generation.",
        });
        return;
      }

      // Extract due date + time for HOMEWORK documents (best-effort, never blocks generation)
      if (classification.llmDocumentType === "HOMEWORK") {
        try {
          const deadline = extractDueDeadline(doc.extractedText);
          if (deadline) {
            updateAssignmentDueDate(documentId, deadline.date);
            if (deadline.time) {
              updateAssignmentDueTime(documentId, deadline.time);
            }
          }
        } catch (dueDateError) {
          logger.warn("Due date extraction failed (non-blocking)", { documentId, error: dueDateError });
        }
      }

      const generated = await analyzeDocument(doc.extractedText, classification.llmDocumentType, {
        fileType: doc.fileType,
        pageCount: doc.pageCount,
        paragraphCount: doc.paragraphCount,
      });
      // Full updateDocument needed here: writes study guide content + syncs checklist
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuide: generated,
        studyGuideStatus: "ready",
        studyGuideErrorCode: null,
        studyGuideErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocumentStatus(documentId, {
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      });
    }
  })().catch((error) => {
    logger.error("Unhandled study guide generation task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocumentStatus(documentId, {
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      });
    } catch (updateError) {
      logger.error("Failed to persist study guide task failure", {
        documentId,
        error: updateError,
      });
    }
  });

  res.status(202).json({ status: "processing" });
}

export async function retryStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (doc.studyGuideStatus === "processing") {
    sendAlreadyProcessingError(res, "Study guide is already processing.");
    return;
  }
  if (doc.studyGuideStatus !== "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocumentStatus(documentId, {
    studyGuideStatus: "processing",
    studyGuideErrorCode: FLOW_PROCESSING_CODE.STUDY_GUIDE,
    studyGuideErrorMessage: null,
  });

  // Reuse existing LLM classification if already set (avoids redundant OpenAI call on retry)
  const cachedType = doc.documentType;
  const hasLlmType = cachedType === "HOMEWORK" || cachedType === "LECTURE";

  void (async () => {
    try {
      let llmDocumentType = cachedType;

      if (hasLlmType) {
        logger.info("Retry reusing cached LLM document type", {
          documentId,
          documentType: llmDocumentType,
        });
      } else {
        const classification = await classifyWithLlm(doc.extractedText);
        llmDocumentType = classification.llmDocumentType;

        updateDocumentStatus(documentId, {
          documentType: llmDocumentType,
        });
      }

      if (llmDocumentType === "UNSUPPORTED") {
        updateDocumentStatus(documentId, {
          studyGuideStatus: "failed",
          studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", "DOCUMENT_UNSUPPORTED"),
          studyGuideErrorMessage: "This document type is not supported for study guide generation.",
        });
        return;
      }

      const generated = await analyzeDocument(doc.extractedText, llmDocumentType, {
        fileType: doc.fileType,
        pageCount: doc.pageCount,
        paragraphCount: doc.paragraphCount,
      });
      // Full updateDocument needed here: writes study guide content + syncs checklist
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuide: generated,
        studyGuideStatus: "ready",
        studyGuideErrorCode: null,
        studyGuideErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocumentStatus(documentId, {
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      });
    }
  })().catch((error) => {
    logger.error("Unhandled study guide retry task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocumentStatus(documentId, {
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      });
    } catch (updateError) {
      logger.error("Failed to persist study guide retry task failure", {
        documentId,
        error: updateError,
      });
    }
  });

  res.status(202).json({ status: "processing", retry: true });
}

export async function getStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (!doc.studyGuide) {
    sendApiError(
      res,
      404,
      "NOT_FOUND",
      `No study guide exists for document ${documentId}.`
    );
    return;
  }

  const checklistCompletion = getChecklistCompletion(documentId);
  res.status(200).json({
    ...doc.studyGuide,
    checklist_completion: checklistCompletion,
  });
}

export async function createQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (doc.documentType !== "LECTURE") {
    sendApiError(res, 422, "DOCUMENT_NOT_LECTURE", "Quiz generation is lecture-only.");
    return;
  }
  if (doc.quiz) {
    res.status(200).json({ status: "ready", cached: true });
    return;
  }
  if (doc.quizStatus === "processing") {
    sendAlreadyProcessingError(res, "Quiz is already processing.");
    return;
  }
  if (doc.quizStatus === "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Use retry endpoint for failed documents.");
    return;
  }
  updateDocumentStatus(documentId, {
    quizStatus: "processing",
    quizErrorCode: FLOW_PROCESSING_CODE.QUIZ,
    quizErrorMessage: null,
  });

  void (async () => {
    try {
      const generatedQuiz = await generateQuiz(
        documentId,
        doc.extractedText,
        doc.documentType,
        {
          fileType: doc.fileType,
          pageCount: doc.pageCount,
          paragraphCount: doc.paragraphCount,
        }
      );
      // Full updateDocument needed here: writes quiz content
      updateDocument(documentId, (current) => ({
        ...current,
        quiz: generatedQuiz,
        quizStatus: "ready",
        quizErrorCode: null,
        quizErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocumentStatus(documentId, {
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      });
    }
  })().catch((error) => {
    logger.error("Unhandled quiz generation task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocumentStatus(documentId, {
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      });
    } catch (updateError) {
      logger.error("Failed to persist quiz task failure", {
        documentId,
        error: updateError,
      });
    }
  });

  res.status(202).json({ status: "processing" });
}

export async function retryQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (doc.documentType !== "LECTURE") {
    sendApiError(res, 422, "DOCUMENT_NOT_LECTURE", "Quiz generation is lecture-only.");
    return;
  }
  if (doc.quizStatus === "processing") {
    sendAlreadyProcessingError(res, "Quiz is already processing.");
    return;
  }
  if (doc.quizStatus !== "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocumentStatus(documentId, {
    quizStatus: "processing",
    quizErrorCode: FLOW_PROCESSING_CODE.QUIZ,
    quizErrorMessage: null,
  });

  void (async () => {
    try {
      const generatedQuiz = await generateQuiz(
        documentId,
        doc.extractedText,
        doc.documentType,
        {
          fileType: doc.fileType,
          pageCount: doc.pageCount,
          paragraphCount: doc.paragraphCount,
        }
      );
      // Full updateDocument needed here: writes quiz content
      updateDocument(documentId, (current) => ({
        ...current,
        quiz: generatedQuiz,
        quizStatus: "ready",
        quizErrorCode: null,
        quizErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocumentStatus(documentId, {
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      });
    }
  })().catch((error) => {
    logger.error("Unhandled quiz retry task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocumentStatus(documentId, {
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      });
    } catch (updateError) {
      logger.error("Failed to persist quiz retry task failure", {
        documentId,
        error: updateError,
      });
    }
  });

  res.status(202).json({ status: "processing", retry: true });
}

export async function getQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (!doc.quiz) {
    sendApiError(
      res,
      404,
      "NOT_FOUND",
      `No quiz exists for document ${documentId}.`
    );
    return;
  }
  res.status(200).json(doc.quiz);
}

export async function updateChecklistHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (doc.documentType === "UNSUPPORTED") {
    sendApiError(res, 422, "DOCUMENT_UNSUPPORTED", "Checklist is not available for unsupported documents.");
    return;
  }

  const body = req.body as ChecklistBody | undefined;
  const hasItemId = typeof body?.item_id === "string" && body.item_id.trim().length > 0;
  const hasCompleted = typeof body?.completed === "boolean";

  if (!hasItemId || !hasCompleted) {
    sendApiError(res, 400, "MISSING_FIELDS", "item_id and completed are required.");
    return;
  }

  const updated = updateChecklistItem(
    documentId,
    body.item_id!.trim(),
    body.completed!
  );
  if (!updated) {
    sendApiError(res, 404, "NOT_FOUND", "Checklist item not found.");
    return;
  }

  res.status(200).json({ success: true });
}

interface DueDateBody {
  due_date?: string;
}

const YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function updateDueDateHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;

  if (doc.documentType !== "HOMEWORK") {
    sendApiError(res, 422, "NOT_HOMEWORK", "Due date is only applicable to HOMEWORK documents.");
    return;
  }

  const body = req.body as DueDateBody | undefined;
  const dueDate = body?.due_date;

  if (typeof dueDate !== "string" || !YYYY_MM_DD_REGEX.test(dueDate.trim())) {
    sendApiError(res, 400, "INVALID_DUE_DATE", "due_date must be in YYYY-MM-DD format.");
    return;
  }

  const normalized = dueDate.trim();
  const [y, m, d] = normalized.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    sendApiError(res, 400, "INVALID_DUE_DATE", "due_date must be a valid calendar date.");
    return;
  }

  updateAssignmentDueDate(documentId, normalized);
  const updated = getDocumentMetadata(documentId);
  const effectiveStatus = updated ? deriveEffectiveReminderStatus(updated) : "pending";
  res.status(200).json({
    success: true,
    assignment_due_date: normalized,
    assignment_due_time: updated?.assignmentDueTime ?? doc.assignmentDueTime,
    reminder_opt_in: updated?.reminderOptIn ?? false,
    reminder_status: effectiveStatus,
  });
}

interface DueTimeBody {
  due_time?: string;
}

const HH_MM_REGEX = /^\d{2}:\d{2}$/;

export async function updateDueTimeHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;

  if (doc.documentType !== "HOMEWORK") {
    sendApiError(res, 422, "NOT_HOMEWORK", "Due time is only applicable to HOMEWORK documents.");
    return;
  }

  if (!doc.assignmentDueDate) {
    sendApiError(res, 422, "DUE_DATE_REQUIRED_FOR_TIME", "Cannot set due time without an existing due date.");
    return;
  }

  const body = req.body as DueTimeBody | undefined;
  const dueTime = body?.due_time;

  if (typeof dueTime !== "string" || !HH_MM_REGEX.test(dueTime.trim())) {
    sendApiError(res, 400, "INVALID_DUE_TIME", "due_time must be in HH:MM format.");
    return;
  }

  const normalized = dueTime.trim();
  const [hours, minutes] = normalized.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    sendApiError(res, 400, "INVALID_DUE_TIME", "due_time must be a valid time (00:00–23:59).");
    return;
  }

  updateAssignmentDueTime(documentId, normalized);
  const updated = getDocumentMetadata(documentId);
  const effectiveStatus = updated ? deriveEffectiveReminderStatus(updated) : "pending";
  res.status(200).json({
    success: true,
    assignment_due_date: updated?.assignmentDueDate ?? doc.assignmentDueDate,
    assignment_due_time: normalized,
    reminder_opt_in: updated?.reminderOptIn ?? false,
    reminder_status: effectiveStatus,
  });
}

interface ReminderOptInBody {
  opt_in?: boolean;
}

export async function updateReminderOptInHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;

  if (doc.documentType !== "HOMEWORK") {
    sendApiError(res, 422, "NOT_HOMEWORK", "Reminder opt-in is only applicable to HOMEWORK documents.");
    return;
  }

  const body = req.body as ReminderOptInBody | undefined;
  if (typeof body?.opt_in !== "boolean") {
    sendApiError(res, 400, "INVALID_OPT_IN", "opt_in must be a boolean.");
    return;
  }

  // Cannot opt in without both due date and due time
  if (body.opt_in && (!doc.assignmentDueDate || !doc.assignmentDueTime)) {
    sendApiError(
      res,
      422,
      "DEADLINE_REQUIRED",
      "Cannot opt in to reminders without both a due date and due time."
    );
    return;
  }

  updateReminderOptIn(documentId, body.opt_in);
  const updated = getDocumentMetadata(documentId);
  const effectiveStatus = updated ? deriveEffectiveReminderStatus(updated) : "pending";
  res.status(200).json({
    success: true,
    reminder_opt_in: updated?.reminderOptIn ?? body.opt_in,
    reminder_status: effectiveStatus,
  });
}

export async function deleteUserDataHandler(_req: Request, res: Response): Promise<void> {
  const userId = getUserId(_req);
  deleteDocumentsByUser(userId);
  res.status(200).json({ success: true });
}

export async function deleteDocumentHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  if (!ensureOwnershipOnly(req, res, documentId)) return;

  deleteDocumentById(documentId);
  res.status(200).json({ success: true });
}
