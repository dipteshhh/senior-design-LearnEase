#!/usr/bin/env node
/**
 * Parse a dotenv file and print shell-safe export statements.
 * Skips keys already set in the environment (matches dotenv/config behavior).
 *
 * Usage (from backend/):
 *   eval "$(node scripts/load-dotenv-for-shell.mjs)"
 *   eval "$(node scripts/load-dotenv-for-shell.mjs /path/to/.env)"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultEnvPath = path.resolve(scriptDir, "..", ".env");
const envPath = path.resolve(process.argv[2] ?? defaultEnvPath);

if (!fs.existsSync(envPath)) {
  process.stderr.write(
    `load-dotenv-for-shell: file not found: ${envPath}\n` +
      "Copy .env.example to .env and set required secrets.\n"
  );
  process.exit(1);
}

/** POSIX-safe single-quoted string for bash eval. */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

let parsed;
try {
  parsed = parse(fs.readFileSync(envPath, "utf8"));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`load-dotenv-for-shell: failed to parse ${envPath}: ${message}\n`);
  process.exit(1);
}

for (const [key, value] of Object.entries(parsed)) {
  if (process.env[key] !== undefined) {
    continue;
  }
  process.stdout.write(`export ${key}=${shellQuote(value)}\n`);
}
