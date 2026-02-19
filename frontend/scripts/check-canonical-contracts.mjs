import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_PATTERN = /frontend[\\/]+docs[\\/]+/;
const TARGETS = ["src", "scripts"];
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

function collectFiles(targetPath) {
  const resolved = path.resolve(process.cwd(), targetPath);
  if (!fs.existsSync(resolved)) {
    return [];
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return [resolved];
  }

  const files = [];
  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const childPath = path.join(resolved, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path.relative(process.cwd(), childPath)));
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
    if (FORBIDDEN_PATTERN.test(lines[i])) {
      hits.push({
        line: i + 1,
        text: lines[i].trim(),
      });
    }
  }
  return hits;
}

const findings = [];
for (const target of TARGETS) {
  const files = collectFiles(target);
  for (const filePath of files) {
    const hits = scanFile(filePath);
    if (hits.length === 0) {
      continue;
    }
    for (const hit of hits) {
      findings.push({
        file: path.relative(process.cwd(), filePath),
        line: hit.line,
        text: hit.text,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Canonical contract guard failed.");
  console.error("Use root docs/* contracts; do not reference legacy frontend docs paths in implementation files.");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.log("Canonical contract guard passed.");
