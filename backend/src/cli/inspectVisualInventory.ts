import "dotenv/config";
import { pathToFileURL } from "url";
import {
  getVisualInventoryManifest,
  listDocumentsByUser,
  verifyVisualInventoryAssets,
  type VisualInventoryManifestReadResult,
  type VisualInventoryVerifyResult,
} from "../store/memoryStore.js";
import type { VisualInventoryManifest } from "../services/visualInventory.js";

/**
 * Dev/admin-only, read-only CLI for inspecting Phase 2A visual inventory
 * artifacts. Metadata-only: it never prints base64, hex, decrypted bytes, or
 * image content, and it has no export/dump mode.
 */

export interface InspectArgs {
  documentId?: string;
  userId?: string;
  verify: boolean;
  json: boolean;
}

export class InspectArgsError extends Error {}

export function parseArgs(argv: string[]): InspectArgs {
  const args: InspectArgs = { verify: false, json: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--document":
      case "--user": {
        const value = argv[i + 1];
        if (!value || value.startsWith("--")) {
          throw new InspectArgsError(`Missing value for ${token}.`);
        }
        if (token === "--document") {
          args.documentId = value;
        } else {
          args.userId = value;
        }
        i += 1;
        break;
      }
      case "--verify":
        args.verify = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        throw new InspectArgsError(`Unknown argument: ${token}.`);
    }
  }

  if (!args.documentId && !args.userId) {
    throw new InspectArgsError("Provide --document <documentId> or --user <userId>.");
  }
  if (args.documentId && args.userId) {
    throw new InspectArgsError("Use only one of --document or --user.");
  }

  return args;
}

interface ManifestItemView {
  id: string;
  image_index: number;
  content_type: string;
  width: number | null;
  height: number | null;
  byte_size: number;
  image_hash: string;
  media_path?: string;
  encrypted_artifact_path: string;
}

interface DocumentReport {
  document_id: string;
  found: boolean;
  ok: boolean;
  read_error?: "missing" | "decrypt_failed" | "parse_failed";
  manifest?: {
    status: string;
    source_file_type: string;
    extraction_version: string;
    created_at: string;
    limits: VisualInventoryManifest["limits"];
    item_count: number;
    items: ManifestItemView[];
    warnings: string[];
  };
  verify?: VisualInventoryVerifyResult;
}

function toItemView(manifest: VisualInventoryManifest): ManifestItemView[] {
  return manifest.items.map((item) => ({
    id: item.id,
    image_index: item.image_index,
    content_type: item.content_type,
    width: item.width ?? null,
    height: item.height ?? null,
    byte_size: item.byte_size,
    image_hash: item.image_hash,
    media_path: item.media_path,
    encrypted_artifact_path: item.encrypted_artifact_path,
  }));
}

export function buildDocumentReport(
  documentId: string,
  read: VisualInventoryManifestReadResult,
  verify?: VisualInventoryVerifyResult
): DocumentReport {
  if (!read.ok) {
    return {
      document_id: documentId,
      found: read.reason !== "missing",
      ok: false,
      read_error: read.reason,
      verify,
    };
  }

  const { manifest } = read;
  const verifyOk = verify ? verify.ok : true;
  return {
    document_id: documentId,
    found: true,
    ok: verifyOk,
    manifest: {
      status: manifest.status,
      source_file_type: manifest.source_file_type,
      extraction_version: manifest.extraction_version,
      created_at: manifest.created_at,
      limits: manifest.limits,
      item_count: manifest.items.length,
      items: toItemView(manifest),
      warnings: manifest.warnings,
    },
    verify,
  };
}

export function formatDocumentReportText(report: DocumentReport): string[] {
  const lines: string[] = [];
  lines.push(`Document: ${report.document_id}`);

  if (!report.manifest) {
    if (report.read_error === "missing") {
      lines.push("  Visual inventory: none (no VISUAL_INVENTORY artifact).");
    } else {
      lines.push(`  Visual inventory: unreadable (${report.read_error}).`);
    }
    return lines;
  }

  const m = report.manifest;
  lines.push(`  Status:             ${m.status}`);
  lines.push(`  Source file type:   ${m.source_file_type}`);
  lines.push(`  Extraction version: ${m.extraction_version}`);
  lines.push(`  Created at:         ${m.created_at}`);
  lines.push(
    `  Limits:             max_images=${m.limits.max_images}, ` +
      `max_total_bytes=${m.limits.max_total_bytes}, max_image_bytes=${m.limits.max_image_bytes}, ` +
      `max_image_pixels=${m.limits.max_image_pixels}, timeout_ms=${m.limits.timeout_ms}`
  );
  lines.push(`  Items:              ${m.item_count}`);

  for (const item of m.items) {
    const dims = `${item.width ?? "?"}x${item.height ?? "?"}`;
    lines.push(
      `    [${item.image_index}] ${item.id} ${item.content_type} ${dims} ` +
        `${item.byte_size}B sha256=${item.image_hash}`
    );
    lines.push(`        media_path: ${item.media_path ?? "(none)"}`);
    lines.push(`        artifact:   ${item.encrypted_artifact_path}`);

    if (report.verify && "items" in report.verify) {
      const v = report.verify.items.find((entry) => entry.id === item.id);
      if (v) {
        lines.push(`        verify:     ${v.ok ? "OK" : `FAILED (${v.reason})`}`);
      }
    }
  }

  if (m.warnings.length > 0) {
    lines.push(`  Warnings:`);
    for (const warning of m.warnings) {
      lines.push(`    - ${warning}`);
    }
  }

  if (report.verify && "manifest_read_error" in report.verify) {
    lines.push(`  Verify: manifest unreadable (${report.verify.manifest_read_error}).`);
  } else if (report.verify) {
    lines.push(`  Verify: ${report.verify.ok ? "all assets OK" : "FAILED"}`);
  }

  return lines;
}

export interface InspectionOutput {
  exitCode: number;
  text: string;
  json: unknown;
}

type StoreApi = {
  getVisualInventoryManifest: typeof getVisualInventoryManifest;
  verifyVisualInventoryAssets: typeof verifyVisualInventoryAssets;
  listDocumentsByUser: typeof listDocumentsByUser;
};

const defaultStore: StoreApi = {
  getVisualInventoryManifest,
  verifyVisualInventoryAssets,
  listDocumentsByUser,
};

export function runInspection(args: InspectArgs, store: StoreApi = defaultStore): InspectionOutput {
  const documentIds = args.documentId
    ? [args.documentId]
    : store.listDocumentsByUser(args.userId as string).map((doc) => doc.id);

  if (documentIds.length === 0) {
    const message = args.documentId
      ? `No document found: ${args.documentId}`
      : `No documents found for user: ${args.userId}`;
    return {
      exitCode: 1,
      text: message,
      json: { documents: [], error: "not_found", message },
    };
  }

  const reports: DocumentReport[] = documentIds.map((documentId) => {
    const read = store.getVisualInventoryManifest(documentId);
    const verify = args.verify ? store.verifyVisualInventoryAssets(documentId) : undefined;
    return buildDocumentReport(documentId, read, verify);
  });

  // Exit nonzero on "not found" (single-document mode) or any verify failure.
  const singleMissing =
    Boolean(args.documentId) && reports[0].read_error === "missing";
  const verifyFailed = args.verify && reports.some((report) => !report.ok);
  const exitCode = singleMissing || verifyFailed ? 1 : 0;

  const text = reports.map((report) => formatDocumentReportText(report).join("\n")).join("\n\n");
  return { exitCode, text, json: { documents: reports } };
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

export function main(argv: string[]): number {
  let args: InspectArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof InspectArgsError) {
      process.stderr.write(`${error.message}\n`);
      process.stderr.write(
        "Usage: inspect:visual-inventory -- (--document <id> | --user <id>) [--verify] [--json]\n"
      );
      return 2;
    }
    throw error;
  }

  try {
    const result = runInspection(args);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(result.json, null, 2)}\n`);
    } else {
      process.stdout.write(`${result.text}\n`);
    }
    return result.exitCode;
  } catch (error) {
    // Sanitized: message only, never stacks/env/secrets/bytes.
    process.stderr.write(`Inspection failed: ${sanitizeError(error)}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
