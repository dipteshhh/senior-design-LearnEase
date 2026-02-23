import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_PATTERN = /frontend[\\/]+docs[\\/]+/;
const DEFAULT_TARGETS = ["src", "scripts"];
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "dist", "coverage"]);
const TEXT_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
]);

function shouldScanFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(extension);
}

function collectFiles(targetPath, cwd) {
  const resolved = path.resolve(cwd, targetPath);
  if (!fs.existsSync(resolved)) {
    return [];
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return shouldScanFile(resolved) ? [resolved] : [];
  }

  const files = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const childPath = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.relative(cwd, childPath), cwd));
      continue;
    }

    if (entry.isFile() && shouldScanFile(childPath)) {
      files.push(childPath);
    }
  }

  return files;
}

function scanFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!FORBIDDEN_PATTERN.test(lines[i])) {
      continue;
    }

    hits.push({
      line: i + 1,
      text: lines[i].trim(),
    });
  }

  return hits;
}

export function findForbiddenReferences({
  cwd = process.cwd(),
  targets = DEFAULT_TARGETS,
} = {}) {
  const findings = [];

  for (const target of targets) {
    const files = collectFiles(target, cwd);
    for (const filePath of files) {
      const hits = scanFile(filePath);
      for (const hit of hits) {
        findings.push({
          file: path.relative(cwd, filePath),
          line: hit.line,
          text: hit.text,
        });
      }
    }
  }

  return findings;
}

