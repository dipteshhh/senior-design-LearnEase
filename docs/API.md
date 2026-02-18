# LearnEase — API Contract (Source of Truth)

All routes require authentication (see `docs/AUTH.md`) **except** the public auth routes below.

All errors MUST follow `docs/API_ERRORS.md`.

Create and retry endpoints return generation status only. Cached Study Guide/Quiz JSON is fetched from the corresponding `GET` endpoints.

---

## POST /api/auth/google (public — no session required)

Exchange a Google ID token for a signed session cookie.

Frontend should call this after Google Sign-In (One Tap or redirect flow) with the `credential` token Google provides.

Request:
```json
{ "credential": "google_id_token_string" }
```

Response:
- `200`
- Sets `learnease_session` HttpOnly cookie automatically
```json
{
  "user": {
    "id": "google_subject_id",
    "email": "user@example.com",
    "name": "Display Name"
  }
}
```

Errors:
- `400` missing credential
- `401` invalid or expired Google token
- `401` email not verified (`EMAIL_NOT_VERIFIED`)
- `500` auth provider unavailable (`AUTH_PROVIDER_UNAVAILABLE`)
- `500` auth configuration error (`AUTH_CONFIG_ERROR`)

---

## POST /api/auth/logout (public — no session required)

Clear the session cookie.

Request: empty body

Response:
- `200`
- Clears `learnease_session` cookie
```json
{ "success": true }
```

---

## GET /api/auth/me

Return the current authenticated user's info.

Response:
- `200`
```json
{
  "user": {
    "id": "google_subject_id",
    "email": "user@example.com",
    "name": "Display Name"
  }
}
```

Errors:
- `401` unauthorized (no valid session)

---

## POST /api/upload

Upload a PDF or DOCX document.

Request:
- `multipart/form-data`
- `file`: PDF or DOCX

Notes:
- Max upload size defaults to `10MB` and can be configured with `UPLOAD_MAX_FILE_SIZE_MB`.

Responses:
- `201`
```json
{
  "document_id": "uuid",
  "document_type": "HOMEWORK | LECTURE | SYLLABUS | UNSUPPORTED",
  "status": "uploaded"
}
```

Errors:
- `400` missing file
- `400` file too large (`FILE_TOO_LARGE`)
- `401` unauthorized
- `415` unsupported file type
- `500` extraction failure

---

## GET /api/documents

List the authenticated user's documents.

Response:
- `200`
```json
[
  {
    "id": "uuid",
    "filename": "hw1.pdf",
    "document_type": "HOMEWORK | LECTURE | SYLLABUS | UNSUPPORTED",
    "status": "uploaded | processing | ready | failed",
    "study_guide_status": "idle | processing | ready | failed",
    "quiz_status": "idle | processing | ready | failed",
    "page_count": 5,
    "uploaded_at": "timestamp",
    "error_code": "SCHEMA_VALIDATION_FAILED | QUOTE_NOT_FOUND | GENERATION_INTERRUPTED | ... | null",
    "error_message": "safe user-facing message | null",
    "has_study_guide": true,
    "has_quiz": false
  }
]
```

Notes:
- `status` is the derived overall document status. `study_guide_status` and `quiz_status` are independent per-flow statuses.
- `error_code` and `error_message` are populated only when `status = "failed"`.
- `error_message` is a sanitized user-facing message, not raw provider/internal error text.
- Frontend should use `study_guide_status` / `quiz_status` to show per-flow loading spinners, retry buttons, etc.

Errors:
- `401` unauthorized

---

## DELETE /api/documents/:documentId

Delete one document owned by the authenticated user.

Response:
- `200`
```json
{ "success": true }
```

Errors:
- `401` unauthorized
- `403` not owner
- `404` document not found
- `422` malformed `documentId` (must be UUID)

---

## POST /api/study-guide/create

Trigger Study Guide generation (user-triggered only).

Request:
```json
{ "document_id": "uuid" }
```

Responses:
- `202` (started)
```json
{ "status": "processing" }
```
- `200` (already generated; cached)
```json
{ "status": "ready", "cached": true }
```

Errors:
- `400` missing document_id
- `401` unauthorized
- `403` not owner
- `404` document not found
- `409` already processing (`ALREADY_PROCESSING`)
- `409` failed state requires retry endpoint (`ILLEGAL_RETRY_STATE`)
- `422` document unsupported (`DOCUMENT_UNSUPPORTED`)

Async failures (schema validation, quote grounding, citation range) are **not** returned as HTTP errors.
They surface as `status: "failed"` with `error_code` / `error_message` on the document object
(poll via `GET /api/documents`). See `docs/API_ERRORS.md` for error code reference.

---

## POST /api/study-guide/retry

Retry Study Guide generation only after failure.

Valid only when:
- document exists and belongs to authenticated user
- document status is `failed`
- document is not currently `processing`

Request:
```json
{ "document_id": "uuid" }
```

Response:
- `202`
```json
{ "status": "processing", "retry": true }
```

Errors:
- `400` missing document_id
- `401` unauthorized
- `403` not owner
- `404` document not found
- `409` already processing (`ALREADY_PROCESSING`)
- `409` illegal retry state (`ILLEGAL_RETRY_STATE`)
- `422` document unsupported (`DOCUMENT_UNSUPPORTED`)

Async failures surface via document status polling (see create endpoint above).

---

## GET /api/study-guide/:documentId

Fetch cached Study Guide JSON.

Response:
- `200` returns `StudyGuide` object exactly as defined in `docs/SCHEMAS.md`

Errors:
- `401` unauthorized
- `403` not owner
- `404` no study guide exists for this document

---

## POST /api/quiz/create

Generate quiz (lecture-only, user-triggered only).

Request:
```json
{ "document_id": "uuid" }
```

Responses:
- `202` (started)
```json
{ "status": "processing" }
```
- `200` (already generated; cached)
```json
{ "status": "ready", "cached": true }
```

Errors:
- `400` missing document_id
- `401` unauthorized
- `403` not owner
- `404` document not found
- `409` already processing (`ALREADY_PROCESSING`)
- `409` failed state requires retry endpoint (`ILLEGAL_RETRY_STATE`)
- `422` not lecture (`DOCUMENT_NOT_LECTURE`)

Async failures (schema validation, quote grounding, citation range) are **not** returned as HTTP errors.
They surface as `status: "failed"` with `error_code` / `error_message` on the document object
(poll via `GET /api/documents`). See `docs/API_ERRORS.md` for error code reference.

---

## POST /api/quiz/retry

Retry quiz generation only after failure (lecture-only).

Valid only when:
- document exists and belongs to authenticated user
- document status is `failed`
- document is not currently `processing`

Request:
```json
{ "document_id": "uuid" }
```

Response:
- `202`
```json
{ "status": "processing", "retry": true }
```

Errors:
- `400` missing document_id
- `401` unauthorized
- `403` not owner
- `404` document not found
- `409` already processing (`ALREADY_PROCESSING`)
- `409` illegal retry state (`ILLEGAL_RETRY_STATE`)
- `422` not lecture (`DOCUMENT_NOT_LECTURE`)

Async failures surface via document status polling (see quiz create endpoint above).

---

## GET /api/quiz/:documentId

Fetch cached quiz JSON.

Response:
- `200` returns `Quiz` object exactly as defined in `docs/SCHEMAS.md`

Errors:
- `401` unauthorized
- `403` not owner
- `404` no quiz exists for this document

---

## PATCH /api/checklist/:documentId

Update checklist completion state.

Request:
```json
{ "item_id": "checklist-item-id", "completed": true }
```

Notes:
- `item_id` must match an existing checklist item `id` returned in the generated Study Guide checklist.

Response:
- `200`
```json
{ "success": true }
```

Errors:
- `400` missing fields
- `401` unauthorized
- `403` not owner
- `404` checklist item not found

---

## DELETE /api/user/data

Delete all user data immediately.

Response:
- `200`
```json
{ "success": true }
```

Errors:
- `401` unauthorized
