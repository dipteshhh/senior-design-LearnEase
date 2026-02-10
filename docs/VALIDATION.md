# LearnEase — Validation Rules (Backend Enforcement)

LearnEase enforces academic integrity by validating that **every extracted item is grounded** in the uploaded document.

This doc defines the exact validation algorithm.

---

## 1) Text Normalization (Required)

When validating quotes/excerpts against extracted text:

1. Convert Windows/Mac line endings to `\n`.
2. Collapse all runs of whitespace to a single space.
3. Trim leading/trailing whitespace.
4. Normalize curly quotes to straight quotes:
   - “ ” → "
   - ‘ ’ → '
5. Remove soft hyphen (U+00AD) and zero-width spaces.
6. For PDFs, additionally:
   - Replace line-break hyphenation patterns like `"exam-\nple"` → `"example"` when the hyphen occurs at line end.

Backend stores a **normalized_text** version for validation.

---

## 2) Quote Existence Check (supporting_quote)

For each `supporting_quote`:

- Normalize the quote using the same rules.
- Validate with an **exact substring match** against normalized_text.
- If not found → reject the whole payload with `422` (`QUOTE_NOT_FOUND`).

No fuzzy matching. No semantic matching.

---

## 3) Citation Excerpt Check

For each citation:
- Normalize `citation.excerpt`
- Must be an exact substring match in normalized_text

Additionally:
- If `source_type = pdf`, `page` must be within `[1, page_count]`.
- If `source_type = docx`, `paragraph` must be within `[1, paragraph_count]`.

Note: paragraph_count is computed during DOCX extraction.

If any citation fails excerpt/range checks, reject the whole payload with `422`.

---

## 4) Region Consistency (Optional Strict Mode)

If you later add region-mapped extraction:
- citations must match within the specified page/paragraph region text
- otherwise fail with `422`

This mode is OFF unless explicitly enabled in config.

---

## 5) Single-Generation Cache Rule

Study guide / quiz outputs are generated once per document and cached.

- If a request is repeated and cached output exists:
  - `POST /api/study-guide/create` returns `200` cached status (`{ "status": "ready", "cached": true }`)
  - `POST /api/quiz/create` returns `200` cached status (`{ "status": "ready", "cached": true }`)
  - clients fetch JSON via corresponding `GET` endpoint
- Regeneration is ONLY allowed via explicit retry endpoints after failure (see `docs/API.md`):
  - `POST /api/study-guide/retry`
  - `POST /api/quiz/retry`
