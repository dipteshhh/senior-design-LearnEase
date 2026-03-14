import test from "node:test";
import assert from "node:assert/strict";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const { buildAnalysisPrompt } = await import("../services/contentAnalyzer.js");

test("buildAnalysisPrompt keeps study-guide contract shape in prompt", () => {
  const prompt = buildAnalysisPrompt("HOMEWORK", false, []);

  assert.match(prompt, /important_details: \{ dates: ExtractionItem\[], policies: ExtractionItem\[], contacts: ExtractionItem\[], logistics: ExtractionItem\[] \}/);
  assert.match(prompt, /overview: \{ title, document_type, summary, topic, due_date, estimated_time \}/);
  assert.match(prompt, /When the source document has enough structure\/content, produce at least 3 sections/);
  assert.match(prompt, /not generic placeholders like "Section 1" or "Part 2"/);
});

test("buildAnalysisPrompt adds homework-specific important detail priorities", () => {
  const prompt = buildAnalysisPrompt("HOMEWORK", false, []);

  assert.match(prompt, /Document-type instructions: HOMEWORK/);
  assert.match(prompt, /rubric expectations, grading breakdown, late policy/);
  assert.match(prompt, /allowed file types, naming conventions, final submission format requirements, required tools\/software versions\/programming language\/formatting rules/);
  assert.match(prompt, /Preserve overview\.due_date behavior/);
  assert.match(prompt, /Checklist MUST remain action-oriented and task-oriented/);
  assert.match(prompt, /target at least 3 sections with clear student-readable titles/);
});

test("buildAnalysisPrompt preserves distinction between submission constraints and workflow tools", () => {
  const prompt = buildAnalysisPrompt("HOMEWORK", false, []);

  assert.match(prompt, /Distinguish final submission requirements from allowed workflow tools/);
  assert.match(prompt, /describe that as a final-file\/submission constraint, NOT as a blanket ban on every other tool/);
  assert.match(prompt, /If the document explicitly allows another tool for part of the workflow.*keep that allowance visible/);
  assert.match(prompt, /Do NOT collapse a qualified submission-format rule into a global software prohibition/);
});

test("buildAnalysisPrompt adds lecture study-checklist and class-notes behavior", () => {
  const prompt = buildAnalysisPrompt("LECTURE", false, []);

  assert.match(prompt, /Document-type instructions: LECTURE/);
  assert.match(prompt, /includes class notes\/course notes normalized to LECTURE behavior/);
  assert.match(prompt, /Checklist should be study-oriented, grounded in the source text/);
  assert.match(prompt, /Do NOT default to assignment-style checklist items for lecture output unless the document explicitly contains actionable tasks or exercises/);
  assert.match(prompt, /exam dates, quiz dates, review-session dates/);
  assert.match(prompt, /key definitions, formulas, and named concepts/);
  assert.match(prompt, /target at least 3 sections with clear student-readable titles/);
});

test("buildAnalysisPrompt preserves guidance mode and additional restrictions", () => {
  const prompt = buildAnalysisPrompt("LECTURE", true, [
    "No direct answers to questions",
    "No solved problems or equations",
  ]);

  assert.match(prompt, /GUIDANCE MODE IS ACTIVE/);
  assert.match(prompt, /ADDITIONAL RESTRICTIONS:/);
  assert.match(prompt, /- No direct answers to questions/);
  assert.match(prompt, /- No solved problems or equations/);
});
