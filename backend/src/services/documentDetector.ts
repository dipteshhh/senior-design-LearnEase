import type { DocumentType } from "../schemas/analyze.js";

interface DetectionResult {
  documentType: DocumentType;
  confidence: number;
  isAssignment: boolean;
}

const ASSIGNMENT_TRIGGERS = [
  "solve",
  "calculate",
  "show your work",
  "find the value",
  "prove",
  "derive",
  "write a program",
  "write code",
  "implement",
  "answer the following",
  "homework",
  "assignment",
  "quiz",
  "exam",
  "worksheet",
  "due date",
  "submit",
  "submission",
  "grading",
  "rubric",
  "points",
  "marks",
  "grade",
  "percent",
  "deadline",
  "turn in",
  "complete the following",
  "answer all questions",
];

const LECTURE_TRIGGERS = [
  "lecture",
  "chapter",
  "learning objectives",
  "key concepts",
  "introduction to",
  "overview of",
  "in this module",
  "course material",
  "textbook",
  "reading",
  "slides",
  "presentation",
  "topics covered",
  "summary",
  "review",
];

const NOTES_TRIGGERS = [
  "notes",
  "my notes",
  "class notes",
  "study notes",
  "remember",
  "important points",
  "key takeaways",
  "to study",
  "review for",
];

function countTriggers(text: string, triggers: string[]): number {
  const lowerText = text.toLowerCase();
  return triggers.filter((trigger) => lowerText.includes(trigger)).length;
}

export function detectDocumentType(text: string): DetectionResult {
  const assignmentScore = countTriggers(text, ASSIGNMENT_TRIGGERS);
  const lectureScore = countTriggers(text, LECTURE_TRIGGERS);
  const notesScore = countTriggers(text, NOTES_TRIGGERS);

  const maxScore = Math.max(assignmentScore, lectureScore, notesScore);
  const totalTriggers = assignmentScore + lectureScore + notesScore;

  let documentType: DocumentType = "unknown";
  let confidence = 0;

  if (totalTriggers === 0) {
    return {
      documentType: "unknown",
      confidence: 0,
      isAssignment: false,
    };
  }

  if (assignmentScore === maxScore && assignmentScore > 0) {
    documentType = "assignment";
    confidence = assignmentScore / ASSIGNMENT_TRIGGERS.length;
  } else if (lectureScore === maxScore && lectureScore > 0) {
    documentType = "lecture";
    confidence = lectureScore / LECTURE_TRIGGERS.length;
  } else if (notesScore === maxScore && notesScore > 0) {
    documentType = "notes";
    confidence = notesScore / NOTES_TRIGGERS.length;
  }

  const isAssignment = documentType === "assignment" || assignmentScore >= 2;

  return {
    documentType,
    confidence: Math.min(confidence, 1),
    isAssignment,
  };
}
