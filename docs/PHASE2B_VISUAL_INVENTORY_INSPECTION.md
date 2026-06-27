# Phase 2B — Visual Inventory Inspection (dev/admin)

**Status:** Implemented — backend-only, read-only tooling
**Builds on:** Phase 2A DOCX embedded raster visual inventory
**Scope:** A local dev/admin CLI to inspect and verify `VISUAL_INVENTORY` artifacts without manually decrypting files.

---

## What this is

Phase 2A writes an encrypted `VISUAL_INVENTORY` manifest plus encrypted image
blobs under `{ARTIFACTS_DIR}/{document_id}/visuals/*`, but provides no way to
look at them. Phase 2B adds:

- `getVisualInventoryManifest(documentId)` — read-only, result-object manifest
  read (never throws for missing/corrupt manifests).
- `verifyVisualInventoryAssets(documentId)` — confirms each manifest item's
  encrypted asset exists, decrypts, and matches the recorded byte size and
  SHA-256. Returns **metadata-only** results.
- `backend/src/cli/inspectVisualInventory.ts` — a CLI wrapper.

This is an internal operations/QA aid. It is **not** a product feature.

## Safety properties

- **Dev/admin only, local only.** No HTTP route is added; nothing is exposed
  over the network.
- **Requires DB access and `FILE_ENCRYPTION_KEY`.** It runs at the same trust
  level as the server itself and grants no new capability.
- **Metadata-only output.** It prints status, counts, dimensions, byte sizes,
  SHA-256 hashes, content types, and artifact paths — **never** base64, hex
  dumps, decrypted bytes, or image content.
- **No export/dump mode.** It never writes decrypted images to disk.
- **No OpenAI / vision / OCR / interpretation.**
- **Read-only.** It does not mutate documents or artifacts and respects
  document deletion — once a document is deleted, its rows cascade away and the
  tool reports it as not found.
- **Sanitized errors.** It prints error messages only, never stack traces with
  sensitive data, environment variables, or the encryption key.

## Usage

```bash
# Inspect one document's visual inventory metadata
npm run inspect:visual-inventory -- --document <documentId>

# Verify that each encrypted asset still matches its recorded size + hash
npm run inspect:visual-inventory -- --document <documentId> --verify

# Machine-readable JSON output
npm run inspect:visual-inventory -- --document <documentId> --json

# List inventories across all of a user's documents
npm run inspect:visual-inventory -- --user <userId> --verify
```

Flags:

- `--document <documentId>` — inspect a single document.
- `--user <userId>` — inspect all of that user's documents.
- `--verify` — run asset integrity verification.
- `--json` — emit JSON instead of the default readable text.

Exit codes:

- `0` — success.
- `1` — document/user not found, or `--verify` found a failing asset.
- `2` — invalid arguments.

## Environment

The CLI reads the same configuration the backend uses:

- `DATABASE_PATH` — SQLite database path.
- `ARTIFACTS_DIR` — encrypted artifact root.
- `FILE_ENCRYPTION_KEY` — AES-256-GCM key used by `backend/src/lib/encryption.ts`.

Point it at an existing, initialized database (the one the running app uses). It
does not create schema or run migrations.

## What stayed out of scope

- No HTTP/inspection route (candidate for a later phase).
- No frontend changes, no UI.
- No PDF visual extraction; no DOCX image-to-paragraph association.
- No manifest/StudyGuide/citation schema changes; no DB tables/columns/migrations.
- No image interpretation, captioning, or export.
