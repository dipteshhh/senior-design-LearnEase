# LearnEase Frontend Integration Handoff

This guide is for frontend integration against the current backend.

Source-of-truth docs:
- `docs/API.md`
- `docs/API_ERRORS.md`
- `docs/AUTH.md`
- `docs/SCHEMAS.md`

## 1) Base Rules

- Backend base URL (local): `http://localhost:3001`
- All authenticated requests must include cookies:
  - `fetch(..., { credentials: "include" })`
- Error shape is always:
  - `{ "error": { "code": string, "message": string, "details"?: object } }`
- For file uploads with `FormData`, do **not** set `Content-Type` manually.
  - Let the browser set `multipart/form-data; boundary=...`.

## 2) Google Auth Integration

### Sign in
1. Use Google Identity Services in frontend.
2. Send Google credential token to:
   - `POST /api/auth/google`
   - body: `{ "credential": "<google_id_token>" }`
3. Backend sets `learnease_session` HttpOnly cookie.

### Session restore
- On app init call:
  - `GET /api/auth/me`
- If `200`, user is authenticated.
- If `401`, route user to sign-in.

### Logout
- `POST /api/auth/logout`
- Then clear frontend auth state.

## 3) Core Lifecycle (Upload -> Generate -> Display)

### A. Upload document
- `POST /api/upload` (`multipart/form-data`, field name: `file`)
- Success `201`:
  - `{ document_id, document_type, status: "uploaded" }`

### B. Show recent uploads
- `GET /api/documents`
- Use:
  - `filename`, `uploaded_at`, `page_count`
  - `status` (overall)
  - `study_guide_status` and `quiz_status` (per-flow source of truth)

Important:
- Drive UI spinners/retry buttons from per-flow statuses, not only overall `status`.

### C. Start study guide generation
- `POST /api/study-guide/create` with `{ document_id }`
- Responses:
  - `202 { status: "processing" }`
  - `200 { status: "ready", cached: true }` (already generated)

### D. Poll until ready/failed
- Poll `GET /api/documents` (or document-specific derived list lookup).
- Stop when `study_guide_status` is:
  - `ready` -> fetch full payload
  - `failed` -> show retry action with sanitized `error_message`
- While status is still `processing`, `GET /api/study-guide/:documentId` may return `404`.
  - Treat that as "not ready yet" and continue polling.

### E. Fetch study guide payload
- `GET /api/study-guide/:documentId`
- Use tabs/sections from returned schema:
  - `overview`
  - `key_actions`
  - `checklist`
  - `important_details` (`dates`, `policies`, `contacts`, `logistics`)
  - `sections`

### E.1 Focus Mode (frontend behavior)
- Focus Mode is a frontend presentation mode over Study Guide `sections`.
- Backend does not expose a separate focus-mode endpoint/flag.
- Recommended behavior:
  - treat it as a product/UI decision
  - backend supports it anywhere `sections` are available (not lecture-only)

### F. Retry study guide if failed
- `POST /api/study-guide/retry` with `{ document_id }`
- Success: `202 { status: "processing", retry: true }`

## 4) Quiz ("Test Your Knowledge")

### Create quiz
- `POST /api/quiz/create` with `{ document_id }`
- Responses:
  - `202 { status: "processing" }`
  - `200 { status: "ready", cached: true }`
- Guard:
  - non-lecture docs return `422 DOCUMENT_NOT_LECTURE`

### Poll and fetch
- Poll `GET /api/documents` until `quiz_status` is `ready` or `failed`
- Fetch payload:
  - `GET /api/quiz/:documentId`
- While status is still `processing`, `GET /api/quiz/:documentId` may return `404`.
  - Treat that as "not ready yet" and continue polling.

### Retry quiz if failed
- `POST /api/quiz/retry` with `{ document_id }`

## 5) Checklist (Study Guide Tab)

- Update item completion:
  - `PATCH /api/checklist/:documentId`
  - body: `{ item_id, completed }`
- Success: `200 { success: true }`

## 6) Delete Flows

### Delete single document
- `DELETE /api/documents/:documentId`
- Success: `200 { success: true }`

### Delete all user data
- `DELETE /api/user/data`
- Success: `200 { success: true }`

## 7) Polling + UX Recommendations

- Recommended polling interval: `1s-2s` while a flow is processing.
- Read limits:
  - `RATE_LIMIT_MAX` for non-poll routes
  - `RATE_LIMIT_POLL_MAX` for polling routes:
    - `GET /api/documents`
    - `GET /api/study-guide/:id`
    - `GET /api/quiz/:id`
- Handle `429 RATE_LIMITED` with short backoff and continue polling.

## 8) Error Handling Contract (Frontend)

- `401 UNAUTHORIZED`:
  - clear local auth state
  - redirect to login
- `403 FORBIDDEN`:
  - ownership violation; show access-denied UI
- `404 NOT_FOUND`:
  - missing document or payload not generated yet (depending on endpoint/flow)
- `409 ALREADY_PROCESSING` / `ILLEGAL_RETRY_STATE`:
  - show current lifecycle state and disable invalid actions
- `422 DOCUMENT_UNSUPPORTED` / `DOCUMENT_NOT_LECTURE`:
  - show contextual guidance, disable invalid flow action

## 9) Minimal Fetch Helpers

```ts
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers = new Headers(init.headers || {});
  if (!isFormData && init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`http://localhost:3001${path}`, {
    credentials: "include",
    headers,
    ...init,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data?.error ?? { code: "UNKNOWN", message: "Request failed" };
  return data as T;
}
```

```ts
// Example: start study guide + poll
await api("/api/study-guide/create", {
  method: "POST",
  body: JSON.stringify({ document_id }),
});

const poll = async () => {
  while (true) {
    const docs = await api<any[]>("/api/documents");
    const doc = docs.find((d) => d.id === document_id);
    if (!doc) throw new Error("Document missing");
    if (doc.study_guide_status === "ready") return;
    if (doc.study_guide_status === "failed") throw doc;
    await new Promise((r) => setTimeout(r, 1200));
  }
};
```

## 10) What Backend Guarantees (for UI confidence)

- Guardrails are backend-enforced (no direct assignment-solving outputs in restricted modes).
- Artifact files are encrypted at rest (AES-256-GCM).
- Retention purge removes expired documents (default 30 days).
- Ownership checks block cross-user document access.
