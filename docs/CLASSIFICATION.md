# LearnEase — Document Classification (Two-Stage)

Document type classification uses two stages:

- Stage 1: deterministic local detection at upload time
- Stage 2: LLM pre-classification immediately before study-guide generation

Supported output values:

- HOMEWORK
- LECTURE
- UNSUPPORTED

Syllabi and other out-of-scope academic/admin documents are classified as `UNSUPPORTED`.

---

## 1) Inputs

The classification pipeline evaluates:

- extracted_text (normalized)
- original_filename
- file_type (PDF | DOCX)

---

## 2) Stage 1 — Local Detection (Upload Time)

The upload-time classifier is deterministic and runs without an OpenAI call.
Its purpose is to provide fast metadata and early rejection of clearly unsupported
documents.

Implementation notes:

- It uses weighted heuristics and priority rules from `backend/src/services/documentDetector.ts`.
- It distinguishes supported study-material documents (`HOMEWORK`, `LECTURE`) from out-of-scope documents (`UNSUPPORTED`).
- It is intentionally conservative and does not generate content.

This local result is useful for upload-time UX, but it is **not** the final
generation safety gate.

---

## 3) Stage 2 — LLM Pre-Classifier (Generation Time)

Immediately before study-guide generation, the backend runs a lightweight LLM
classification call on a truncated portion of the extracted text.

Current behavior:

- model: `gpt-4o-mini`
- input: approximately the first 2000 characters
- `max_tokens: 10`
- `temperature: 0`

The LLM classifies the document by **primary purpose**, not incidental keywords.

- If the LLM returns `HOMEWORK` or `LECTURE`, study-guide generation may proceed.
- If the LLM returns `UNSUPPORTED`, generation is blocked and the document is marked failed with `DOCUMENT_UNSUPPORTED`.
- If the LLM call fails or returns an unexpected value, generation **fails closed**.
- The backend does **not** fall back to the local classifier for final generation gating.
- Local and LLM outcomes are logged for disagreement tracking.

The LLM pre-classifier runs only inside explicit user-triggered study-guide
create/retry flows. It does not run at upload time and it does not run on page load.

---

## 4) Classification Intent

The classifier is intended to support:

- HOMEWORK documents
- LECTURE documents, including class notes and course notes

Examples of `UNSUPPORTED` documents include:

- syllabi and course schedules
- project reports, research papers, and lab reports
- resumes, portfolios, and transcripts
- administrative, transactional, insurance, or review forms
