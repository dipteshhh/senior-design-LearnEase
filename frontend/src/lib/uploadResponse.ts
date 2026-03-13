export interface UploadResponseMeta {
  status?: "uploaded" | "processing" | "ready" | "failed";
  reused_existing?: boolean;
  message?: string;
}

export function getDuplicateReuseMessage(payload: UploadResponseMeta): string | null {
  if (!payload.reused_existing) {
    return null;
  }

  return (
    payload.message ??
    "This file was already uploaded. We reused the existing document and study guide state."
  );
}

export function shouldTriggerStudyGuideCreate(payload: UploadResponseMeta): boolean {
  return !payload.reused_existing;
}

export function getUploadRedirectPath(documentId: string, payload: UploadResponseMeta): string {
  if (!payload.reused_existing) {
    return `/documents/${documentId}/processing`;
  }

  if (payload.status === "ready" || payload.status === "failed") {
    return `/documents/${documentId}`;
  }

  return `/documents/${documentId}/processing`;
}
