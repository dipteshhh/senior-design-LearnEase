# LearnEase — Document Classification (Local, No‑LLM)

Document type classification is performed **locally** (no OpenAI call).

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
