import type { DocumentType } from "../schemas/analyze.js";

export interface DetectionResult {
  documentType: DocumentType;
  isAssignment: boolean;
}

// ── Negative signals: documents that should be rejected at upload ────

const UNSUPPORTED_TRIGGERS = [
  "syllabus",
  "syllabi",
  "resume",
  "curriculum vitae",
  "portfolio",
  "cover letter",
  "letter of recommendation",
  "academic transcript",
  "official transcript",
  "unofficial transcript",
  "transcript key",
  "cumulative gpa",
  "grade points",
  "invoice",
  "invoice number",
  "billing statement",
  "amount due",
  "class schedule",
  "course schedule",
  "semester schedule",
];

// ── Positive signals ─────────────────────────────────────────────────

const HOMEWORK_TRIGGERS = [
  "homework",
  "assignment",
  "problem set",
  "due date",
  "submit",
];

const LECTURE_TRIGGERS = [
  "lecture",
  "learning objectives",
  "slides",
  "topic:",
  "week",
  "module",
  "chapter",
  "class notes",
  "course notes",
  "notes:",
];

function hasAnyTrigger(text: string, triggers: string[]): boolean {
  const lowerText = text.toLowerCase();
  return triggers.some((trigger) => lowerText.includes(trigger));
}

export function detectDocumentType(text: string): DetectionResult {
  const normalized = text.trim();
  if (!normalized) {
    return { documentType: "UNSUPPORTED", isAssignment: false };
  }

  // Check negative signals first — reject obvious unsupported content
  if (hasAnyTrigger(normalized, UNSUPPORTED_TRIGGERS)) {
    return { documentType: "UNSUPPORTED", isAssignment: false };
  }

  if (hasAnyTrigger(normalized, HOMEWORK_TRIGGERS)) {
    return { documentType: "HOMEWORK", isAssignment: true };
  }

  if (hasAnyTrigger(normalized, LECTURE_TRIGGERS)) {
    return { documentType: "LECTURE", isAssignment: false };
  }

  return { documentType: "UNSUPPORTED", isAssignment: false };
}
