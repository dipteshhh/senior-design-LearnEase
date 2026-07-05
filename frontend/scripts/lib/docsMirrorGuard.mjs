import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, "..", "..");
const REPO_ROOT_DIR = path.dirname(FRONTEND_DIR);

/**
 * Docs mirror drift guard.
 *
 * Canonical contracts live in the repo-root `docs/` directory. The frontend
 * keeps same-named mirror copies in its own docs directory for reference. Any
 * mirror that shares a filename with a canonical doc must be byte-identical to
 * it; frontend-only files (e.g. DEV_SETUP.md, README.md) are exempt.
 */

export function findDocsMirrorDrift({
  canonicalDir,
  mirrorDir,
} = {}) {
  const resolvedMirrorDir = path.resolve(mirrorDir ?? path.join(FRONTEND_DIR, "docs"));
  const resolvedCanonicalDir = path.resolve(canonicalDir ?? path.join(REPO_ROOT_DIR, "docs"));

  if (!fs.existsSync(resolvedMirrorDir) || !fs.existsSync(resolvedCanonicalDir)) {
    return [];
  }

  const drift = [];
  const mirrorEntries = fs
    .readdirSync(resolvedMirrorDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"));

  for (const entry of mirrorEntries) {
    const canonicalPath = path.join(resolvedCanonicalDir, entry.name);
    if (!fs.existsSync(canonicalPath)) {
      continue;
    }

    const mirrorPath = path.join(resolvedMirrorDir, entry.name);
    const canonicalContent = fs.readFileSync(canonicalPath, "utf8");
    const mirrorContent = fs.readFileSync(mirrorPath, "utf8");
    if (canonicalContent !== mirrorContent) {
      drift.push({
        file: entry.name,
        canonicalPath,
        mirrorPath,
      });
    }
  }

  return drift;
}
