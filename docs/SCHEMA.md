# LearnEase — Database Schema (Mirror)

This file mirrors `docs/DB_SCHEMA.md`.
If any conflict exists, `docs/DB_SCHEMA.md` is authoritative.

SQLite is used for **metadata and cached outputs only**.

Uploaded files and derived artifacts are stored **encrypted on disk** (paths referenced from SQLite).

---

## Users
- id (string; stable unique id from auth provider)
- email
- name (nullable)
- created_at

---

## Documents
- id (uuid)
- user_id (fk -> Users.id)
- original_filename
- file_type (PDF | DOCX)
- page_count (pdf only; nullable)
- paragraph_count (docx only; nullable)
- document_type (HOMEWORK | LECTURE | SYLLABUS | UNSUPPORTED)
- status (uploaded | processing | ready | failed)
- uploaded_at
- processed_at (nullable)
- error_code (nullable)
- error_message (nullable)

---

## DocumentArtifacts
Stores references to encrypted-on-disk artifacts derived from the uploaded file.

- id (uuid)
- document_id (fk -> Documents.id)
- artifact_type (ORIGINAL_FILE | EXTRACTED_TEXT)
- encrypted_path (string)
- content_hash (string; sha256 of normalized content for EXTRACTED_TEXT; nullable for ORIGINAL_FILE)
- created_at

Notes:
- ORIGINAL_FILE is the encrypted upload.
- EXTRACTED_TEXT is the extracted + normalized text (used for quote validation).

---

## StudyGuides
- id (uuid)
- document_id (fk -> Documents.id, unique)
- study_guide_json (json)
- created_at

---

## Quizzes
- id (uuid)
- document_id (fk -> Documents.id, unique)
- quiz_json (json)
- created_at

---

## ChecklistItems
- id (uuid)
- document_id (fk -> Documents.id)
- label
- completed (boolean)
- created_at

---

## Retention Rules

- All document-related data auto-deleted after 30 days
- Encrypted-on-disk artifacts MUST be deleted when their document is deleted
- Raw uploads MUST NOT be stored in SQLite (only paths + metadata)
- Encryption keys MUST NOT be committed
