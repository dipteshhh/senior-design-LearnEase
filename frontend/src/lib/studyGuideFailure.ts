import type { DocumentListItem } from "./contracts.ts";

export type StudyGuideFailureKind =
  | "unsupported"
  | "validation"
  | "guardrails"
  | "interrupted"
  | "provider"
  | "unknown";

interface StudyGuideFailureUi {
  heading: string;
  description: string;
  statusLine: string;
  progressLabel: string;
}

type StudyGuideFailureDocument = Pick<
  DocumentListItem,
  "study_guide_status" | "error_code" | "error_message"
>;

const VALIDATION_FAILURE_CODES = new Set([
  "SCHEMA_VALIDATION_FAILED",
  "QUOTE_NOT_FOUND",
  "CITATION_EXCERPT_NOT_FOUND",
  "CITATION_OUT_OF_RANGE",
]);

export function getStudyGuideFailureKind(
  document: StudyGuideFailureDocument | null
): StudyGuideFailureKind | null {
  if (!document || document.study_guide_status !== "failed") {
    return null;
  }

  if (document.error_code === "DOCUMENT_UNSUPPORTED") {
    return "unsupported";
  }

  if (document.error_code && VALIDATION_FAILURE_CODES.has(document.error_code)) {
    return "validation";
  }

  switch (document.error_code) {
    case "ACADEMIC_INTEGRITY_VIOLATION":
      return "guardrails";
    case "GENERATION_INTERRUPTED":
      return "interrupted";
    case "GENERATION_FAILED":
      return "provider";
    default:
      return "unknown";
  }
}

export function getStudyGuideFailureMessage(
  document: StudyGuideFailureDocument | null
): string | null {
  const kind = getStudyGuideFailureKind(document);
  if (!kind) {
    return null;
  }

  if (kind === "unsupported") {
    return "This document type is not supported for study guide generation.";
  }

  return document?.error_message ?? "Study guide generation failed.";
}

export function getStudyGuideFailureUi(
  document: StudyGuideFailureDocument | null
): StudyGuideFailureUi | null {
  switch (getStudyGuideFailureKind(document)) {
    case "unsupported":
      return {
        heading: "Document not supported",
        description:
          "This document type is not supported for study guide generation. Please upload a different document.",
        statusLine: "This document type is not supported.",
        progressLabel: "Unsupported document",
      };
    case "validation":
      return {
        heading: "We couldn’t validate the study guide",
        description:
          "The generated study guide did not pass schema or grounding checks. You can retry now or return to your dashboard.",
        statusLine: "Generated output failed validation.",
        progressLabel: "Validation failed",
      };
    case "guardrails":
      return {
        heading: "Study guide blocked by guardrails",
        description:
          "The generated study guide crossed academic-integrity guardrails. You can retry now or return to your dashboard.",
        statusLine: "Generated output violated academic integrity guardrails.",
        progressLabel: "Guardrails blocked output",
      };
    case "interrupted":
      return {
        heading: "Study guide generation was interrupted",
        description:
          "Generation was interrupted before completion. You can retry now or return to your dashboard.",
        statusLine: "Generation was interrupted before completion.",
        progressLabel: "Generation interrupted",
      };
    case "provider":
      return {
        heading: "We couldn’t complete the study guide request",
        description:
          "The backend could not complete the study guide request. This is usually temporary. You can retry now or return to your dashboard.",
        statusLine: "The backend request failed.",
        progressLabel: "Backend request failed",
      };
    case "unknown":
      return {
        heading: "We couldn’t finish the study guide",
        description:
          "Study guide generation failed. You can retry now or return to your dashboard.",
        statusLine: "Study guide generation failed.",
        progressLabel: "Generation failed",
      };
    default:
      return null;
  }
}
