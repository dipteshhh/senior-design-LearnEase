import "dotenv/config";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { getDb, initializeDatabase } from "../db/sqlite.js";
import { readEncryptedText } from "../lib/encryption.js";

/**
 * Dev/admin-only, read-only artifact integrity checker.
 *
 * Verifies that the SQLite metadata and the encrypted artifact store agree:
 * every registered artifact file exists and decrypts, JSON artifacts parse,
 * and no orphan artifact directories are left behind.
 *
 * Output is strictly metadata: it never prints decrypted document text,
 * image bytes, base64, keys, or secrets. Decrypted content is discarded
 * immediately after the decrypt/parse probe.
 */

type ArtifactType =
  | "ORIGINAL_FILE"
  | "EXTRACTED_TEXT"
  | "VISUAL_INVENTORY"
  | "VISUAL_OBSERVATIONS";

interface ArtifactRow {
  document_id: string;
  artifact_type: ArtifactType;
  encrypted_path: string;
}

export type ArtifactProblemReason = "file_missing" | "decrypt_failed" | "parse_failed";

export interface ArtifactProblem {
  documentId: string;
  artifactType: ArtifactType;
  encryptedPath: string;
  reason: ArtifactProblemReason;
}

export interface VisualArtifactSummary {
  documentId: string;
  status: string;
  itemCount: number;
  warningCount: number;
}

export interface IntegrityReport {
  ok: boolean;
  documentCount: number;
  artifactCount: number;
  artifactCountByType: Record<string, number>;
  problems: ArtifactProblem[];
  orphanDirectories: string[];
  orphanArtifactRows: number;
  visualInventories: VisualArtifactSummary[];
  visualObservations: VisualArtifactSummary[];
}

function resolveArtifactsRoot(): string {
  const configuredPath = process.env.ARTIFACTS_DIR?.trim();
  if (!configuredPath) {
    return path.resolve(process.cwd(), "data", "artifacts");
  }
  if (path.isAbsolute(configuredPath)) {
    return configuredPath;
  }
  return path.resolve(process.cwd(), configuredPath);
}

const JSON_ARTIFACT_TYPES: ReadonlySet<ArtifactType> = new Set([
  "VISUAL_INVENTORY",
  "VISUAL_OBSERVATIONS",
]);

function summarizeVisualJson(documentId: string, parsed: unknown): VisualArtifactSummary {
  const record = (parsed ?? {}) as {
    status?: unknown;
    items?: unknown;
    observations?: unknown;
    warnings?: unknown;
  };
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.observations)
      ? record.observations
      : [];
  return {
    documentId,
    status: typeof record.status === "string" ? record.status : "unknown",
    itemCount: items.length,
    warningCount: Array.isArray(record.warnings) ? record.warnings.length : 0,
  };
}

export function runIntegrityCheck(): IntegrityReport {
  const db = getDb();

  const documentIds = new Set<string>(
    (db.prepare("SELECT id FROM documents").all() as Array<{ id: string }>).map((row) => row.id)
  );

  const artifactRows = db
    .prepare("SELECT document_id, artifact_type, encrypted_path FROM document_artifacts")
    .all() as ArtifactRow[];

  const artifactCountByType: Record<string, number> = {};
  const problems: ArtifactProblem[] = [];
  const visualInventories: VisualArtifactSummary[] = [];
  const visualObservations: VisualArtifactSummary[] = [];
  let orphanArtifactRows = 0;

  for (const row of artifactRows) {
    artifactCountByType[row.artifact_type] = (artifactCountByType[row.artifact_type] ?? 0) + 1;

    if (!documentIds.has(row.document_id)) {
      orphanArtifactRows += 1;
    }

    if (!fs.existsSync(row.encrypted_path)) {
      problems.push({
        documentId: row.document_id,
        artifactType: row.artifact_type,
        encryptedPath: row.encrypted_path,
        reason: "file_missing",
      });
      continue;
    }

    let decryptedText: string;
    try {
      decryptedText = readEncryptedText(row.encrypted_path);
    } catch {
      problems.push({
        documentId: row.document_id,
        artifactType: row.artifact_type,
        encryptedPath: row.encrypted_path,
        reason: "decrypt_failed",
      });
      continue;
    }

    if (JSON_ARTIFACT_TYPES.has(row.artifact_type)) {
      try {
        const parsed: unknown = JSON.parse(decryptedText);
        const summary = summarizeVisualJson(row.document_id, parsed);
        if (row.artifact_type === "VISUAL_INVENTORY") {
          visualInventories.push(summary);
        } else {
          visualObservations.push(summary);
        }
      } catch {
        problems.push({
          documentId: row.document_id,
          artifactType: row.artifact_type,
          encryptedPath: row.encrypted_path,
          reason: "parse_failed",
        });
      }
    }
  }

  const artifactsRoot = resolveArtifactsRoot();
  const orphanDirectories: string[] = [];
  if (fs.existsSync(artifactsRoot)) {
    for (const entry of fs.readdirSync(artifactsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !documentIds.has(entry.name)) {
        orphanDirectories.push(entry.name);
      }
    }
  }

  return {
    ok: problems.length === 0 && orphanDirectories.length === 0 && orphanArtifactRows === 0,
    documentCount: documentIds.size,
    artifactCount: artifactRows.length,
    artifactCountByType,
    problems,
    orphanDirectories,
    orphanArtifactRows,
    visualInventories,
    visualObservations,
  };
}

export function formatReportText(report: IntegrityReport): string[] {
  const lines: string[] = [];
  lines.push("Artifact Integrity Report");
  lines.push(`  Documents:      ${report.documentCount}`);
  lines.push(`  Artifact rows:  ${report.artifactCount}`);
  for (const [type, count] of Object.entries(report.artifactCountByType).sort()) {
    lines.push(`    ${type}: ${count}`);
  }

  if (report.visualInventories.length > 0) {
    lines.push(`  Visual inventories: ${report.visualInventories.length}`);
    for (const summary of report.visualInventories) {
      lines.push(
        `    ${summary.documentId} status=${summary.status} items=${summary.itemCount} warnings=${summary.warningCount}`
      );
    }
  }

  if (report.visualObservations.length > 0) {
    lines.push(`  Visual observations: ${report.visualObservations.length}`);
    for (const summary of report.visualObservations) {
      lines.push(
        `    ${summary.documentId} status=${summary.status} items=${summary.itemCount} warnings=${summary.warningCount}`
      );
    }
  }

  if (report.problems.length > 0) {
    lines.push(`  PROBLEMS (${report.problems.length}):`);
    for (const problem of report.problems) {
      lines.push(
        `    ${problem.reason}: document=${problem.documentId} type=${problem.artifactType}`
      );
      lines.push(`      path: ${problem.encryptedPath}`);
    }
  }

  if (report.orphanDirectories.length > 0) {
    lines.push(`  ORPHAN DIRECTORIES (${report.orphanDirectories.length}):`);
    for (const dir of report.orphanDirectories) {
      lines.push(`    ${dir}`);
    }
  }

  if (report.orphanArtifactRows > 0) {
    lines.push(`  ORPHAN ARTIFACT ROWS: ${report.orphanArtifactRows}`);
  }

  lines.push(report.ok ? "  Result: OK" : "  Result: ISSUES FOUND");
  return lines;
}

function sanitizeError(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

export function main(argv: string[]): number {
  const json = argv.includes("--json");

  try {
    initializeDatabase();
    const report = runIntegrityCheck();
    if (json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatReportText(report).join("\n")}\n`);
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    // Sanitized: message only, never stacks/env/secrets/bytes.
    process.stderr.write(`Integrity check failed: ${sanitizeError(error)}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
