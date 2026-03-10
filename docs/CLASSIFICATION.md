# LearnEase — Document Classification (Two-Stage)

Document type classification uses a two-stage approach: a local keyword
classifier at upload time (Stage 1) and an LLM pre-classifier at generation
time (Stage 2). See §4 for details.

Supported output values:
- HOMEWORK
- LECTURE
- SYLLABUS
- UNSUPPORTED

---

## 1) Inputs

Classifier receives:
- extracted_text (normalized)
- original_filename
- file_type (PDF | DOCX)

---

## 2) Heuristics (Deterministic, First-Match-Wins)

The classifier evaluates heuristics in the order listed below.
The **first matching category wins**, and no further checks are performed.

### 2.1 Syllabus
If any of the following appear (case-insensitive):
- "syllabus"
- "course policies"
- "grading"
- "office hours"
- "learning outcomes"
Then classify as `SYLLABUS`.

### 2.2 Homework
If any of the following appear:
- "homework"
- "assignment"
- "problem set"
- "due date"
- "submit"
Then classify as `HOMEWORK`.

### 2.3 Lecture
If any of the following appear:
- "lecture"
- "slides"
- "topic:"
- "learning objectives"
- repeated header patterns like "Week", "Module", "Chapter"
Then classify as `LECTURE`.


### 2.4 Unsupported
If extracted_text is empty OR none of the above triggers match, classify as `UNSUPPORTED`.

---
## 3) Notes

- Classifier MUST NOT infer intent; only keyword/structure triggers above.
- There is **no tie-breaking logic**.
- Classification stops at the first matching heuristic.

---
## 4) Two-Stage Classification

Classification uses two stages:

### 4.1 Stage 1 — Local Keyword Classifier (Upload Time)
The deterministic first-match-wins heuristics from §2 run at upload time.
This provides fast metadata without an OpenAI call. The local classifier
is a best-effort signal; it may misclassify out-of-scope documents that
contain trigger words (e.g. a project report containing "submit").

### 4.2 Stage 2 — LLM Pre-Classifier (Generation Time)
Immediately before study guide generation, a lightweight LLM call
(`gpt-4o-mini`, ~2000 chars of input, `max_tokens: 10`, `temperature: 0`)
validates the document type based on the document's **primary purpose**,
not incidental keywords.

- If the LLM returns `UNSUPPORTED`, generation is blocked and the document
  is marked as failed with error code `DOCUMENT_UNSUPPORTED`.
- If the LLM call fails (timeout, API error, unexpected output), generation
  **fails closed** — the document is marked as failed with a retriable error.
  The system does NOT fall back to the local classifier, because the local
  classifier is known to produce false positives for out-of-scope documents.
- Both local and LLM results are logged for disagreement tracking.

The LLM pre-classifier is the **gating decision** for whether generation
proceeds. It runs only when the user triggers generation (not at upload),
consistent with `docs/SPEC.md` §6.
