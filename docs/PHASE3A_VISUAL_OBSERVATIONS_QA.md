# Phase 3A — Lecture-only Visual Observations Beta: QA & Review Checklist

**Status:** QA/spec guard document — **no implementation in this branch**
**Branch:** `diptesh/phase3a-visual-observations-qa`
**Builds on:**

- Phase 2A — DOCX embedded raster `VISUAL_INVENTORY` (encrypted manifest + encrypted image blobs)
- Phase 2B — read-only visual inventory inspection tooling
- Phase 1 / 1B — source-grounded Study Brief + narration MVP

**Phase 3A scope (one-line):** Generate **text-only visual observations** for **lecture/class documents only**, on demand after the Study Guide trigger, using the already-extracted encrypted visual inventory — never at upload time, never for homework, never returning image bytes.

> This file is a review gate. Use it to verify any Phase 3A implementation PR before merge. It must not change implementation, backend, or frontend source.

---

## 0. Terminology

- **Visual inventory** — Phase 2A artifact: encrypted manifest (`VISUAL_INVENTORY`) + encrypted image blobs under `{ARTIFACTS_DIR}/{document_id}/visuals/*`.
- **Visual observations** — Phase 3A artifact (proposed `VISUAL_OBSERVATIONS`): encrypted, text-only, model-produced descriptions of lecture figures, with confidence + limitations. **Metadata/text only — never image bytes.**
- **Visual Notes (Beta)** — the frontend surface that displays visual observations, clearly labeled beta.

---

## 1. Scope guardrails

| # | Guardrail | Pass criteria |
|---|-----------|---------------|
| 1.1 | **Lecture/class only** | Visual observations are generated/persisted only when `document_type === "LECTURE"` (or class-notes equivalent). `HOMEWORK` and `UNSUPPORTED` never produce observations. |
| 1.2 | **No homework visual interpretation** | No code path sends homework images to any model; verified by type gate + test. |
| 1.3 | **No vision calls during upload** | Upload handler does **not** call any vision model. Upload still only does text extraction + Phase 2A inventory (no-op for non-DOCX). Grep upload path for vision/model usage → none. |
| 1.4 | **On-trigger only** | Observations are generated only as part of the **explicit Study Guide creation trigger** (the existing authenticated generate flow), never speculatively, never on GET. |
| 1.5 | **No image previews** | Neither backend nor frontend exposes or renders image bytes. No `<img>` of inventory assets, no signed URLs, no thumbnails. |
| 1.6 | **No raw image bytes in API responses** | No endpoint returns base64/binary/data-URI image content. |
| 1.7 | **No StudyGuide text schema weakening** | The StudyGuide text schema is unchanged; visual observations are a **separate** artifact/response, not folded into StudyGuide text fields. Required fields stay required; no field becomes optional to accommodate visuals. |
| 1.8 | **No citation validation loosening** | Quote/citation validation (answer-leak guard, source grounding) is byte-for-byte unchanged. Visual observations are **not** treated as citations and never enter citation validation as evidence. |

---

## 2. Backend behavior

| # | Check | Pass criteria |
|---|-------|---------------|
| 2.1 | **Loads inventory safely** | Uses Phase 2B read pattern (`getVisualInventoryManifest`); missing/corrupt/undecryptable manifest → skip gracefully, never throw into the generate flow. |
| 2.2 | **Image count cap** | A hard cap on number of images sent to the model (e.g. small N), enforced before any model call; documented default. Caps are meaningful and tested. |
| 2.3 | **Decrypt in memory only** | Image bytes are decrypted with the existing encryption helper into memory only; **never** written decrypted to disk, temp files, or logs. |
| 2.4 | **Structured output** | Model call uses structured/JSON output (schema-constrained), not free-form text parsing. |
| 2.5 | **Validates model response** | Response is validated against a strict schema before persistence; malformed/extra/missing fields are rejected. |
| 2.6 | **Encrypted persistence** | Observations stored as an encrypted artifact (proposed `VISUAL_OBSERVATIONS`) via existing encrypted-artifact write path; SQLite stores only path + hash + metadata (no bytes). |
| 2.7 | **Failure isolation** | If visual observation generation fails/times out/skips, **normal StudyGuide creation still succeeds** (best-effort sidecar, wrapped in try/catch, mirrors Phase 2A inventory isolation). |
| 2.8 | **No raw image bytes in logs** | Logs contain counts/sizes/status/error codes only — never base64, hex, decrypted bytes, or the encryption key. |
| 2.9 | **Idempotency / dedupe** | Re-running generate for the same document does not create duplicate `VISUAL_OBSERVATIONS` rows (respect `UNIQUE(document_id, artifact_type)` if reused). |
| 2.10 | **Deletion cleanup** | Observations artifact is removed by existing document/user deletion + retention cleanup (directory wipe + registered path). No orphaned artifacts. |
| 2.11 | **No schema migration risk** | If `VISUAL_OBSERVATIONS` is added to the `document_artifacts` CHECK, the migration is transactional and idempotent (follow the Phase 2A hardened migration pattern). No other DB changes. |

---

## 3. Prompt safety (academic integrity)

| # | Check | Pass criteria |
|---|-------|---------------|
| 3.1 | **No homework answers** | Prompt + type gate guarantee no answers are ever produced (lecture-only, and even then only descriptive). |
| 3.2 | **No solution steps** | Observations never include step-by-step solutions to problems shown in figures. |
| 3.3 | **No hints** | No problem-solving hints or strategy nudges. |
| 3.4 | **No unsupported inference** | Describe only what is visibly present; no guessing beyond the image; no fabricated labels/values. |
| 3.5 | **Visible text only if clearly readable** | Transcribe in-image text only when clearly legible; otherwise mark as unclear rather than guessing. |
| 3.6 | **Limitations required when uncertain** | The structured output requires a `limitations`/uncertainty field; low-confidence items must populate it. Confidence is captured per observation. |
| 3.7 | **Prompt is reviewable** | The system/instruction prompt is committed and matches these rules; integrity rules (`docs/AI_contract.md` and guardrails) are not weakened. |

---

## 4. API behavior

| # | Check | Pass criteria |
|---|-------|---------------|
| 4.1 | **Authenticated only** | Any route exposing observations requires authentication (same middleware as existing document routes). |
| 4.2 | **Owner-only access** | Returns observations only for documents owned by the requesting user (use existing ownership check, e.g. `getDocumentOwnerId`); cross-user access → 403/404. |
| 4.3 | **Metadata/text only** | Response contains observation text, confidence, limitations, and minimal references (e.g. image index) — **no** image bytes, base64, hex, data-URIs, or file paths to decrypted content. |
| 4.4 | **No decrypted content leak** | No field carries decrypted image bytes; no debug field bypasses this. |
| 4.5 | **Empty/skipped behavior** | Lecture with no inventory, or homework, or generation-skipped → well-defined empty/absent response (not an error, no partial garbage). Status clearly distinguishes "none" vs "not applicable" vs "failed". |
| 4.6 | **No contract weakening** | Existing API response shapes (upload, document detail, study guide, quiz, citations) are unchanged. Observations are additive and isolated. |

---

## 5. Frontend behavior

| # | Check | Pass criteria |
|---|-------|---------------|
| 5.1 | **Conditional render** | "Visual Notes (Beta)" appears **only** when observations exist for the document; otherwise the UI is unchanged. |
| 5.2 | **Beta warning** | A clear beta/caveat label is shown (AI-generated, may be imperfect, lecture-only). |
| 5.3 | **Confidence + limitations visible** | Per-observation confidence and limitations are surfaced, not hidden. |
| 5.4 | **No mixing with exact-text citations** | Visual observations are visually + semantically separated from the Evidence Drawer / exact-quote citations. Observations are never presented as verbatim source citations. |
| 5.5 | **No image previews** | No image rendering of inventory assets anywhere. |
| 5.6 | **No regressions** | Study Brief, Evidence Drawer, Narration MVP, Checklist, Sections, and Quiz all continue to work unchanged. |
| 5.7 | **Accessibility** | Beta section is keyboard-navigable, labeled, and does not break existing tab/landmark structure. |

---

## 6. Tests needed

| # | Test | Expectation |
|---|------|-------------|
| 6.1 | Lecture DOCX with image inventory | Observations generated, validated, persisted encrypted; metadata-only. |
| 6.2 | Homework DOCX with image inventory | **Skipped** — no model call, no observations artifact. |
| 6.3 | Lecture with no inventory | Skipped cleanly; StudyGuide unaffected; empty/absent observations. |
| 6.4 | Model failure / timeout | StudyGuide creation still succeeds; no observations artifact (or marked failed); no throw into main flow. |
| 6.5 | Malformed model output | Rejected by schema validation; not persisted; logged with sanitized error. |
| 6.6 | API ownership | Non-owner request denied; owner request returns metadata-only. |
| 6.7 | No raw bytes in response | Assert response contains no base64/hex/data-URI of any asset's bytes. |
| 6.8 | No raw bytes in logs | Assert log output never contains base64/hex/decrypted bytes/key. |
| 6.9 | Image cap enforced | With more images than the cap, only up to N are sent; behavior deterministic. |
| 6.10 | Dedupe / idempotency | Re-trigger does not duplicate the observations artifact. |
| 6.11 | Deletion cleanup | Deleting the document removes the observations artifact + blobs path. |
| 6.12 | Migration safety (if CHECK changes) | Existing DB migrates atomically + idempotently; existing rows preserved. |
| 6.13 | Frontend render smoke test (if a pattern exists) | Visual Notes Beta renders only when observations present; pure formatting/util covered by `node --test` (frontend has no React-render harness today, so prefer testing a pure builder/selector). |

---

## 7. Manual QA plan

1. Upload a **lecture DOCX with an image**; trigger Study Guide creation.
2. Confirm **Visual Notes (Beta)** appears with beta warning, confidence, and limitations.
3. Upload a **homework DOCX with an image**; trigger generation.
4. Confirm **no visual interpretation** appears for homework.
5. Confirm **normal StudyGuide still succeeds** in both cases (including if observations fail/skip — temporarily force a failure in dev to verify isolation).
6. Confirm **narration ignores Visual Notes** unless/until explicitly added in a later phase (Phase 1B narration text must be unchanged).
7. Confirm **no images are displayed** anywhere (no previews/thumbnails/URLs).
8. Inspect the API response (network tab / curl) and confirm **no image bytes** (no base64/hex/data-URI), authenticated + owner-only.
9. Inspect dev logs and confirm **no raw bytes / base64 / key** are logged.
10. Delete the lecture document and confirm the observations artifact + blobs are cleaned up.
11. Regression pass: Study Brief, Evidence Drawer, Narration, Checklist, Sections, Quiz all still work.

---

## 8. Acceptance criteria

Phase 3A is acceptable to merge when **all** hold:

- ✅ **Safe lecture-only visual observations** — generated only for lecture/class docs, on explicit trigger, text-only with confidence + limitations.
- ✅ **No homework interpretation** — type-gated and tested.
- ✅ **No upload-time vision** — no model calls in the upload path.
- ✅ **No raw byte exposure** — no image bytes/base64/hex in API responses, logs, or frontend; decrypt in memory only; no export/preview.
- ✅ **Text StudyGuide validation unchanged** — StudyGuide text schema + citation/quote validation untouched and not loosened.
- ✅ **Existing app behavior unchanged** — upload, StudyGuide, citations, Evidence Drawer, narration, checklist, sections, quiz, deletion, retention all unchanged; observations are additive and isolated.
- ✅ **Failure-isolated + observable** — observation failure never breaks StudyGuide creation; encrypted persistence is inspectable via Phase 2B-style tooling without leaking bytes.

---

## Biggest risks for the implementer to double-check

1. **Failure isolation:** the single most important behavior — a vision/model/validation failure must never fail or roll back normal StudyGuide creation. Wrap as a best-effort sidecar like Phase 2A inventory.
2. **Homework leakage path:** ensure the lecture-only gate is enforced at the generation boundary (not just the UI), so homework images are never decrypted or sent to a model.
3. **Byte exposure surfaces:** audit every new field (API + logs + any debug output) for accidental base64/hex/decrypted content; keep decrypt strictly in memory; no temp files; no preview/export.
4. **Schema/contract isolation:** keep visual observations a separate artifact + response; do not add fields to or relax the StudyGuide text schema or citation validation.
5. **Migration safety:** if `VISUAL_OBSERVATIONS` is added to the `document_artifacts` CHECK, reuse the Phase 2A hardened **transactional + idempotent** migration so existing DBs are safe.
6. **Prompt integrity:** structured output must forbid answers/solutions/hints and require limitations on uncertainty; review the committed prompt against `docs/AI_contract.md`.
7. **Cleanup + dedupe:** ensure deletion/retention removes the new artifact and that re-triggering generation does not duplicate it.

*End of Phase 3A Visual Observations QA.*
