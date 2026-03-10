import type { DocumentType } from "../schemas/analyze.js";

export interface DetectionResult {
  documentType: DocumentType;
  isAssignment: boolean;
}

// ── Positive signals (first-match-wins per CLASSIFICATION.md) ───────

const SYLLABUS_TRIGGERS = [
  "syllabus",
  "course policies",
  "grading",
  "office hours",
  "learning outcomes",
];

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

  // First-match-wins order from docs/CLASSIFICATION.md
  if (hasAnyTrigger(normalized, SYLLABUS_TRIGGERS)) {
    return { documentType: "SYLLABUS", isAssignment: false };
  }

  if (hasAnyTrigger(normalized, HOMEWORK_TRIGGERS)) {
    return { documentType: "HOMEWORK", isAssignment: true };
  }

  if (hasAnyTrigger(normalized, LECTURE_TRIGGERS)) {
    return { documentType: "LECTURE", isAssignment: false };
  }

  return { documentType: "UNSUPPORTED", isAssignment: false };
}
