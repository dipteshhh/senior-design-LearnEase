import type { DocumentType } from "../schemas/analyze.js";

export interface DocumentPolicy {
  allowedOutputs: ("overview" | "tasks" | "checklist" | "requirements")[];
  guidanceMode: boolean;
  restrictions: string[];
}

const policies: Record<DocumentType, DocumentPolicy> = {
  HOMEWORK: {
    allowedOutputs: ["overview", "tasks", "checklist", "requirements"],
    guidanceMode: true,
    restrictions: [
      "No direct answers to questions",
      "No solved problems or equations",
      "No completed code solutions",
      "No essay content generation",
    ],
  },
  LECTURE: {
    allowedOutputs: ["overview", "tasks", "checklist", "requirements"],
    guidanceMode: false,
    restrictions: [],
  },
  SYLLABUS: {
    allowedOutputs: ["overview", "tasks", "checklist", "requirements"],
    guidanceMode: false,
    restrictions: [],
  },
  UNSUPPORTED: {
    allowedOutputs: ["overview"],
    guidanceMode: true,
    restrictions: ["Guidance only until document type confirmed"],
  },
};

export function getPolicy(documentType: DocumentType): DocumentPolicy {
  return policies[documentType];
}

export function shouldEnableGuidanceMode(
  documentType: DocumentType,
  isAssignment: boolean
): boolean {
  if (isAssignment) return true;
  if (documentType === "UNSUPPORTED") return true;
  return policies[documentType].guidanceMode;
}

export function getRestrictions(
  documentType: DocumentType,
  guidanceMode: boolean
): string[] {
  const baseRestrictions = policies[documentType].restrictions;
  
  if (guidanceMode && documentType !== "HOMEWORK") {
    return [
      ...baseRestrictions,
      "Operating in guidance mode - providing learning support only",
    ];
  }
  
  return baseRestrictions;
}
