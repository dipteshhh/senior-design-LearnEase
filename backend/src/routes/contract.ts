import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { sendApiError } from "../lib/apiError.js";
import type { DocumentType, Quiz } from "../schemas/analyze.js";
import { detectDocumentType } from "../services/documentDetector.js";
import { analyzeDocument } from "../services/contentAnalyzer.js";
import { extractTextFromBuffer } from "../services/textExtractor.js";
import {
  deleteAllDocuments,
  getDocument,
  listDocuments,
  saveDocument,
  updateDocument,
} from "../store/memoryStore.js";

interface CreateBody {
  document_id?: string;
}

interface ChecklistBody {
  item_id?: string;
  completed?: boolean;
}

function readDocumentId(req: Request): string | null {
  const body = req.body as CreateBody | undefined;
  const id = body?.document_id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

export async function uploadDocumentHandler(req: Request, res: Response): Promise<void> {
  try {
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
    const detected = detectDocumentType(extracted.text);

    const documentId = randomUUID();
    saveDocument({
      id: documentId,
      filename: file.originalname,
      documentType: detected.documentType,
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
      pageCount: 0,
      extractedText: extracted.text,
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
  const items = listDocuments().map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    document_type: doc.documentType,
    status: doc.status,
    page_count: doc.pageCount,
    uploaded_at: doc.uploadedAt,
  }));
  res.status(200).json(items);
}

export async function createStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  const doc = getDocument(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return;
  }
  if (doc.documentType === "UNSUPPORTED") {
    sendApiError(res, 422, "DOCUMENT_UNSUPPORTED", "Unsupported document type.");
    return;
  }
  if (doc.status === "ready" && doc.studyGuide) {
    res.status(200).json({ status: "ready", cached: true });
    return;
  }
  if (doc.status === "processing") {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Study guide is already processing.");
    return;
  }
  if (doc.status === "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Use retry endpoint for failed documents.");
    return;
  }

  updateDocument(documentId, (current) => ({ ...current, status: "processing" }));

  void (async () => {
    try {
      const generated = await analyzeDocument(doc.extractedText, doc.documentType);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "ready",
        studyGuide: generated,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: "GENERATION_FAILED",
        errorMessage: message,
      }));
    }
  })();

  res.status(202).json({ status: "processing" });
}

export async function retryStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  const doc = getDocument(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return;
  }
  if (doc.documentType === "UNSUPPORTED") {
    sendApiError(res, 422, "DOCUMENT_UNSUPPORTED", "Unsupported document type.");
    return;
  }
  if (doc.status === "processing") {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Study guide is already processing.");
    return;
  }
  if (doc.status !== "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocument(documentId, (current) => ({ ...current, status: "processing" }));

  void (async () => {
    try {
      const generated = await analyzeDocument(doc.extractedText, doc.documentType);
      updateDocument(documentId, (current) => ({
        ...current,
        status: "ready",
        studyGuide: generated,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: "GENERATION_FAILED",
        errorMessage: message,
      }));
    }
  })();

  res.status(202).json({ status: "processing", retry: true });
}

export async function getStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const doc = getDocument(req.params.documentId);
  if (!doc || !doc.studyGuide || doc.status !== "ready") {
    sendApiError(
      res,
      404,
      "NOT_FOUND",
      `No study guide exists for document ${req.params.documentId}.`
    );
    return;
  }
  res.status(200).json(doc.studyGuide);
}

export async function createQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  const doc = getDocument(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return;
  }
  if (doc.documentType !== "LECTURE") {
    sendApiError(res, 422, "DOCUMENT_NOT_LECTURE", "Quiz generation is lecture-only.");
    return;
  }
  if (doc.status === "processing") {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Quiz is already processing.");
    return;
  }
  if (doc.status === "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Use retry endpoint for failed documents.");
    return;
  }
  if (doc.quiz) {
    res.status(200).json({ status: "ready", cached: true });
    return;
  }

  updateDocument(documentId, (current) => ({ ...current, status: "processing" }));

  void (async () => {
    try {
      const generatedQuiz: Quiz = {
        document_id: documentId,
        questions: [],
      };
      updateDocument(documentId, (current) => ({
        ...current,
        status: "ready",
        quiz: generatedQuiz,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quiz generation failed";
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: "GENERATION_FAILED",
        errorMessage: message,
      }));
    }
  })();

  res.status(202).json({ status: "processing" });
}

export async function retryQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  const doc = getDocument(documentId);
  if (!doc) {
    sendApiError(res, 404, "NOT_FOUND", "Document not found.");
    return;
  }
  if (doc.documentType !== "LECTURE") {
    sendApiError(res, 422, "DOCUMENT_NOT_LECTURE", "Quiz generation is lecture-only.");
    return;
  }
  if (doc.status === "processing") {
    sendApiError(res, 409, "ALREADY_PROCESSING", "Quiz is already processing.");
    return;
  }
  if (doc.status !== "failed") {
    sendApiError(res, 409, "ILLEGAL_RETRY_STATE", "Retry is only allowed from failed state.");
    return;
  }

  updateDocument(documentId, (current) => ({ ...current, status: "processing" }));

  void (async () => {
    try {
      const generatedQuiz: Quiz = {
        document_id: documentId,
        questions: [],
      };
      updateDocument(documentId, (current) => ({
        ...current,
        status: "ready",
        quiz: generatedQuiz,
        errorCode: null,
        errorMessage: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quiz generation failed";
      updateDocument(documentId, (current) => ({
        ...current,
        status: "failed",
        errorCode: "GENERATION_FAILED",
        errorMessage: message,
      }));
    }
  })();

  res.status(202).json({ status: "processing", retry: true });
}

export async function getQuizHandler(req: Request, res: Response): Promise<void> {
  const doc = getDocument(req.params.documentId);
  if (!doc || !doc.quiz || doc.status !== "ready") {
    sendApiError(
      res,
      404,
      "NOT_FOUND",
      `No quiz exists for document ${req.params.documentId}.`
    );
    return;
  }
  res.status(200).json(doc.quiz);
}

export async function updateChecklistHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as ChecklistBody | undefined;
  const hasItemId = typeof body?.item_id === "string" && body.item_id.trim().length > 0;
  const hasCompleted = typeof body?.completed === "boolean";

  if (!hasItemId || !hasCompleted) {
    sendApiError(res, 400, "MISSING_FIELDS", "item_id and completed are required.");
    return;
  }

  res.status(200).json({ success: true });
}

export async function deleteUserDataHandler(_req: Request, res: Response): Promise<void> {
  deleteAllDocuments();
  res.status(200).json({ success: true });
}
