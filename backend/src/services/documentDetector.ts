import type { DocumentType } from "../schemas/analyze.js";

interface DetectionResult {
  documentType: DocumentType;
  confidence: number;
  isAssignment: boolean;
}

const HOMEWORK_TRIGGERS = [
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

const SYLLABUS_TRIGGERS = [
  "syllabus",
  "course policies",
  "grading",
  "office hours",
  "learning outcomes",
];

function countTriggers(text: string, triggers: string[]): number {
  const lowerText = text.toLowerCase();
  return triggers.filter((trigger) => lowerText.includes(trigger)).length;
}

export function detectDocumentType(text: string): DetectionResult {
  const homeworkScore = countTriggers(text, HOMEWORK_TRIGGERS);
  const lectureScore = countTriggers(text, LECTURE_TRIGGERS);
  const syllabusScore = countTriggers(text, SYLLABUS_TRIGGERS);

  const maxScore = Math.max(homeworkScore, lectureScore, syllabusScore);
  const totalTriggers = homeworkScore + lectureScore + syllabusScore;

  let documentType: DocumentType = "UNSUPPORTED";
  let confidence = 0;

  if (totalTriggers === 0) {
    return {
      documentType: "UNSUPPORTED",
      confidence: 0,
      isAssignment: false,
    };
  }

  if (homeworkScore === maxScore && homeworkScore > 0) {
    documentType = "HOMEWORK";
    confidence = homeworkScore / HOMEWORK_TRIGGERS.length;
  } else if (lectureScore === maxScore && lectureScore > 0) {
    documentType = "LECTURE";
    confidence = lectureScore / LECTURE_TRIGGERS.length;
  } else if (syllabusScore === maxScore && syllabusScore > 0) {
    documentType = "SYLLABUS";
    confidence = syllabusScore / SYLLABUS_TRIGGERS.length;
  }

  const isAssignment = documentType === "HOMEWORK" || homeworkScore >= 2;

  return {
    documentType,
    confidence: Math.min(confidence, 1),
    isAssignment,
  };
}
