# LearnEase — API Errors, Status Codes, and Idempotency

All endpoints must return consistent error payloads.

---

## 1) Error Payload Shape

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

---

## 2) Common Status Codes

- `200` OK (successful read, or returning cached output)
- `201` Created (upload creates a new document record)
- `202` Accepted (user-triggered generation started, status = processing)
- `400` Bad Request (missing required fields)
- `401` Unauthorized (no valid session)
- `403` Forbidden (not owner / not allowed)
- `404` Not Found (document_id not found)
- `409` Conflict (illegal state transition, e.g., create study guide while processing)
- `415` Unsupported Media Type (non PDF/DOCX upload)
- `422` Unprocessable Entity (schema validation failed OR quote/citation validation failed)
- `500` Internal Server Error

Notes:
- `202` does not imply background cron/queue jobs; processing is still user-triggered and request-scoped per `docs/SPEC.md`.
- Retention cleanup jobs are allowed; this restriction applies to OpenAI generation flow orchestration.

---

## 3) Idempotency Rules (Prevents Duplicate Generations)

### Study guide generation
- If cached study guide exists and document status is `ready`:
  - `POST /api/study-guide/create` returns `200` with cached status only (`{ "status": "ready", "cached": true }`)
- If no cached study guide exists and document status is `uploaded`:
  - `POST /api/study-guide/create` returns `202` and starts processing
- If document status is `processing`:
  - return `409` (`ALREADY_PROCESSING`)
- If document status is `failed`:
  - `POST /api/study-guide/create` returns `409` (`ILLEGAL_RETRY_STATE`)
  - allow explicit retry only via `POST /api/study-guide/retry`

### Quiz generation
- Same lifecycle as study guide, but lecture-only:
  - `POST /api/quiz/create` returns `422` (`DOCUMENT_NOT_LECTURE`) for non-lecture documents
  - if status is `failed`, `POST /api/quiz/create` returns `409` (`ILLEGAL_RETRY_STATE`)
  - retries are only allowed via `POST /api/quiz/retry` when status is `failed`

---

## 4) Validation Failure Codes

Suggested error codes:
- `SCHEMA_VALIDATION_FAILED`
- `QUOTE_NOT_FOUND`
- `CITATION_EXCERPT_NOT_FOUND`
- `CITATION_OUT_OF_RANGE`
- `GENERATION_INTERRUPTED`
- `GENERATION_FAILED`
- `DOCUMENT_UNSUPPORTED`
- `DOCUMENT_NOT_LECTURE`
- `ALREADY_PROCESSING`
- `ILLEGAL_RETRY_STATE`
- `ACADEMIC_INTEGRITY_VIOLATION`
- `AUTH_PROVIDER_UNAVAILABLE`
- `EMAIL_NOT_VERIFIED`
