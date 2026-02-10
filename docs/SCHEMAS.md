# LearnEase — Output Schemas (Source of Truth)

This document defines the **exact JSON shapes** that backend validation enforces.

If an output does not conform, the backend MUST reject it with a `422` validation error
(see `docs/API_ERRORS.md`).

---

## 1) Shared Types

### 1.1 Citation

> Citation = location pointer + excerpt (verbatim snippet).

```json
{
  "source_type": "pdf",
  "page": 2,
  "excerpt": "Submit via Blackboard by Friday"
}
```

```json
{
  "source_type": "docx",
  "anchor_type": "paragraph",
  "paragraph": 14,
  "excerpt": "Attendance is required"
}
```

Rules:
- `excerpt` MUST be present in extracted document text (see `docs/VALIDATION.md`).
- For PDF citations, `page` is **1-indexed**.
- For DOCX citations, `paragraph` is **1-indexed**.

---

## 2) Extraction Item (Quote‑Backed)

Used for `key_actions`, `checklist`, and other “bullet” extractions.

```json
{
  "id": "uuid",
  "label": "Submit Homework 1",
  "supporting_quote": "Homework 1 is due Friday at 11:59 PM.",
  "citations": [
    { "source_type": "pdf", "page": 2, "excerpt": "Homework 1 is due Friday at 11:59 PM." }
  ]
}
```

Rules:
- `supporting_quote` MUST be verbatim and MUST exist in extracted text.
- `citations` MUST NOT be fabricated.
- `citations` MUST contain at least one valid citation.
- If quote or citations cannot be verified → reject the whole payload with `422` (do not partially omit items).

---

## 3) Study Guide

### 3.1 StudyGuide (top-level)

```json
{
  "overview": {
    "title": "string",
    "document_type": "HOMEWORK | LECTURE | SYLLABUS",
    "summary": "string"
  },
  "key_actions": [],
  "checklist": [],
  "important_details": {
    "dates": [],
    "policies": [],
    "contacts": [],
    "logistics": []
  },
  "sections": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "citations": []
    }
  ]
}
```

Where:
- `key_actions`, `checklist`, and each `important_details.*` array are `ExtractionItem[]`
- `sections[].citations` is `Citation[]`

Rules:
- `overview.summary` may paraphrase but MUST NOT change meaning.
- `sections[].content` may restructure but MUST remain faithful to source.
- Every `ExtractionItem` MUST have a quote and citations.

---

## 4) Quiz (Lecture Only)

```json
{
  "document_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "supporting_quote": "verbatim text that contains the answer",
      "citations": []
    }
  ]
}
```

Rules:
- Lecture-only, user-triggered only (see `docs/SPEC.md` and AI Contract).
- Answer MUST be supported verbatim from text.
- `citations` MUST contain at least one valid citation for each question.
- No “why” questions, no synthesis, no multi-step reasoning.

---

## 5) Error Payload (Shared)

All errors returned by backend MUST follow:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```
