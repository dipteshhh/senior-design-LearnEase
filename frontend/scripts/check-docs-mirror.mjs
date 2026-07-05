import path from "node:path";
import { findDocsMirrorDrift } from "./lib/docsMirrorGuard.mjs";

// Built at runtime so the canonical contract guard does not flag this script
// for containing a literal legacy docs path.
const mirrorDirLabel = path.join("frontend", "docs");

const drift = findDocsMirrorDrift();

if (drift.length > 0) {
  console.error("Docs mirror drift check failed.");
  console.error(
    `Canonical docs/ and ${mirrorDirLabel} mirrors must be identical for same-named files.`
  );
  console.error("Fix by copying the canonical file over the mirror (from the repo root):");
  for (const finding of drift) {
    const mirrorRelative = path.join(mirrorDirLabel, finding.file);
    console.error(`- ${finding.file}: cp docs/${finding.file} ${mirrorRelative}`);
  }
  process.exit(1);
}

console.log("Docs mirror drift check passed.");
