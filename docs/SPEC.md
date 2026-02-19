# LearnEase — System Specification (Source of Truth)

This document defines the authoritative behavior of LearnEase.

If anything is ambiguous, follow:
1) `docs/AI_contract.md` (LLM rules)
2) `docs/SCHEMAS.md` (output shapes)
3) `docs/VALIDATION.md` (backend enforcement)
4) `docs/API.md` + `docs/API_ERRORS.md` (endpoint contract)
5) `docs/DB_SCHEMA.md` (`docs/SCHEMA.md` mirror) (database + retention)

---

## 1) Non‑Negotiable Academic Integrity Boundary

### 1.1 Prohibited Outputs (MUST NEVER HAPPEN)
- Homework answers
- Solution steps
- Hints that solve or substantially complete graded work
- “Reasoning” explanations that effectively provide the solution
- Inferred tasks/requirements not explicitly present in the document text

### 1.2 Allowed Outputs (ONLY THESE)
- Extraction of explicitly stated requirements, dates, policies, and tasks
- Restructuring for readability (headings, bulleting, grouping)
- Traceability via quotes + citations

### 1.3 Enforcement Layers (ALL REQUIRED)
- Prompt-level guardrails
- Backend validation (schemas + quote/citation checks)
- UI feature gating (no solver flows)

---

## 2) Supported Document Types

Document types:
- HOMEWORK
- LECTURE
- SYLLABUS
- UNSUPPORTED

Classification is local (no OpenAI) and deterministic.
Classification uses first-match-wins heuristics as defined in `docs/CLASSIFICATION.md`.
See `docs/CLASSIFICATION.md`.

---

## 3) Feature Gating Matrix (Hard Rules)

| Feature | HOMEWORK | LECTURE | SYLLABUS | UNSUPPORTED |
|---|---:|---:|---:|---:|
| Study Guide | ✅ Allowed (no solving) | ✅ Allowed | ✅ Allowed | ❌ |
| Quiz (Test Your Knowledge) | ❌ | ✅ Allowed | ❌ | ❌ |
| Checklist Completion | ✅ | ✅ | ✅ | ❌ |

Additional rules:
- Quiz is lecture-only, user-triggered only (see `docs/SCHEMAS.md` + `docs/AI_contract.md`)
- UNSUPPORTED returns a clear error with no partial processing

---

## 4) Definition of “Explicitly Stated”

A statement is “explicitly stated” only if it appears verbatim in the extracted document text.

- No inference
- No guessing
- No filling gaps
- No “common-sense additions”

---

## 5) Citation Model

Citation = location pointer + excerpt.

See `docs/SCHEMAS.md` for exact shapes.

---

## 6) OpenAI Usage Rules

### 6.1 No Automatic Calls
OpenAI calls may occur ONLY when the user explicitly triggers:
- Create Study Guide
- Test Your Knowledge (Quiz)

In-process async continuation after a user-triggered `POST /create` or `POST /retry` is allowed.
For example, returning `202` and continuing generation in the same running API process is valid.
No autonomous/background schedulers are allowed for generation (no cron, queue workers, daemons, or page-load-triggered generation).
No calls on page load.
`202` responses represent user-triggered processing start, not autonomous cron/queue execution.

### 6.2 Single‑Generation Rule
- One Study Guide generation per document.
- One Quiz generation per document (lecture-only).
- Cached JSON is read-only.
- Regeneration is allowed ONLY via explicit retry endpoints after a failure:
  - `POST /api/study-guide/retry`
  - `POST /api/quiz/retry`

See `docs/API_ERRORS.md` for idempotency rules.

---

## 7) End‑to‑End Flow

### 7.1 Upload
1. Upload PDF/DOCX
2. Store encrypted original file on disk
3. Store metadata in SQLite
4. Extract text locally
5. Store extracted+normalized text encrypted on disk (for validation)
6. Classify document type locally

### 7.2 Study Guide
1. User clicks Create Study Guide
2. Document status → processing
3. Call OpenAI once
4. Validate output schema (`docs/SCHEMAS.md`)
5. Validate quotes/citations against extracted text (`docs/VALIDATION.md`)
6. Cache Study Guide JSON in DB
7. Document status → ready

### 7.3 Quiz (Lecture Only)
Same as Study Guide, but:
- Document_type must be LECTURE
- Output must follow Quiz schema

---

## 8) Retention & Deletion

- Documents, Study Guides, Quizzes, and ChecklistItems auto-deleted after 30 days
- User may delete all data immediately via API
- Deletion removes DB rows AND encrypted artifacts on disk

---

## 9) No Undocumented Behavior

Backend MUST NOT:
- create extra endpoints beyond `docs/API.md`
- add background OpenAI generation jobs
- store raw files in SQLite
- loosen quote/citation validation rules
