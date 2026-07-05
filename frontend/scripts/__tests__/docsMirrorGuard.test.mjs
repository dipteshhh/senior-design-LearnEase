import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findDocsMirrorDrift } from "../lib/docsMirrorGuard.mjs";

function withTempDocs(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-mirror-guard-test-"));
  const canonicalDir = path.join(root, "docs");
  const mirrorDir = path.join(root, "frontend", "docs");
  fs.mkdirSync(canonicalDir, { recursive: true });
  fs.mkdirSync(mirrorDir, { recursive: true });
  try {
    run({ canonicalDir, mirrorDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("findDocsMirrorDrift passes when mirrors are byte-identical", () => {
  withTempDocs(({ canonicalDir, mirrorDir }) => {
    fs.writeFileSync(path.join(canonicalDir, "API.md"), "# API\ncontract\n", "utf8");
    fs.writeFileSync(path.join(mirrorDir, "API.md"), "# API\ncontract\n", "utf8");

    const drift = findDocsMirrorDrift({ canonicalDir, mirrorDir });
    assert.equal(drift.length, 0);
  });
});

test("findDocsMirrorDrift reports mirrors that differ from canonical", () => {
  withTempDocs(({ canonicalDir, mirrorDir }) => {
    fs.writeFileSync(path.join(canonicalDir, "AUTH.md"), "# Auth\nnew flow\n", "utf8");
    fs.writeFileSync(path.join(mirrorDir, "AUTH.md"), "# Auth\nold flow\n", "utf8");

    const drift = findDocsMirrorDrift({ canonicalDir, mirrorDir });
    assert.equal(drift.length, 1);
    assert.equal(drift[0]?.file, "AUTH.md");
  });
});

test("findDocsMirrorDrift ignores mirror-only files without a canonical twin", () => {
  withTempDocs(({ canonicalDir, mirrorDir }) => {
    fs.writeFileSync(path.join(mirrorDir, "DEV_SETUP.md"), "frontend-only doc\n", "utf8");

    const drift = findDocsMirrorDrift({ canonicalDir, mirrorDir });
    assert.equal(drift.length, 0);
  });
});

test("findDocsMirrorDrift ignores canonical-only files that were never mirrored", () => {
  withTempDocs(({ canonicalDir, mirrorDir }) => {
    fs.writeFileSync(path.join(canonicalDir, "DEPLOY_RAILWAY.md"), "ops doc\n", "utf8");

    const drift = findDocsMirrorDrift({ canonicalDir, mirrorDir });
    assert.equal(drift.length, 0);
  });
});

test("findDocsMirrorDrift ignores non-markdown files", () => {
  withTempDocs(({ canonicalDir, mirrorDir }) => {
    fs.writeFileSync(path.join(canonicalDir, "notes.txt"), "a\n", "utf8");
    fs.writeFileSync(path.join(mirrorDir, "notes.txt"), "b\n", "utf8");

    const drift = findDocsMirrorDrift({ canonicalDir, mirrorDir });
    assert.equal(drift.length, 0);
  });
});

test("findDocsMirrorDrift returns empty when directories are missing", () => {
  const missing = path.join(os.tmpdir(), "docs-mirror-guard-missing", "nope");
  const drift = findDocsMirrorDrift({ canonicalDir: missing, mirrorDir: missing });
  assert.equal(drift.length, 0);
});
