# Frontend Integration Ticket Backlog

Purpose: executable frontend integration tickets aligned with backend contract.

Canonical backend contract docs:
- `docs/API.md`
- `docs/AUTH.md`
- `docs/API_ERRORS.md`
- `docs/SCHEMAS.md`

Recommended execution order:
- `FE-INT-001` -> `FE-INT-003` -> `FE-INT-002` -> `FE-INT-004` -> `FE-INT-005`/`FE-INT-006` -> `FE-INT-007`/`FE-INT-008`/`FE-INT-009` -> `FE-INT-010`

---

## FE-INT-001 — Canonical Contract Policy + Drift Guard
Priority: P0

Objective:
- Ensure frontend implementation uses root `docs/*` as source of truth.

Scope:
- Document policy in frontend contribution docs.
- Block references to `frontend/docs/*` in implementation docs/comments via CI/lint script.

Endpoints:
- N/A

Edge cases:
- Historical references in legacy docs should be migrated or explicitly excluded.

Acceptance criteria:
- Frontend docs/contributing note states root `docs/*` is canonical.
- CI check fails when new references to `frontend/docs/*` appear in implementation docs/comments.
- Existing stale references are removed or justified with ignore list.

Test checklist:
- Add a sample forbidden reference and verify CI fails.
- Remove sample reference and verify CI passes.

---

## FE-INT-002 — Upload Contract Alignment (PDF/DOCX, 50MB)
Priority: P0

Objective:
- Align frontend upload behavior with backend upload contract.

Scope:
- Restrict file chooser and client validation to PDF/DOCX only.
- Update all upload UX copy from PPT/PPTX wording to PDF/DOCX.
- Keep max-size UX at 50MB.

Endpoints:
- `POST /api/upload`

Edge cases:
- Client allows file but backend rejects by MIME/signature.
- Upload failures may surface as `400` (including `FILE_TOO_LARGE`) or `415 UNSUPPORTED_MEDIA_TYPE`.
- `500 EXTRACTION_FAILED`.

Acceptance criteria:
- Frontend no longer allows PPT/PPTX.
- Upload hints and errors reference PDF/DOCX and 50MB.
- Backend error responses are rendered with actionable messaging.

Test checklist:
- Upload valid PDF succeeds.
- Upload valid DOCX succeeds.
- Upload PPT/PPTX blocked client-side.
- Oversized file returns friendly `FILE_TOO_LARGE` UX.

---

## FE-INT-003 — Auth + Shared API Client + Session Recovery
Priority: P0

Objective:
- Centralize request behavior and stabilize auth lifecycle.

Scope:
- Add shared API client with `credentials: "include"`.
- Wire auth endpoints.
- Preserve intended route after login (`returnTo`).
- Clear auth state globally on `401`.
- Ensure frontend Google Sign-In client ID matches backend `GOOGLE_CLIENT_ID`.

Endpoints:
- `POST /api/auth/google`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Edge cases:
- Token exchange fails (`INVALID_GOOGLE_TOKEN`, `EMAIL_NOT_VERIFIED`, provider unavailable).
- Session expires mid-flow (`401` on any request).
- Audience mismatch due to client ID misconfiguration (`INVALID_GOOGLE_TOKEN`).

Acceptance criteria:
- All authenticated calls go through shared API client.
- `returnTo` navigation restored after successful login.
- Global `401` handler clears auth state and routes to sign-in.

Test checklist:
- Login sets session and grants protected access.
- App reload restores session via `/api/auth/me`.
- Expired/no session forces sign-in and preserves destination.

---

## FE-INT-004 — Remove Mock Data + Type Contract Alignment
Priority: P0

Objective:
- Replace mock stores with backend-driven data and contract-true types.

Scope:
- Remove runtime dependence on mock data sources.
- Align frontend types to backend schema fields and error shapes.
- Remove backend-only packages from frontend dependencies (`mammoth`, `pdf-parse`, `multer`) if present.

Required field mapping checkpoints:
- list rows: `title` -> `filename`
- list rows: `pages` -> `page_count`
- list rows: `createdAtLabel` -> `uploaded_at`
- status values: lowercase contract values including `uploaded`
- quiz answer: `string` value (not option index)
- extraction lists (`key_actions`, `checklist`, `important_details.*`): `ExtractionItem[]` objects (not `string[]`)

Endpoints:
- `GET /api/documents`
- `GET /api/study-guide/:documentId`
- `GET /api/quiz/:documentId`

Edge cases:
- Optional/null fields in payloads.
- Unknown error codes still need generic UX fallback.

Acceptance criteria:
- Core pages read from backend responses only.
- Types match root contract docs (including error payload shape).

Test checklist:
- Mock layer disabled/removed without runtime break.
- Type checks pass for list, study guide, quiz, error payloads.

---

## FE-INT-005 — Study Guide Lifecycle (Create, Poll, Fetch, Retry)
Priority: P0

Objective:
- Implement real async study-guide flow with correct state semantics.

Scope:
- Create generation request.
- Poll per-flow status from documents list.
- Fetch final payload on ready.
- Retry on failed state.

Endpoints:
- `POST /api/study-guide/create`
- `POST /api/study-guide/retry`
- `GET /api/study-guide/:documentId`
- `GET /api/documents`

Edge cases:
- `200 { status: "ready", cached: true }` on create.
- `409 ALREADY_PROCESSING` with `Retry-After`.
- `409 ILLEGAL_RETRY_STATE`.
- `422 DOCUMENT_UNSUPPORTED`.
- While processing: `GET /api/study-guide/:id` returning `404` must be treated as "not ready yet".
- Failed docs with `error_code=GENERATION_FAILED` should show a clear "try again later/retry" UX.

Acceptance criteria:
- UI uses `study_guide_status` from `/api/documents` as source of truth.
- `404` from `/api/study-guide/:id` is non-fatal while status is `processing`.
- Retry CTA appears only when `study_guide_status=failed`.

Test checklist:
- Uploaded -> processing -> ready path.
- Failed -> retry -> processing -> ready path.
- Processing conflict honors `Retry-After`.

---

## FE-INT-006 — Quiz Lifecycle (Create, Poll, Fetch, Retry)
Priority: P0

Objective:
- Implement real async quiz flow consistent with lecture-only backend guard.

Scope:
- Create quiz request.
- Poll per-flow quiz status.
- Fetch final quiz payload.
- Retry failed quiz generation.

Endpoints:
- `POST /api/quiz/create`
- `POST /api/quiz/retry`
- `GET /api/quiz/:documentId`
- `GET /api/documents`

Edge cases:
- `422 DOCUMENT_NOT_LECTURE`.
- `409 ALREADY_PROCESSING` with `Retry-After`.
- While processing: `GET /api/quiz/:id` returning `404` must be treated as "not ready yet".
- Failed docs with `error_code=GENERATION_FAILED` should show a clear "try again later/retry" UX.

Acceptance criteria:
- UI uses `quiz_status` from `/api/documents` as source of truth.
- `404` from `/api/quiz/:id` is non-fatal while status is `processing`.
- Retry CTA appears only when `quiz_status=failed`.

Test checklist:
- Lecture document quiz generation success path.
- Non-lecture document shows guard UX (`DOCUMENT_NOT_LECTURE`).
- Failed -> retry flow works.

---

## FE-INT-007 — Unified Error UX + Flow-Specific CTAs
Priority: P1

Objective:
- Normalize API error rendering and action mapping.

Scope:
- Central error-code mapping layer.
- Surface recoverable actions based on endpoint + code.

Endpoints:
- All frontend-consumed API endpoints

Edge cases:
- `409 ALREADY_PROCESSING` with `Retry-After`.
- `429 RATE_LIMITED`.
- `422 DOCUMENT_UNSUPPORTED` and `422 DOCUMENT_NOT_LECTURE` with flow-specific CTAs.

Acceptance criteria:
- Errors render consistent title/body/action style.
- `DOCUMENT_UNSUPPORTED` CTA points user to supported document guidance.
- `DOCUMENT_NOT_LECTURE` CTA guides user to study-guide-only path.

Test checklist:
- Simulate representative `4xx/5xx` responses and verify CTA mapping.
- Verify fallback UX for unknown error codes.

---

## FE-INT-008 — Checklist + Delete Endpoints Parity
Priority: P1

Objective:
- Complete remaining product flows with backend parity.

Scope:
- Checklist item completion.
- Single-document delete.
- Delete all user data.

Endpoints:
- `PATCH /api/checklist/:documentId`
- `DELETE /api/documents/:documentId`
- `DELETE /api/user/data`

Edge cases:
- Checklist item missing (`404`).
- Ownership/authorization failures (`401/403`).
- Checklist request body must be `{ item_id, completed }`.

Acceptance criteria:
- Successful actions update UI state without stale entries.
- Failure states show clear and non-destructive messaging.

Test checklist:
- Toggle checklist item and verify persistence.
- Delete one document and confirm list refresh.
- Delete all data and verify empty state.

---

## FE-INT-009 — Focus Mode Contract Alignment
Priority: P1

Objective:
- Align product behavior/docs with integration contract for Focus Mode.

Scope:
- Treat Focus Mode strictly as frontend presentation over `sections`.
- Remove/clarify any conflicting lecture-only wording in product-facing docs.

Endpoints:
- `GET /api/study-guide/:documentId`

Edge cases:
- Documents with sparse sections.

Acceptance criteria:
- Focus Mode does not depend on separate backend flag/endpoint.
- Docs no longer conflict on Focus Mode scope.

Test checklist:
- Focus Mode renders for any study guide with sections.
- UX degrades gracefully if sections are empty.

---

## FE-INT-010 — Integration QA Matrix + Handoff Signoff
Priority: P2

Objective:
- Produce a repeatable verification checklist before frontend release.

Scope:
- End-to-end verification for auth, upload, generation, retry, checklist, delete, and error paths.

Endpoints:
- Full surface used by frontend

Edge cases:
- Intermittent processing conflicts.
- Rate limits during polling.
- Session expiry during generation polling.

Acceptance criteria:
- QA matrix completed with pass/fail evidence for each scenario.
- Handoff signoff includes known limitations and deferred items.

Test checklist:
- Consolidate FE-INT-001 through FE-INT-009 into one runbook with pass/fail evidence.

---

## FE-INT-011 — Optional Health Check Integration
Priority: P2

Objective:
- Use backend health endpoint for startup/connectivity indicator.

Scope:
- Add lightweight connectivity check using health endpoint.
- Keep this non-blocking for main app flows.

Endpoints:
- `GET /health`

Edge cases:
- Health unavailable while app routes are still cached/open.

Acceptance criteria:
- Frontend can display backend reachable/unreachable indicator without blocking auth flows.

Test checklist:
- Healthy backend returns `{ "status": "ok" }`.
- Network failure shows non-blocking degraded-state indicator.
