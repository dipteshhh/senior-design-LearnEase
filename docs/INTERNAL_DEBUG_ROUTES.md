# Internal Debug Routes

Internal debug routes are for local development and test verification only. They are not linked from the frontend and should not be treated as public API contracts.

## Artifact Integrity Checker (CLI)

Read-only dev/admin CLI that verifies SQLite metadata and the encrypted artifact store agree.

```sh
cd backend
npm run check:artifacts          # human-readable report
npm run check:artifacts -- --json
```

It reports:

- document and artifact row counts (per artifact type)
- registered artifact files that are missing on disk (`file_missing`)
- artifacts that fail AES-256-GCM decryption (`decrypt_failed`)
- JSON artifacts (`VISUAL_INVENTORY`, `VISUAL_OBSERVATIONS`) that decrypt but do not parse (`parse_failed`)
- orphan artifact directories under `ARTIFACTS_DIR` with no matching document row
- orphan `document_artifacts` rows with no matching document
- safe summaries of visual inventory/observations artifacts (status, item count, warning count)

Exit code is `0` when everything is consistent and `1` when any issue is found.

Safety boundaries: the checker decrypts artifacts only as an in-memory probe and immediately discards the plaintext. It never prints decrypted document text, image bytes, base64, encryption keys, or secrets. It uses the same `DATABASE_PATH` / `ARTIFACTS_DIR` / `FILE_ENCRYPTION_KEY` environment as the server (loaded from `backend/.env`).

## Visual Inventory Metadata

`GET /api/internal/documents/:documentId/visual-inventory`

Availability:

- Disabled by default.
- Enabled only when `ENABLE_INTERNAL_DEBUG_ROUTES=true` and `NODE_ENV !== "production"`.
- Always disabled in production, even if `ENABLE_INTERNAL_DEBUG_ROUTES=true`.
- Returns `404` when disabled.

Local dev example:

```sh
ENABLE_INTERNAL_DEBUG_ROUTES=true npm run dev
```

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
