import type { DocumentDetail, DocumentListItem } from "@/lib/contracts";
import { getRecentDocuments, getDocumentById, getQuizByDocumentId } from "@/lib/mock/store";

export async function listDocuments(q?: string): Promise<DocumentListItem[]> {
  const docs = getRecentDocuments();
  const query = (q ?? "").toLowerCase().trim();
  if (!query) return docs as unknown as DocumentListItem[];
  return docs.filter((d) => d.title.toLowerCase().includes(query)) as unknown as DocumentListItem[];
}

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const doc = getDocumentById(id);
  return (doc ?? null) as unknown as DocumentDetail | null;
}

export async function getQuiz(documentId: string) {
  return getQuizByDocumentId(documentId);
}
