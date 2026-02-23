import { findForbiddenReferences } from "./lib/canonicalContractGuard.mjs";

const findings = findForbiddenReferences();

if (findings.length > 0) {
  console.error("Canonical contract guard failed.");
  console.error("Use root docs/* contracts; do not reference legacy frontend docs paths in implementation files.");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.text}`);
  }
  process.exit(1);
}

console.log("Canonical contract guard passed.");
