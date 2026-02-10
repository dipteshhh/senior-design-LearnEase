import { z } from "zod";

// Contract enum from docs/*.md
export const DocumentType = z.enum([
  "HOMEWORK",
  "LECTURE",
  "SYLLABUS",
  "UNSUPPORTED",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const Priority = z.enum(["high", "medium", "low"]);
export type Priority = z.infer<typeof Priority>;

export const AnalyzeDocumentRequest = z.object({
  text: z.string().min(1, "Text is required").max(50000, "Text exceeds maximum length"),
  documentType: DocumentType.optional(),
});
export type AnalyzeDocumentRequest = z.infer<typeof AnalyzeDocumentRequest>;

export const TaskItem = z.object({
  task: z.string(),
  priority: Priority,
  estimatedTime: z.string().optional(),
});
export type TaskItem = z.infer<typeof TaskItem>;

export const Requirements = z.object({
  wordCount: z.string().optional(),
  format: z.string().optional(),
  deadline: z.string().optional(),
  submissionMethod: z.string().optional(),
  otherRequirements: z.array(z.string()).optional(),
});
export type Requirements = z.infer<typeof Requirements>;

export const AcademicIntegrity = z.object({
  isAssignment: z.boolean(),
  guidanceMode: z.boolean(),
  restrictions: z.array(z.string()),
});
export type AcademicIntegrity = z.infer<typeof AcademicIntegrity>;

export const AnalyzeDocumentResponse = z.object({
  documentType: DocumentType,
  overview: z.string(),
  taskBreakdown: z.array(TaskItem),
  requirements: Requirements,
  checklist: z.array(z.string()),
  keyDates: z.array(z.object({
    date: z.string(),
    description: z.string(),
  })),
  academicIntegrity: AcademicIntegrity,
});
export type AnalyzeDocumentResponse = z.infer<typeof AnalyzeDocumentResponse>;
