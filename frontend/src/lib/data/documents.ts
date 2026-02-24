import { ApiClientError, api, type ApiRequestOptions } from "@/lib/api";
import type {
  DocumentDetail,
  DocumentListItem,
  Quiz,
  StudyGuideResponse,
} from "@/lib/contracts";

export async function listDocuments(q?: string): Promise<DocumentListItem[]> {
  const docs = await api<DocumentListItem[]>("/api/documents");
  const query = (q ?? "").toLowerCase().trim();
  if (!query) return docs;
  return docs.filter((d) => d.filename.toLowerCase().includes(query));
}

interface DocumentRequestOptions {
  signal?: AbortSignal;
  apiOptions?: ApiRequestOptions;
}

export async function getDocumentStatus(
  id: string,
  options: DocumentRequestOptions = {}
): Promise<DocumentListItem | null> {
  try {
    return await api<DocumentListItem>(
      `/api/documents/${id}`,
      options.signal ? { signal: options.signal } : {},
      options.apiOptions
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const document = await getDocumentStatus(id);
  if (!document) return null;

  let studyGuide: StudyGuideResponse | null = null;
  if (document.study_guide_status === "ready" || document.has_study_guide) {
    try {
      studyGuide = await api<StudyGuideResponse>(`/api/study-guide/${id}`);
    } catch (error) {
      if (!(error instanceof ApiClientError && error.status === 404)) {
        throw error;
      }
      studyGuide = null;
    }
  }

  if (!studyGuide) {
    return { document, studyGuide: null, checklistCompletion: {} };
  }

  const { checklist_completion, ...guide } = studyGuide;
  return {
    document,
    studyGuide: guide,
    checklistCompletion: checklist_completion ?? {},
  };
}

export async function getQuiz(documentId: string): Promise<Quiz> {
  return api<Quiz>(`/api/quiz/${documentId}`);
}

export async function updateChecklistItem(
  documentId: string,
  itemId: string,
  completed: boolean
): Promise<void> {
  await api<{ success: boolean }>(`/api/checklist/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify({ item_id: itemId, completed }),
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  await api<{ success: boolean }>(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
}

export async function deleteAllUserData(): Promise<void> {
  await api<{ success: boolean }>("/api/user/data", {
    method: "DELETE",
  });
}
