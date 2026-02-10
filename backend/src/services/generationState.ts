import type { DocumentStatus } from "../store/memoryStore.js";

export type GenerationFlow = "STUDY_GUIDE" | "QUIZ";

export const FLOW_PROCESSING_CODE: Record<GenerationFlow, string> = {
  STUDY_GUIDE: "STUDY_GUIDE_PROCESSING",
  QUIZ: "QUIZ_PROCESSING",
};

export function makeFlowFailureCode(flow: GenerationFlow, code: string): string {
  return `${flow}:${code}`;
}

export function isFlowProcessing(
  status: DocumentStatus,
  errorCode: string | null,
  flow: GenerationFlow
): boolean {
  if (status !== "processing") return false;
  if (!errorCode) return true;
  return errorCode === FLOW_PROCESSING_CODE[flow];
}

export function isFlowFailed(
  status: DocumentStatus,
  errorCode: string | null,
  flow: GenerationFlow
): boolean {
  if (status !== "failed") return false;
  if (!errorCode) return false;
  return errorCode.startsWith(`${flow}:`);
}

