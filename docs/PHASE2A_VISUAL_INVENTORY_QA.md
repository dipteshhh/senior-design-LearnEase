# Phase 2A — Visual Inventory QA & Implementation Guardrails

**Status:** QA/spec guard document — no implementation in this branch  
**Branch:** `diptesh/phase2a-visual-inventory-qa-notes`  
**Parent plan:** `docs/PHASE2_VISUAL_INVENTORY_PLAN.md` (Phase 2 overall design)  
**Phase 2A scope:** Backend plumbing + **DOCX embedded raster images only**

---

## 1. Scope Confirmation

Phase 2A is **inventory plumbing**, not product surfacing. Confirm every implementation PR stays within these boundaries.

| In scope (Phase 2A) | Out of scope (defer) |
|---------------------|----------------------|
| Extract embedded **raster** images from DOCX (`word/media/*`: png, jpg, jpeg, gif, webp) | OpenAI vision or any image interpretation |
| Best-effort sidecar during upload (after text extraction succeeds) | UI display of images in Study Brief or elsewhere |
| Encrypted manifest + encrypted image blobs on disk | StudyGuide / Quiz JSON schema changes |
| Single `VISUAL_INVENTORY` artifact row (manifest path in SQLite) | Citation model or `docs/SCHEMAS.md` changes |
| Caps, timeouts, partial/skipped manifest states | Public API fields or new authenticated image endpoints |
| Unit/integration tests for inventory behavior | PDF embedded-image extraction (may no-op or skip) |
| DB migration: extend `document_artifacts.artifact_type` CHECK | EMF/WMF conversion, page rendering, paragraph↔image association |

### Hard rules (must not regress)

1. **Upload must remain successful** when text extraction passes, even if visual inventory fails, times out, or is skipped.
2. **Study guide generation remains text-only** — no LLM inputs from images.
3. **No frontend behavior changes** — no new UI, no contract changes in `frontend/src/lib/contracts.ts`.
4. **No Phase 1 Study Brief edits** — do not touch `frontend/src/app/(app)/documents/[id]/page.tsx`.
5. **Academic integrity unchanged** — no changes to `docs/AI_contract.md`, guardrails, or answer-leak validation semantics.

### Expected PDF behavior in Phase 2A

PDF visual extraction is **deferred**. Acceptable Phase 2A behaviors for PDF uploads:

- Inventory sidecar returns `extraction.status: skipped` with reason `pdf_deferred`, **or**
- Sidecar not invoked for PDF at all

Upload, text extraction, study guide, and quiz flows for PDF must behave exactly as on `origin/main`.

---

## 2. Test Documents Needed

Prepare small fixtures locally (preferably also committed under `backend/src/tests/fixtures/visual/` during implementation). Keep each file **under 100 KB** where possible except the oversized case.

| ID | Fixture | Purpose |
|----|---------|---------|
| **DOCX-1** | DOCX with **one PNG** in body | Happy path: one asset in manifest |
| **DOCX-2** | DOCX with **multiple** PNG/JPEG images | Ordering, asset IDs, cap headroom |
| **DOCX-3** | DOCX with **unsupported media** (e.g. EMF/WMF in `word/media/`) | Verify skip without upload failure |
| **DOCX-4** | DOCX with **one oversized raster** (above per-image byte or dimension cap) | Verify `partial` or asset skip; upload still succeeds |
| **DOCX-5** | DOCX with **no images** (text only) | Manifest `assets: []`, status `complete` |
| **PDF-1** | PDF with embedded PNG (optional) | Confirm **no-op/skipped** inventory in Phase 2A; upload + study guide unchanged |

### Fixture labeling convention (recommended)

```
docx-one-png.docx
docx-multi-images.docx
docx-unsupported-emf.docx
docx-oversized-image.docx
docx-no-images.docx
pdf-embedded-png.pdf   # regression / deferral check only
```

Record for each fixture: filename, approximate size, expected asset count, expected manifest `extraction.status`.

---

## 3. Manual Test Checklist

Run against a local or staging backend with `ARTIFACTS_DIR` visible to the tester.

### Upload & inventory

- [ ] Upload **DOCX-1** → HTTP 201 (or 200 if duplicate), `document_id` returned, no new user-facing error fields
- [ ] Upload **DOCX-5** → upload succeeds; inventory manifest exists or is safely absent with `complete`/empty assets
- [ ] Upload **DOCX-4** → upload succeeds; manifest reflects cap/skip (`partial` or omitted asset), not upload failure
- [ ] Upload **DOCX-3** → upload succeeds; unsupported media skipped, text extraction unchanged
- [ ] Upload **PDF-1** (if used) → upload succeeds; inventory skipped/no-op; no new API fields

### Study guide & UI

- [ ] After DOCX-1 upload, trigger study guide create → reaches `ready`; content unchanged in shape vs baseline
- [ ] Study Brief / document page UI → **no new image UI**, no new tabs, no contract errors in browser console
- [ ] Quiz flow (lecture doc if available) → unchanged

### Artifacts on disk (dev/staging only)

- [ ] Under `{ARTIFACTS_DIR}/{document_id}/`: `original.docx`, `extracted.txt` still present
- [ ] If inventory ran: `visual-inventory.json` (encrypted) and `visuals/{uuid}.*` blobs present for DOCX-1
- [ ] SQLite `document_artifacts` includes `VISUAL_INVENTORY` row for DOCX with successful inventory (when applicable)

### Deletion

- [ ] Delete document via app/API → document row removed
- [ ] `{ARTIFACTS_DIR}/{document_id}/` directory removed (including `visuals/` if created)
- [ ] No orphaned `visuals/*` files left on disk

### Failure / skip resilience

- [ ] Simulate inventory failure (e.g. temporarily break extractor or lower timeout in dev) → upload still returns success when text extraction OK
- [ ] Confirm server logs warning internally without surfacing image bytes to client

---

## 4. Security & Privacy Checks

| Check | Pass criteria |
|-------|----------------|
| **No raw image bytes in SQLite** | Only paths/metadata in `document_artifacts`; no BLOB columns for images |
| **Encrypted artifact storage** | Manifest and image files use LearnEase AES-256-GCM envelope (`backend/src/lib/encryption.ts`) |
| **No OpenAI calls** | No new OpenAI client usage in upload/inventory code paths; grep for vision/image model IDs |
| **No image content in API** | `POST /api/upload`, `GET /api/documents/:id`, `GET /api/study-guide/:id` responses unchanged vs `origin/main` (no base64, URLs, or asset lists) |
| **Logs** | Log asset **counts**, byte sizes, duration, status codes — never base64, hex dumps, or decrypted paths in production logs |
| **Auth** | No new unauthenticated routes to read visual blobs |
| **Privacy policy** | No required Phase 2A frontend privacy copy change (backend-only storage); note for Phase 3 when UI exposes images |

---

## 5. Regression Checks

Verify against `origin/main` baseline behavior:

| Area | What to verify |
|------|----------------|
| **PDF upload** | Same status codes, text extraction, `page_count`, dedupe |
| **DOCX text extraction** | `extracted.txt` content and `paragraph_count` unchanged in quality |
| **Duplicate upload** | Same `reused_existing: true` behavior and message; clarify whether inventory re-runs (implementation decision — must not break reuse) |
| **Document deletion** | `deleteDocumentById` / user purge still removes artifacts + directory |
| **30-day retention** | Retention job still deletes expired documents and artifact directories (no new leak paths) |
| **StudyGuide generation** | Text-only LLM path; schema validation unchanged |
| **Quiz generation** | Lecture-only, unchanged |
| **Processing page / dashboard** | No new required fields from API |

### Automated regression gate

```bash
cd backend && npm test
cd frontend && npm run lint && npm test
```

All existing tests must pass without frontend contract updates.

---

## 6. Acceptance Criteria

Phase 2A is **done** when all of the following hold:

### Functional

- [ ] DOCX with embedded raster images produces a **`VISUAL_INVENTORY`** manifest artifact and encrypted `visuals/*` blobs
- [ ] DOCX with no images produces a valid manifest with `assets: []` (or documented skip) without failing upload
- [ ] **`complete`**, **`partial`**, and **`skipped`** manifest states are handled safely and do not fail upload
- [ ] PDF uploads behave as today; inventory is skipped or no-op with no user impact
- [ ] Document deletion removes visual files (via directory cleanup and/or registered paths)

### Non-functional

- [ ] Caps enforced: max assets, max total bytes, max dimensions, sidecar timeout (see Phase 2 plan defaults)
- [ ] **Best-effort:** inventory exceptions caught; upload path never fails solely due to inventory
- [ ] **All backend tests pass**, including new visual inventory tests
- [ ] **No frontend behavior changes** — manual UI checklist passes
- [ ] **No API/schema/StudyGuide/citation changes** in public contracts

### Documentation (implementation PR)

- [ ] `docs/DB_SCHEMA.md` (+ mirrors) updated for `VISUAL_INVENTORY` artifact type
- [ ] `docs/SYSTEM_ARCHITECTURE.md` upload diagram updated (optional but recommended)

---

## 7. Review Checklist for Codex Implementation

Use this as a PR review gate before merge.

### Must have

- [ ] **File caps present** — per-image size, dimensions, count, total bytes, sidecar timeout
- [ ] **Best-effort behavior** — `try/catch` around inventory; upload success independent of inventory outcome
- [ ] **Artifact cleanup** — visual files live under `{ARTIFACTS_DIR}/{document_id}/`; deletion uses existing directory wipe
- [ ] **Encryption** — `writeEncryptedBuffer` for manifest and images; no plaintext blobs on disk
- [ ] **DOCX-only extraction** — rasters from `word/media/*`; unsupported formats skipped gracefully
- [ ] **Tests** — fixtures for DOCX-1, DOCX-5, cap case, upload success on inventory failure

### Must not have

- [ ] **No API changes** — no new endpoints, no new JSON fields on existing responses
- [ ] **No schema changes** — `docs/SCHEMAS.md`, StudyGuide, Citation, Quiz shapes untouched
- [ ] **No frontend changes** — especially not `frontend/src/app/(app)/documents/[id]/page.tsx`
- [ ] **No OpenAI usage** — no vision models, no image bytes sent to OpenAI
- [ ] **No interpretation** — manifest contains location/metadata only, no captions or labels from models
- [ ] **No homework/lecture UI gating changes** — Phase 2A is backend-only

### Double-check items (common failure modes)

- [ ] Inventory runs **after** text extraction succeeds, **before or during** persist — not inside study-guide job
- [ ] Duplicate upload (`reused_existing: true`) does not corrupt or duplicate orphan `visuals/` dirs
- [ ] `document_artifacts` UNIQUE constraint respected — one `VISUAL_INVENTORY` row per document
- [ ] Manifest JSON validated internally before write; corrupt manifest does not crash upload
- [ ] EMF/WMF stored or skipped consistently with documented behavior (prefer skip in 2A)
- [ ] No synchronous unbounded work on upload thread (timeout always enforced)

---

## Appendix — Suggested manifest signals (internal QA)

When inspecting encrypted manifest in dev (decrypt locally only):

```json
{
  "extraction": {
    "status": "complete | partial | skipped",
    "error_code": null,
    "error_message": null
  },
  "assets": [ "..." ]
}
```

| Status | Expected upload HTTP | Notes |
|--------|------------------------|-------|
| `complete` | 201/200 | All eligible assets extracted (including zero-image DOCX) |
| `partial` | 201/200 | Some assets skipped due to caps or corrupt entries |
| `skipped` | 201/200 | PDF deferral, non-DOCX, or feature flag off |

---

*End of Phase 2A Visual Inventory QA*
