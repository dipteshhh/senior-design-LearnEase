# LearnEase — Database Schema (Source of Truth)

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
- content_hash (sha256 of original uploaded file bytes; nullable for legacy rows)
- page_count (pdf only; nullable)
- paragraph_count (docx only; nullable)
- document_type (HOMEWORK | LECTURE | UNSUPPORTED)
- status (uploaded | processing | ready | failed)
- uploaded_at
- processed_at (nullable)
- error_code (nullable)
- error_message (nullable)
- study_guide_status (idle | processing | ready | failed)
- study_guide_error_code (nullable)
- study_guide_error_message (nullable)
- quiz_status (idle | processing | ready | failed)
- quiz_error_code (nullable)
- quiz_error_message (nullable)
- assignment_due_date (YYYY-MM-DD; nullable)
- assignment_due_time (HH:MM; nullable)
- reminder_sent (legacy boolean; retained for migration compatibility)
- reminder_opt_in (boolean)
- reminder_status (pending | sending | sent | failed | skipped | past_due)
- reminder_deadline_key (nullable)
- reminder_last_error (nullable)
- reminder_attempted_at (nullable)

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
