# Frontend Integration QA Matrix

Purpose: repeatable integration signoff for frontend against backend contract docs.

Canonical contract docs:
- `docs/API.md`
- `docs/AUTH.md`
- `docs/API_ERRORS.md`
- `docs/SCHEMAS.md`

## Environment

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Required frontend env:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- Required backend env:
  - `GOOGLE_CLIENT_ID`
  - `SESSION_SECRET`
  - `CORS_ORIGINS`

## Test Matrix

| ID | Area | Scenario | Expected |
|---|---|---|---|
| QA-001 | Canonical docs | Introduce `frontend/docs/` reference inside `frontend/src/*` | `npm run check:contracts` fails |
| QA-002 | Auth | Signed-out user opens `/dashboard` | Redirected to `/signin?returnTo=...` |
| QA-003 | Auth | Successful Google sign-in | Backend cookie set; redirected to `returnTo` |
| QA-004 | Auth | Session restore on reload | `/api/auth/me` returns user; protected page remains accessible |
| QA-005 | Auth | Expired/missing session mid-use | Global `401` handler redirects to sign-in |
| QA-006 | Upload | Upload valid PDF | `POST /api/upload` returns `201`, routes to processing page |
| QA-007 | Upload | Upload valid DOCX | `POST /api/upload` returns `201`, routes to processing page |
| QA-008 | Upload | Try PPT/PPTX | Blocked client-side with supported-type message |
| QA-009 | Upload | Oversized file >50MB | Friendly `FILE_TOO_LARGE` UX |
| QA-010 | Study guide | Create and poll happy path | `study_guide_status`: `processing -> ready`, detail page loads |
| QA-011 | Study guide | Failed generation then retry | Retry triggers new processing; eventual ready or user-safe failure |
| QA-012 | Quiz | Lecture document quiz flow | `quiz_status`: `processing -> ready`, quiz renders |
| QA-013 | Quiz | Non-lecture quiz attempt | `DOCUMENT_NOT_LECTURE` UX shown; no crash |
| QA-014 | Checklist | Toggle checklist item | `PATCH /api/checklist/:id` called with `{ item_id, completed }`; UI updates |
| QA-015 | Delete doc | Delete from document page | `DELETE /api/documents/:id` succeeds, returns to dashboard |
| QA-016 | Delete all | Delete all from settings | `DELETE /api/user/data` succeeds; dashboard empty state |
| QA-017 | Conflicts | `409 ALREADY_PROCESSING` | UI message includes retry wait guidance from `Retry-After` |
| QA-018 | Rate limit | `429 RATE_LIMITED` during polling | Backoff/retry message shown |
| QA-019 | Focus mode | Open Focus Mode on sections | Single-section navigation works regardless of document type |
| QA-020 | Health | Backend unavailable | Topbar health indicator flips to offline |

## Signoff Record

| Date | Tester | Branch/Commit | Result | Notes |
|---|---|---|---|---|
| 2026-02-19 | Codex audit | main (working tree) | PASS (automated gate) | `npm --prefix frontend run check:contracts` and `npm --prefix frontend run lint` passed after fixing returnTo sanitization, Retry-After handling, quiz transient-404 polling, and option-A selection bug. |
