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

function countTriggers(text: string, triggers: string[]): number {
  const lowerText = text.toLowerCase();
  return triggers.reduce(
    (count, trigger) => count + (lowerText.includes(trigger) ? 1 : 0),
    0
  );
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

export function detectDocumentType(text: string): DetectionResult {
  const normalized = text.trim();
  if (!normalized) {
    return { documentType: "UNSUPPORTED", isAssignment: false };
  }

  // Check negative signals first — reject obvious unsupported content
  if (
    hasAnyTrigger(normalized, UNSUPPORTED_TRIGGERS) ||
    looksLikeAdministrativeAwardEmail(normalized) ||
    looksLikeInsurancePolicyBrochure(normalized) ||
    looksLikeAcademicAdministrativeForm(normalized) ||
    looksLikeProjectStatusReport(normalized) ||
    looksLikeResearchProposal(normalized) ||
    looksLikeTransactionalDocument(normalized)
  ) {
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
