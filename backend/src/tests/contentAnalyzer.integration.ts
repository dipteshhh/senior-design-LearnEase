/**
 * Integration test – calls OpenAI via analyzeDocument with a small sample.
 * Requires OPENAI_API_KEY in .env.  Run via:
 *   npm run test:integration
 * Or with debug output:
 *   DEBUG=1 npm run test:integration
 *
 * Skipped automatically unless RUN_INTEGRATION=true (for CI gating).
 */
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

if (process.env.RUN_INTEGRATION !== "true" && !process.env.OPENAI_API_KEY) {
  test("integration tests skipped (set RUN_INTEGRATION=true and OPENAI_API_KEY to run)", { skip: true }, () => {});
  process.exit(0);
}

const { analyzeDocument } = await import("../services/contentAnalyzer.js");
const { StudyGuide: StudyGuideSchema } = await import("../schemas/analyze.js");

const SAMPLE_SYLLABUS = `
Course Syllabus – Introduction to Computer Science (CS 101)
Instructor: Dr. Jane Smith
Office Hours: Monday 2-4 PM, Room 301

Grading:
  Homework: 30%
  Midterm Exam: 30%
  Final Exam: 40%

Course Policies:
  Late submissions will receive a 10% penalty per day.
  Academic integrity violations will be reported.

Learning Outcomes:
  1. Understand fundamental programming concepts.
  2. Apply problem-solving techniques using Python.

Schedule:
  Week 1: Introduction and Setup
  Week 2: Variables and Data Types
  Week 3: Control Flow
`;

test("analyzeDocument returns a valid StudyGuide for a syllabus", async () => {
  let result;
  try {
    result = await analyzeDocument(SAMPLE_SYLLABUS.trim(), "SYLLABUS", {
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    });
  } catch (err: any) {
    if (process.env.DEBUG) {
      console.error("analyzeDocument threw:", err.code, err.message);
      if (err.details?.issues) {
        console.error("Zod issues:", JSON.stringify(err.details.issues, null, 2));
      }
    }
    throw err;
  }

  // Zod parse should succeed
  const parsed = StudyGuideSchema.safeParse(result);
  assert.equal(parsed.success, true, "Result must match StudyGuide schema");

  // Overview sanity checks
  assert.equal(result.overview.document_type, "SYLLABUS");
  assert.ok(result.overview.title.length > 0, "Title should be non-empty");
  assert.ok(result.overview.summary.length > 0, "Summary should be non-empty");

  // Should have extracted some sections
  assert.ok(result.sections.length > 0, "Should have at least one section");

  // Every extraction item citation should be PDF type with page 1
  const allCitations = [
    ...result.key_actions.flatMap((a) => a.citations),
    ...result.checklist.flatMap((c) => c.citations),
    ...result.important_details.dates.flatMap((d) => d.citations),
    ...result.important_details.policies.flatMap((p) => p.citations),
    ...result.important_details.contacts.flatMap((c) => c.citations),
    ...result.important_details.logistics.flatMap((l) => l.citations),
    ...result.sections.flatMap((s) => s.citations),
  ];

  for (const citation of allCitations) {
    assert.equal(citation.source_type, "pdf", "All citations should be PDF type");
    if (citation.source_type === "pdf") {
      assert.equal(citation.page, 1, "Page should be 1 for a single-page doc");
    }
  }

  if (process.env.DEBUG) {
    console.log("✅ StudyGuide overview:", JSON.stringify(result.overview, null, 2));
    console.log(`✅ key_actions: ${result.key_actions.length}`);
    console.log(`✅ checklist: ${result.checklist.length}`);
    console.log(`✅ sections: ${result.sections.length}`);
  }
});
