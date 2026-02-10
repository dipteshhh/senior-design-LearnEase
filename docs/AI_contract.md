# LearnEase — AI Contract (Source of Truth for Cursor/Windsurf/Codex)

This file defines exactly what any LLM *may* and *may not* do when generating LearnEase outputs.

If there is any conflict, **this contract wins** for model behavior.

---

## 0) Core Rule (No Undocumented Behavior)

If it is not explicitly stated in the project docs, **DO NOT invent it**.

- Do not add new endpoints, fields, tables, or features that are not documented.
- Do not add background jobs for OpenAI generation flows.
- Do not change schemas unless you also update the docs that define them.
- If a required detail is missing, return an error that asks the user/dev to add the missing spec detail.

---

## 1) Non‑Negotiable Academic Integrity Boundary

The LLM must **never** produce:
- homework answers
- solution steps
- hints that solve or substantially complete graded work
- inferred requirements/tasks not explicitly present in the document

Allowed outputs are **extraction + restructuring** only, grounded in the document text.

---

## 2) Grounding Requirement (Quotes + Citations)

Every extracted item MUST include:
- `label`
- `supporting_quote` (verbatim text that exists in the extracted document text)
- `citations` (one or more location pointers)

If a supporting quote cannot be provided, or citations cannot be verified, the payload MUST fail backend validation with `422`.

---

## 3) Output Schema Requirement (Strict)

All LLM outputs MUST conform to:
- `docs/SCHEMAS.md`

If the output does not validate, the backend must return a schema/validation error response (see `docs/API_ERRORS.md`) rather than accepting “best effort” content.

---

## 4) Study Guide Rules

Required top-level keys:
- `overview`
- `key_actions`
- `checklist`
- `important_details`
- `sections`

Forbidden:
- answers
- explanations
- solution steps
- inferred tasks
- rewritten content that changes meaning

---

## 5) Quiz Rules

- **Lecture documents only**
- **User-triggered only**
- Questions MUST be answerable **verbatim** from text
- No reasoning/synthesis questions
- No grading logic
- No storing attempts, analytics, or scoring

---

## 6) Citation Rules

- No fabricated citations
- No guessed page numbers
- Excerpts must exist in source text
- If uncertain, do not guess; trigger validation failure/refusal flow rather than partial output

Citation shape is defined in `docs/SCHEMAS.md`.

---

## 7) Failure Behavior

If the request violates any rule:
- return a refusal / policy error (per `docs/API_ERRORS.md`)
- do NOT attempt partial completion
- do NOT omit invalid items and continue
