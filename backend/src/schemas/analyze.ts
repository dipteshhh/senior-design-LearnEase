import { z } from "zod";

// Contract enum from docs/*.md
export const DocumentType = z.enum([
  "HOMEWORK",
  "LECTURE",
  "SYLLABUS",
  "UNSUPPORTED",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const AnalyzeDocumentRequest = z.object({
  text: z.string().min(1, "Text is required").max(50000, "Text exceeds maximum length"),
  documentType: DocumentType.optional(),
});
export type AnalyzeDocumentRequest = z.infer<typeof AnalyzeDocumentRequest>;

export const CitationPdf = z.object({
  source_type: z.literal("pdf"),
  page: z.number().int().positive(),
  excerpt: z.string().min(1),
});

export const CitationDocx = z.object({
  source_type: z.literal("docx"),
  anchor_type: z.literal("paragraph"),
  paragraph: z.number().int().positive(),
  excerpt: z.string().min(1),
});

export const Citation = z.union([CitationPdf, CitationDocx]);
export type Citation = z.infer<typeof Citation>;

export const ExtractionItem = z.object({
  id: z.string(),
  label: z.string().min(1),
  supporting_quote: z.string().min(1),
  citations: z.array(Citation).min(1),
});
export type ExtractionItem = z.infer<typeof ExtractionItem>;

export const StudyGuideOverview = z.object({
  title: z.string(),
  document_type: z.enum(["HOMEWORK", "LECTURE", "SYLLABUS"]),
  summary: z.string(),
});

export const StudyGuideSection = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  citations: z.array(Citation),
});

export const ImportantDetails = z.object({
  dates: z.array(ExtractionItem),
  policies: z.array(ExtractionItem),
  contacts: z.array(ExtractionItem),
  logistics: z.array(ExtractionItem),
});

export const StudyGuide = z.object({
  overview: StudyGuideOverview,
  key_actions: z.array(ExtractionItem),
  checklist: z.array(ExtractionItem),
  important_details: ImportantDetails,
  sections: z.array(StudyGuideSection),
});
export type StudyGuide = z.infer<typeof StudyGuide>;

export const QuizQuestion = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).min(1),
  answer: z.string(),
  supporting_quote: z.string(),
  citations: z.array(Citation).min(1),
});

export const Quiz = z.object({
  document_id: z.string(),
  questions: z.array(QuizQuestion),
});
export type Quiz = z.infer<typeof Quiz>;

export const ErrorPayload = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
});
export type ErrorPayload = z.infer<typeof ErrorPayload>;
