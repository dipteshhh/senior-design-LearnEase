import type { DocumentType, Quiz, StudyGuide } from "../schemas/analyze.js";

export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface DocumentRecord {
  id: string;
  filename: string;
  documentType: DocumentType;
  status: DocumentStatus;
  uploadedAt: string;
  pageCount: number;
  extractedText: string;
  studyGuide: StudyGuide | null;
  quiz: Quiz | null;
  errorCode: string | null;
  errorMessage: string | null;
}

const documents = new Map<string, DocumentRecord>();

export function saveDocument(doc: DocumentRecord): void {
  documents.set(doc.id, doc);
}

export function getDocument(id: string): DocumentRecord | undefined {
  return documents.get(id);
}

export function listDocuments(): DocumentRecord[] {
  return [...documents.values()].sort((a, b) =>
    a.uploadedAt < b.uploadedAt ? 1 : -1
  );
}

export function updateDocument(
  id: string,
  mutator: (current: DocumentRecord) => DocumentRecord
): DocumentRecord | undefined {
  const current = documents.get(id);
  if (!current) return undefined;
  const next = mutator(current);
  documents.set(id, next);
  return next;
}

export function deleteAllDocuments(): void {
  documents.clear();
}

