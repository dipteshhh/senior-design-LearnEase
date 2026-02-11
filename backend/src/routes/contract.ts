import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { sendApiError } from "../lib/apiError.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { detectDocumentType } from "../services/documentDetector.js";
import { analyzeDocument } from "../services/contentAnalyzer.js";
import {
  FLOW_PROCESSING_CODE,
  isFlowFailed,
  isFlowProcessing,
  makeFlowFailureCode,
} from "../services/generationState.js";
import { generateQuiz } from "../services/quizGenerator.js";
import { extractTextFromBuffer } from "../services/textExtractor.js";
import {
  ContractValidationError,
  normalizeDocumentText,
} from "../services/outputValidator.js";
import {
  deleteDocumentsByUser,
  getDocument,
  listDocumentsByUser,
  saveDocument,
  updateChecklistItem,
  updateDocument,
} from "../store/memoryStore.js";

interface CreateBody {
  document_id?: string;
}

interface ChecklistBody {
  item_id?: string;
  completed?: boolean;
}

const UUID_V4_OR_V1_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    case "DOCUMENT_UNSUPPORTED":
      return "Document type is not supported for generation.";
    case "DOCUMENT_NOT_LECTURE":
      return "Quiz generation is only available for lecture documents.";
    case "ALREADY_PROCESSING":
      return "Generation is already in progress.";
    case "ILLEGAL_RETRY_STATE":
      return "Retry is only allowed after a failed generation.";
    default:
      return "Generation failed. Retry generation.";
  }
}

export async function uploadDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req);
    const file = req.file;
    if (!file) {
      sendApiError(res, 400, "MISSING_FILE", "Missing file upload.");
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
      pageCount: extracted.pageCount ?? 0,
      paragraphCount: extracted.paragraphCount,
      extractedText: normalizedText,
      originalFileBuffer: file.buffer,
      studyGuide: null,
      quiz: null,
      errorCode: null,
      errorMessage: null,
    });

    res.status(201).json({
      document_id: documentId,
      document_type: detected.documentType,
      status: "uploaded",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    sendApiError(res, 500, "EXTRACTION_FAILED", message);
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
    page_count: doc.pageCount,
    uploaded_at: doc.uploadedAt,
    has_study_guide: doc.studyGuide !== null,
    has_quiz: doc.quiz !== null,
  }));
  res.status(200).json(items);
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
  if (isFlowProcessing(doc.status, doc.errorCode, "STUDY_GUIDE")) {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Study guide is already processing.");
    return;
  }
  if (isFlowFailed(doc.status, doc.errorCode, "STUDY_GUIDE")) {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Use retry endpoint for failed documents.");
    return;
  }

  updateDocument(documentId, (current) => ({
    ...current,
    status: "processing",
    errorCode: FLOW_PROCESSING_CODE.STUDY_GUIDE,
    errorMessage: null,
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
        status: "ready",
        studyGuide: generated,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        errorMessage: failure.message,
      }));
    }
  })();

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
  if (isFlowProcessing(doc.status, doc.errorCode, "STUDY_GUIDE")) {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Study guide is already processing.");
    return;
  }
  if (!isFlowFailed(doc.status, doc.errorCode, "STUDY_GUIDE")) {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocument(documentId, (current) => ({
    ...current,
    status: "processing",
    errorCode: FLOW_PROCESSING_CODE.STUDY_GUIDE,
    errorMessage: null,
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
        status: "ready",
        studyGuide: generated,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: makeFlowFailureCode("STUDY_GUIDE", failure.code),
        errorMessage: failure.message,
      }));
    }
  })();

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
  res.status(200).json(doc.studyGuide);
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
  if (isFlowProcessing(doc.status, doc.errorCode, "QUIZ")) {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Quiz is already processing.");
    return;
  }
  if (isFlowFailed(doc.status, doc.errorCode, "QUIZ")) {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Use retry endpoint for failed documents.");
    return;
  }
  updateDocument(documentId, (current) => ({
    ...current,
    status: "processing",
    errorCode: FLOW_PROCESSING_CODE.QUIZ,
    errorMessage: null,
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
        status: "ready",
        quiz: generatedQuiz,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: makeFlowFailureCode("QUIZ", failure.code),
        errorMessage: failure.message,
      }));
    }
  })();

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
  if (isFlowProcessing(doc.status, doc.errorCode, "QUIZ")) {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Quiz is already processing.");
    return;
  }
  if (!isFlowFailed(doc.status, doc.errorCode, "QUIZ")) {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocument(documentId, (current) => ({
    ...current,
    status: "processing",
    errorCode: FLOW_PROCESSING_CODE.QUIZ,
    errorMessage: null,
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
        status: "ready",
        quiz: generatedQuiz,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const failure = toFailureCode(error);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: makeFlowFailureCode("QUIZ", failure.code),
        errorMessage: failure.message,
      }));
    }
  })();

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
