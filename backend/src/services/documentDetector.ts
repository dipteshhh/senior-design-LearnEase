import type { DocumentType } from "../schemas/analyze.js";

export interface DetectionResult {
  documentType: DocumentType;
  isAssignment: boolean;
}

// ── Unsupported document profiles ────────────────────────────────────

const HARD_UNSUPPORTED_TRIGGERS = [
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
  "invoice number",
  "billing statement",
  "amount due",
];

const SYLLABUS_TRIGGERS = ["syllabus", "syllabi"];

const SYLLABUS_STRUCTURE_TRIGGERS = [
  "grading policy",
  "attendance policy",
  "late work",
  "catalog description",
  "learning outcomes",
  "course schedule",
];

const SCHEDULE_DOCUMENT_TRIGGERS = [
  "class schedule",
  "course schedule",
  "semester schedule",
];

const OUT_OF_SCOPE_ACADEMIC_DOC_TRIGGERS = [
  "project report",
  "research paper",
  "lab report",
  "technical report",
];

const ADMIN_EMAIL_HEADER_TRIGGERS = [
  "from:",
  "subject:",
  "date:",
  "to:",
];

const ADMIN_AWARD_TRIGGERS = [
  "financial support",
  "award details",
  "award amount",
  "accept your award",
  "awarded amount",
  "award allocation",
  "award sponsorship",
  "application portal",
  "student awards",
  "disbursement",
  "tuition payout",
  "paid directly to your institution",
  "support team",
];

const INSURANCE_POLICY_TRIGGERS = [
  "international student health insurance",
  "health insurance",
  "claims information",
  "policy benefits",
  "policy pricing",
  "policy exclusions",
  "description of coverage",
  "contract of insurance",
  "deductible",
  "copayment",
  "copayments",
  "coinsurance",
  "coverage",
  "plan participant",
  "id card",
  "enrollment eligibility",
  "cancellation/refunds",
  "claim form",
  "explanation of benefits",
];

const ACADEMIC_ADMIN_FORM_TRIGGERS = [
  "approval form",
  "research co-op approval form",
  "statement of expectations",
  "co-op semester",
  "start date",
  "end date",
  "supervisor/professor",
  "supervisor/professor name",
  "institution name",
  "department name",
  "faculty signature",
  "student signature",
  "work authorization",
  "cpt approval",
  "gradleaders",
  "offer letter",
  "co-op course",
  "research co-op",
];

const PROJECT_STATUS_REPORT_TRIGGERS = [
  "weekly progress report",
  "project status summary",
  "individual contributions",
  "next week's smart goals",
  "smart goals",
  "action/task plan",
  "open issues, risks, change requests",
  "change requests",
  "milestones and deliverables",
  "milestone/deliverable",
  "project faculty advisor",
  "faculty advisor",
  "team member names",
  "status note",
  "percentage completed",
];

const RESEARCH_PROPOSAL_TRIGGERS = [
  "research proposal",
  "project proposal",
  "research objectives",
  "scope of work",
  "proposed datasets",
  "methodology",
  "timeline & milestones",
  "timeline and milestones",
  "expected outcomes",
  "faculty supervisor",
  "proposed faculty supervisor",
  "faculty supervisor role",
  "student responsibilities",
  "co-op period",
  "time commitment",
  "introduction & motivation",
];

const TRANSACTIONAL_DOCUMENT_TRIGGERS = [
  "rental agreement",
  "rental car agreement",
  "rental record",
  "receipt",
  "invoice",
  "total estimated charge",
  "total charge",
  "credit card authorization",
  "service charges/taxes",
  "service charges",
  "taxable charges",
  "rental rate",
  "per day",
  "booking confirmation",
  "travel confirmation",
  "rental location",
  "return location",
  "rental time",
  "return time",
  "vehicle:",
];

// ── Supported document profiles ─────────────────────────────────────

const HOMEWORK_CORE_TRIGGERS = [
  "homework",
  "assignment",
  "problem set",
];

const HOMEWORK_SUBMISSION_TRIGGERS = [
  "submit",
  "submission",
  "submitted",
  "upload",
  "turn in",
];

const HOMEWORK_FORMAT_TRIGGERS = [
  ".pdf",
  ".docx",
  ".doc",
  ".zip",
  ".7z",
  "file format",
  "hardcopy",
  "typed",
  "max points",
  "points",
];

const HOMEWORK_DELIVERABLE_TRIGGERS = [
  "question 1",
  "question 2",
  "problem 1",
  "problem 2",
  "exercise 1",
  "exercise 2",
  "requirements:",
  "write a function",
  "implement",
  "your solution should",
];

const HOMEWORK_DUE_TRIGGERS = [
  "due date",
  "deadline",
];

const LECTURE_CORE_TRIGGERS = [
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

const LECTURE_DECK_SUPPORT_TRIGGERS = [
  "course introduction",
  "chapter objectives",
  "continued next slide",
  "you should be able to",
  "my lectures",
  "lectures in",
  "textbook",
  "agenda",
  "before we start",
  "concept",
  "overview",
  "learning goal",
];

function hasAnyTrigger(text: string, triggers: string[]): boolean {
  const lowerText = text.toLowerCase();
  return triggers.some((trigger) => lowerText.includes(trigger));
}

function countTriggers(text: string, triggers: string[]): number {
  const lowerText = text.toLowerCase();
  return triggers.reduce(
    (count, trigger) => count + (lowerText.includes(trigger) ? 1 : 0),
    0
  );
}

function countPattern(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function countBulletLikeMarkers(text: string): number {
  return countPattern(text, /[•▪○]/g);
}

function scoreLectureProfile(text: string): number {
  const lowerText = text.toLowerCase();
  const lectureTriggerCount = countTriggers(lowerText, LECTURE_CORE_TRIGGERS);
  const lectureDeckSupportCount = countTriggers(lowerText, LECTURE_DECK_SUPPORT_TRIGGERS);
  const hasLectureSessionAnchor = /\blecture\s+\d+[a-z]?\b/.test(lowerText);
  const hasChapterAnchor = /\bchapter\s+\d+[a-z]?\b/.test(lowerText);
  const objectiveMentions = countPattern(lowerText, /\b(?:objective|objectives|agenda)\b/g);
  const repeatedLectureMentions = countPattern(lowerText, /\blecture\b/g);
  const repeatedChapterMentions = countPattern(lowerText, /\bchapter\b/g);
  const bulletMarkers = countBulletLikeMarkers(text);

  let score = lectureTriggerCount;
  if (hasLectureSessionAnchor) score += 4;
  if (hasChapterAnchor) score += 2;
  if (objectiveMentions >= 1) score += 2;
  if (objectiveMentions >= 2) score += 1;
  if (lectureDeckSupportCount >= 1) score += 2;
  if (lectureDeckSupportCount >= 3) score += 1;
  if (repeatedLectureMentions >= 3) score += 2;
  if (repeatedChapterMentions >= 2) score += 1;
  if (bulletMarkers >= 8) score += 2;
  if (bulletMarkers >= 20) score += 1;
  if (lowerText.includes("lecture slides")) score += 2;
  if (lowerText.includes("continued next slide")) score += 2;
  return score;
}

function scoreHomeworkProfile(text: string): number {
  const lowerText = text.toLowerCase();
  const coreMatches = countTriggers(lowerText, HOMEWORK_CORE_TRIGGERS);
  const submissionMatches = countTriggers(lowerText, HOMEWORK_SUBMISSION_TRIGGERS);
  const formatMatches = countTriggers(lowerText, HOMEWORK_FORMAT_TRIGGERS);
  const deliverableMatches = countTriggers(lowerText, HOMEWORK_DELIVERABLE_TRIGGERS);
  const dueMatches =
    countTriggers(lowerText, HOMEWORK_DUE_TRIGGERS) +
    countPattern(lowerText, /\bdue\s*:/g);
  const hasHomeworkTitleAnchor =
    /(?:^|\n)\s*(?:homework|assignment|problem set)\b/m.test(lowerText);
  const numberedAssignmentMentions = countPattern(
    lowerText,
    /\b(?:assignment|homework|problem set)\s*(?:#?\d+[a-z]?|[ivxlcdm]+)\b/g
  );
  const numberedProblemMentions = countPattern(
    lowerText,
    /\b(?:question|problem|exercise)\s+\d+\b/g
  );

  let score = 0;
  score += coreMatches * 2;
  score += Math.min(submissionMatches, 2) * 2;
  score += Math.min(dueMatches, 2) * 2;
  score += Math.min(formatMatches, 2);
  score += Math.min(deliverableMatches, 3);
  if (hasHomeworkTitleAnchor) score += 2;
  if (numberedAssignmentMentions >= 1) score += 2;
  if (numberedProblemMentions >= 2) score += 2;
  if (lowerText.includes("max points")) score += 1;

  // Reject generic mentions of assignments/homework inside other document types.
  if (
    !hasHomeworkTitleAnchor &&
    numberedAssignmentMentions === 0 &&
    numberedProblemMentions === 0 &&
    formatMatches === 0 &&
    deliverableMatches < 2
  ) {
    score = Math.min(score, 5);
  }

  return score;
}

function looksLikeSyllabusDocument(text: string): boolean {
  const lowerText = text.toLowerCase();
  const hasSyllabusAnchor = hasAnyTrigger(lowerText, SYLLABUS_TRIGGERS);
  const hasCourseSyllabusAnchor = lowerText.includes("course syllabus");
  const structureMatches = countTriggers(lowerText, SYLLABUS_STRUCTURE_TRIGGERS);

  if (!hasSyllabusAnchor) {
    return false;
  }

  if (hasCourseSyllabusAnchor && structureMatches >= 1) {
    return true;
  }

  return structureMatches >= 2;
}

function looksLikeStandaloneScheduleDocument(text: string): boolean {
  return hasAnyTrigger(text, SCHEDULE_DOCUMENT_TRIGGERS);
}

function looksLikeOutOfScopeAcademicDocument(text: string): boolean {
  const lowerText = text.toLowerCase();
  const outOfScopeMatches = countTriggers(lowerText, OUT_OF_SCOPE_ACADEMIC_DOC_TRIGGERS);

  if (lowerText.includes("research paper")) {
    return true;
  }

  if (lowerText.includes("lab report")) {
    return true;
  }

  if (
    lowerText.includes("project report") &&
    (lowerText.includes("submit") ||
      lowerText.includes("due date") ||
      lowerText.includes("results") ||
      lowerText.includes("analysis"))
  ) {
    return true;
  }

  return outOfScopeMatches >= 2;
}

function looksLikeAdministrativeAwardEmail(text: string): boolean {
  const headerMatches = countTriggers(text, ADMIN_EMAIL_HEADER_TRIGGERS);
  const awardMatches = countTriggers(text, ADMIN_AWARD_TRIGGERS);

  if (headerMatches >= 3 && awardMatches >= 1) {
    return true;
  }

  if (awardMatches >= 2 && text.toLowerCase().includes("approved")) {
    return true;
  }

  return false;
}

function looksLikeInsurancePolicyBrochure(text: string): boolean {
  const lowerText = text.toLowerCase();
  const insuranceMatches = countTriggers(lowerText, INSURANCE_POLICY_TRIGGERS);
  const hasInsuranceAnchor =
    lowerText.includes("insurance") ||
    lowerText.includes("policy") ||
    lowerText.includes("coverage");

  if (lowerText.includes("international student health insurance")) {
    return true;
  }

  if (
    hasInsuranceAnchor &&
    (lowerText.includes("policy benefits") ||
      lowerText.includes("policy pricing") ||
      lowerText.includes("policy exclusions"))
  ) {
    return true;
  }

  if (
    lowerText.includes("claims information") &&
    (lowerText.includes("deductible") ||
      lowerText.includes("copayment") ||
      lowerText.includes("copayments") ||
      lowerText.includes("coinsurance") ||
      lowerText.includes("plan participant"))
  ) {
    return true;
  }

  return insuranceMatches >= 4;
}

function looksLikeAcademicAdministrativeForm(text: string): boolean {
  const lowerText = text.toLowerCase();
  const adminFormMatches = countTriggers(lowerText, ACADEMIC_ADMIN_FORM_TRIGGERS);

  if (lowerText.includes("research co-op approval form")) {
    return true;
  }

  if (
    lowerText.includes("approval form") &&
    (lowerText.includes("statement of expectations") ||
      lowerText.includes("faculty signature") ||
      lowerText.includes("student signature"))
  ) {
    return true;
  }

  if (
    (lowerText.includes("start date") && lowerText.includes("end date")) &&
    (lowerText.includes("supervisor/professor") ||
      lowerText.includes("institution name") ||
      lowerText.includes("department name"))
  ) {
    return true;
  }

  if (
    (lowerText.includes("gradleaders") ||
      lowerText.includes("cpt approval") ||
      lowerText.includes("work authorization")) &&
    (lowerText.includes("signature") || lowerText.includes("co-op"))
  ) {
    return true;
  }

  return adminFormMatches >= 4;
}

function looksLikeProjectStatusReport(text: string): boolean {
  const lowerText = text.toLowerCase();
  const reportMatches = countTriggers(lowerText, PROJECT_STATUS_REPORT_TRIGGERS);

  if (lowerText.includes("weekly progress report")) {
    return true;
  }

  if (
    lowerText.includes("project status summary") &&
    (lowerText.includes("individual contributions") ||
      lowerText.includes("smart goals") ||
      lowerText.includes("action/task plan"))
  ) {
    return true;
  }

  if (
    lowerText.includes("milestones and deliverables") &&
    (lowerText.includes("open issues, risks, change requests") ||
      lowerText.includes("faculty advisor") ||
      lowerText.includes("percentage completed"))
  ) {
    return true;
  }

  return reportMatches >= 4;
}

function looksLikeResearchProposal(text: string): boolean {
  const lowerText = text.toLowerCase();
  const proposalMatches = countTriggers(lowerText, RESEARCH_PROPOSAL_TRIGGERS);

  if (lowerText.includes("research proposal")) {
    return true;
  }

  if (
    (lowerText.includes("research objectives") ||
      lowerText.includes("scope of work")) &&
    (lowerText.includes("methodology") ||
      lowerText.includes("proposed datasets") ||
      lowerText.includes("expected outcomes"))
  ) {
    return true;
  }

  if (
    (lowerText.includes("timeline & milestones") ||
      lowerText.includes("timeline and milestones")) &&
    (lowerText.includes("faculty supervisor") ||
      lowerText.includes("student responsibilities") ||
      lowerText.includes("co-op period"))
  ) {
    return true;
  }

  return proposalMatches >= 4;
}

function looksLikeTransactionalDocument(text: string): boolean {
  const lowerText = text.toLowerCase();
  const transactionalMatches = countTriggers(lowerText, TRANSACTIONAL_DOCUMENT_TRIGGERS);

  if (
    lowerText.includes("rental agreement") ||
    lowerText.includes("rental car agreement")
  ) {
    return true;
  }

  if (
    (lowerText.includes("rental record") || lowerText.includes("booking confirmation")) &&
    (lowerText.includes("total estimated charge") ||
      lowerText.includes("credit card authorization") ||
      lowerText.includes("rental rate"))
  ) {
    return true;
  }

  if (
    lowerText.includes("service charges") &&
    (lowerText.includes("tax") ||
      lowerText.includes("total charge") ||
      lowerText.includes("credit card authorization"))
  ) {
    return true;
  }

  return transactionalMatches >= 4;
}

function scoreUnsupportedProfile(text: string): number {
  const lowerText = text.toLowerCase();
  const hardUnsupportedMatches = countTriggers(lowerText, HARD_UNSUPPORTED_TRIGGERS);
  const syllabusDocument = looksLikeSyllabusDocument(lowerText);
  const standaloneScheduleDocument = looksLikeStandaloneScheduleDocument(lowerText);
  const outOfScopeAcademicDocument = looksLikeOutOfScopeAcademicDocument(lowerText);
  const administrativeAwardEmail = looksLikeAdministrativeAwardEmail(lowerText);
  const insurancePolicyBrochure = looksLikeInsurancePolicyBrochure(lowerText);
  const academicAdministrativeForm = looksLikeAcademicAdministrativeForm(lowerText);
  const projectStatusReport = looksLikeProjectStatusReport(lowerText);
  const researchProposal = looksLikeResearchProposal(lowerText);
  const transactionalDocument = looksLikeTransactionalDocument(lowerText);
  const hasStrongUnsupportedProfile =
    syllabusDocument ||
    standaloneScheduleDocument ||
    outOfScopeAcademicDocument ||
    administrativeAwardEmail ||
    insurancePolicyBrochure ||
    academicAdministrativeForm ||
    projectStatusReport ||
    researchProposal ||
    transactionalDocument;
  let score = 0;

  if (hardUnsupportedMatches >= 2) {
    score += 8;
  } else if (hardUnsupportedMatches === 1) {
    score += hasStrongUnsupportedProfile ? 8 : 3;
  }

  if (syllabusDocument) {
    score += 7;
  }

  if (standaloneScheduleDocument) {
    score += 7;
  }

  if (outOfScopeAcademicDocument) {
    score += 7;
  }

  if (administrativeAwardEmail) {
    score += 8;
  }

  if (insurancePolicyBrochure) {
    score += 8;
  }

  if (academicAdministrativeForm) {
    score += 8;
  }

  if (projectStatusReport) {
    score += 8;
  }

  if (researchProposal) {
    score += 8;
  }

  if (transactionalDocument) {
    score += 8;
  }

  return score;
}

export function detectDocumentType(text: string): DetectionResult {
  const normalized = text.trim();
  if (!normalized) {
    return { documentType: "UNSUPPORTED", isAssignment: false };
  }

  const lectureScore = scoreLectureProfile(normalized);
  const homeworkScore = scoreHomeworkProfile(normalized);
  const unsupportedScore = scoreUnsupportedProfile(normalized);

  // Priority order:
  // 1. Strong lecture decks
  // 2. Strong homework assignments
  // 3. Strong unsupported/out-of-scope documents
  // 4. Conservative fallback based on the highest remaining score
  if (lectureScore >= 8 && lectureScore >= homeworkScore + 2 && lectureScore >= unsupportedScore - 1) {
    return { documentType: "LECTURE", isAssignment: false };
  }

  if (homeworkScore >= 8 && homeworkScore >= lectureScore && homeworkScore >= unsupportedScore + 2) {
    return { documentType: "HOMEWORK", isAssignment: true };
  }

  if (
    unsupportedScore >= 7 &&
    lectureScore < 8 &&
    homeworkScore < unsupportedScore + 3
  ) {
    return { documentType: "UNSUPPORTED", isAssignment: false };
  }

  if (lectureScore >= 5 && lectureScore >= homeworkScore && lectureScore > unsupportedScore) {
    return { documentType: "LECTURE", isAssignment: false };
  }

  if (homeworkScore >= 6 && unsupportedScore <= 4) {
    return { documentType: "HOMEWORK", isAssignment: true };
  }

  if (countTriggers(normalized, LECTURE_CORE_TRIGGERS) >= 1 && unsupportedScore === 0) {
    return { documentType: "LECTURE", isAssignment: false };
  }

  return { documentType: "UNSUPPORTED", isAssignment: false };
}
