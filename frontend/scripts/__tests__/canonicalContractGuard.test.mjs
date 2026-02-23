import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findForbiddenReferences } from "../lib/canonicalContractGuard.mjs";

function withTempProject(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frontend-guard-test-"));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("findForbiddenReferences detects forbidden frontend/docs path", () => {
  withTempProject((root) => {
    const srcDir = path.join(root, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const forbiddenRef = "frontend/" + "docs/API.md";
    fs.writeFileSync(
      path.join(srcDir, "example.ts"),
      `const ref = "${forbiddenRef}";\n`,
      "utf8"
    );

    const findings = findForbiddenReferences({ cwd: root, targets: ["src"] });
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.file, path.join("src", "example.ts"));
    assert.equal(findings[0]?.line, 1);
  });
});

test("findForbiddenReferences ignores skipped directories", () => {
  withTempProject((root) => {
    const skippedDir = path.join(root, "src", "node_modules");
    fs.mkdirSync(skippedDir, { recursive: true });
    const forbiddenRef = "frontend/" + "docs/API.md";
    fs.writeFileSync(
      path.join(skippedDir, "ignored.ts"),
      `const ref = "${forbiddenRef}";\n`,
      "utf8"
    );

    const findings = findForbiddenReferences({ cwd: root, targets: ["src"] });
    assert.equal(findings.length, 0);
  });
});

test("findForbiddenReferences ignores non-text file extensions", () => {
  withTempProject((root) => {
    const srcDir = path.join(root, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const forbiddenRef = "frontend/" + "docs/API.md";
    fs.writeFileSync(
      path.join(srcDir, "binary.txt"),
      `${forbiddenRef}\n`,
      "utf8"
    );

    const findings = findForbiddenReferences({ cwd: root, targets: ["src"] });
    assert.equal(findings.length, 0);
  });
});
