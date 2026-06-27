# Internal Debug Routes

Internal debug routes are for local development and test verification only. They are not linked from the frontend and should not be treated as public API contracts.

## Visual Inventory Metadata

`GET /api/internal/documents/:documentId/visual-inventory`

Availability:

- Enabled by default when `NODE_ENV !== "production"`.
- Disabled when `ENABLE_INTERNAL_DEBUG_ROUTES=false`.
- Can be explicitly enabled with `ENABLE_INTERNAL_DEBUG_ROUTES=true`.
- Returns `404` when disabled.

Access:

- Requires the normal authenticated session middleware.
- Requires ownership of the requested document.

Behavior:

- Reads the encrypted `VISUAL_INVENTORY` manifest for the document.
- Decrypts and parses only the manifest JSON.
- Does not create visual inventory on demand.
- Returns `404` when no visual inventory artifact exists.
- Returns a safe `422` for invalid manifest JSON and a safe `500` for unreadable encrypted manifests.

Response data is metadata only:

- `document_id`
- `status`
- `source_file_type`
- `extraction_version`
- `created_at`
- `limits`
- `item_count`
- `warnings`
- item metadata: `id`, `origin`, `source_file_type`, `image_index`, `media_path`, `page`, `content_type`, `byte_size`, `image_hash`, `width`, `height`

Privacy and safety boundaries:

- No raw image bytes.
- No base64.
- No decrypted image content.
- No image previews.
- No OpenAI, OCR, captioning, or visual interpretation.
- No `encrypted_artifact_path` in the response.
