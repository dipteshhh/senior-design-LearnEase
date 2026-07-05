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
    "document_type": "HOMEWORK | LECTURE",
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
- Every `sections[]` entry MUST include at least one citation.
- Every `ExtractionItem` MUST have a quote and citations.

### 3.2 StudyGuide API Response (GET /api/study-guide/:documentId)

The API response extends the generated StudyGuide with server-side checklist state:

```json
{
  "overview": { ... },
  "key_actions": [ ... ],
  "checklist": [ ... ],
  "important_details": { ... },
  "sections": [ ... ],
  "checklist_completion": {
    "checklist-item-id": true
  }
}
```

- `checklist_completion` is a `Record<string, boolean>` mapping checklist item `id` values to their completion status.
- This field is added by the API layer, not by the AI generation pipeline.
- Missing keys default to `false`.

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

## 5) Visual Observations (Lecture Visual Notes Beta)

Visual observations are a separate text-only artifact. They are not source citations and do not weaken Study Guide citation validation.

```json
{
  "document_id": "uuid",
  "status": "complete | partial | skipped",
  "created_at": "timestamp",
  "model": "model-name",
  "source_inventory_artifact_hash": "sha256 | optional",
  "observations": [
    {
      "id": "uuid",
      "visual_inventory_item_id": "docx-image-1",
      "image_hash": "sha256",
      "source_file_type": "DOCX | PDF",
      "origin": "docx_embedded_image | pdf_embedded_image",
      "media_path": "word/media/image1.png",
      "page": null,
      "image_index": 1,
      "content_type": "image/png",
      "type": "diagram | chart | screenshot | table_image | photo | other",
      "summary": "Text-only description of visible content.",
      "visible_text": ["only clearly readable text"],
      "academic_relevance": "How the visual may support lecture review.",
      "confidence": "low | medium | high",
      "limitations": ["Uncertainty or visibility limits."]
    }
  ],
  "warnings": []
}
```

Rules:
- Lecture/class documents only.
- Generated only as a best-effort sidecar after an explicit Study Guide trigger.
- No homework visual interpretation.
- No image bytes, base64, data URIs, decrypted paths, thumbnails, or signed URLs in API responses.
- Observations are not exact-text evidence and MUST NOT be treated as citations.

---

## 6) Error Payload (Shared)

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
