import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { sendApiError } from "../lib/apiError.js";
import { DocumentType } from "../schemas/analyze.js";

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
  const file = req.file;
  if (!file) {
    sendApiError(res, 400, "MISSING_FILE", "Missing file upload.");
    return;
  }

  // Step 1 skeleton: surface contract only. Full classification/storage is implemented in later phases.
  const payload = {
    document_id: randomUUID(),
    document_type: DocumentType.enum.UNSUPPORTED,
    status: "uploaded" as const,
  };

  res.status(201).json(payload);
}

export async function listDocumentsHandler(_req: Request, res: Response): Promise<void> {
  res.status(200).json([]);
}

export async function createStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  res.status(202).json({ status: "processing" });
}

export async function retryStudyGuideHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  res.status(202).json({ status: "processing", retry: true });
}

export async function getStudyGuideHandler(req: Request, res: Response): Promise<void> {
  sendApiError(
    res,
    404,
    "NOT_FOUND",
    `No study guide exists for document ${req.params.documentId}.`
  );
}

export async function createQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  res.status(202).json({ status: "processing" });
}

export async function retryQuizHandler(req: Request, res: Response): Promise<void> {
  const documentId = readDocumentId(req);
  if (!documentId) {
    sendApiError(res, 400, "MISSING_DOCUMENT_ID", "Missing document_id.");
    return;
  }

  res.status(202).json({ status: "processing", retry: true });
}

export async function getQuizHandler(req: Request, res: Response): Promise<void> {
  sendApiError(
    res,
    404,
    "NOT_FOUND",
    `No quiz exists for document ${req.params.documentId}.`
  );
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
  res.status(200).json({ success: true });
}

