import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { sendApiError } from "../lib/apiError.js";
import { logger } from "../lib/logger.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { detectDocumentType } from "../services/documentDetector.js";
import { analyzeDocument } from "../services/contentAnalyzer.js";
import {
  FLOW_PROCESSING_CODE,
  makeFlowFailureCode,
} from "../services/generationState.js";
import { generateQuiz } from "../services/quizGenerator.js";
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
  listDocumentsByUser,
  saveDocument,
  updateChecklistItem,
  updateDocument,
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

function isUuid(value: string): boolean {
  return UUID_V4_OR_V1_REGEX.test(value);
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

    const documentId = randomUUID();
    saveDocument({
      id: documentId,
      userId,
      userEmail: getUserEmail(req),
      filename: file.originalname,
      fileType: extracted.fileType,
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
    });

    res.status(201).json({
      document_id: documentId,
      document_type: detected.documentType,
      status: "uploaded",
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
  const items = listDocumentsByUser(userId).map((doc) => ({
    ...(() => {
      const publicErrorCode = normalizePublicErrorCode(doc.status, doc.errorCode);
      return {
        error_code: publicErrorCode,
        error_message: toPublicErrorMessage(publicErrorCode),
      };
    })(),
    id: doc.id,
    filename: doc.filename,
    document_type: doc.documentType,
    status: doc.status,
    study_guide_status: doc.studyGuideStatus,
    quiz_status: doc.quizStatus,
    page_count: doc.pageCount,
    uploaded_at: doc.uploadedAt,
    has_study_guide: doc.studyGuide !== null,
    has_quiz: doc.quiz !== null,
  }));
  res.status(200).json(items);
}

export async function getDocumentHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const userId = getUserId(req);
  const doc = getDocumentMetadata(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return;
  }
  if (doc.userId !== userId) {
    sendApiError(res, 403, "FORBIDDEN", "You do not own this document.");
    return;
  }

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
  });
}

export async function createStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;
  if (doc.documentType === "UNSUPPORTED") {
    sendApiError(res, 422, "DOCUMENT_UNSUPPORTED", "Unsupported document type.");
    return;
  }
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

  updateDocument(documentId, (current) => ({
    ...current,
    studyGuideStatus: "processing",
    studyGuideErrorCode: FLOW_PROCESSING_CODE.STUDY_GUIDE,
    studyGuideErrorMessage: null,
  }));

  void (async () => {
    try {
      const generated = await analyzeDocument(doc.extractedText, doc.documentType, {
        fileType: doc.fileType,
        pageCount: doc.pageCount,
        paragraphCount: doc.paragraphCount,
      });
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuide: generated,
        studyGuideStatus: "ready",
        studyGuideErrorCode: null,
        studyGuideErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      }));
    }
  })().catch((error) => {
    logger.error("Unhandled study guide generation task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      }));
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
  if (doc.documentType === "UNSUPPORTED") {
    sendApiError(res, 422, "DOCUMENT_UNSUPPORTED", "Unsupported document type.");
    return;
  }
  if (doc.studyGuideStatus === "processing") {
    sendAlreadyProcessingError(res, "Study guide is already processing.");
    return;
  }
  if (doc.studyGuideStatus !== "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocument(documentId, (current) => ({
    ...current,
    studyGuideStatus: "processing",
    studyGuideErrorCode: FLOW_PROCESSING_CODE.STUDY_GUIDE,
    studyGuideErrorMessage: null,
  }));

  void (async () => {
    try {
      const generated = await analyzeDocument(doc.extractedText, doc.documentType, {
        fileType: doc.fileType,
        pageCount: doc.pageCount,
        paragraphCount: doc.paragraphCount,
      });
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuide: generated,
        studyGuideStatus: "ready",
        studyGuideErrorCode: null,
        studyGuideErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      }));
    }
  })().catch((error) => {
    logger.error("Unhandled study guide retry task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocument(documentId, (current) => ({
        ...current,
        studyGuideStatus: "failed",
        studyGuideErrorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        studyGuideErrorMessage: failure.message,
      }));
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
  updateDocument(documentId, (current) => ({
    ...current,
    quizStatus: "processing",
    quizErrorCode: FLOW_PROCESSING_CODE.QUIZ,
    quizErrorMessage: null,
  }));

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
      updateDocument(documentId, (current) => ({
        ...current,
        quiz: generatedQuiz,
        quizStatus: "ready",
        quizErrorCode: null,
        quizErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      }));
    }
  })().catch((error) => {
    logger.error("Unhandled quiz generation task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocument(documentId, (current) => ({
        ...current,
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      }));
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

  updateDocument(documentId, (current) => ({
    ...current,
    quizStatus: "processing",
    quizErrorCode: FLOW_PROCESSING_CODE.QUIZ,
    quizErrorMessage: null,
  }));

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
      updateDocument(documentId, (current) => ({
        ...current,
        quiz: generatedQuiz,
        quizStatus: "ready",
        quizErrorCode: null,
        quizErrorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      }));
    }
  })().catch((error) => {
    logger.error("Unhandled quiz retry task failure", { documentId, error });
    const failure = toFailureCode(error);
    try {
      updateDocument(documentId, (current) => ({
        ...current,
        quizStatus: "failed",
        quizErrorCode: makeFlowFailureCode("QUIZ", failure.code),
        quizErrorMessage: failure.message,
      }));
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

export async function deleteUserDataHandler(_req: Request, res: Response): Promise<void> {
  const userId = getUserId(_req);
  deleteDocumentsByUser(userId);
  res.status(200).json({ success: true });
}

export async function deleteDocumentHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentIdParam(req, res);
  if (!documentId) return;

  const doc = ensureOwnership(req, res, documentId);
  if (!doc) return;

  deleteDocumentById(documentId);
  res.status(200).json({ success: true });
}
