export type DocumentType = "HOMEWORK" | "LECTURE" | "SYLLABUS" | "UNSUPPORTED";
export type DocumentStatus = "uploaded" | "processing" | "ready" | "failed";
export type GenerationStatus = "idle" | "processing" | "ready" | "failed";

export interface DocumentListItem {
  id: string;
  filename: string;
  document_type: DocumentType;
  status: DocumentStatus;
  study_guide_status: GenerationStatus;
  quiz_status: GenerationStatus;
  page_count: number;
  uploaded_at: string;
  error_code: string | null;
  error_message: string | null;
  has_study_guide: boolean;
  has_quiz: boolean;
}

export interface CitationPdf {
  source_type: "pdf";
  page: number;
  excerpt: string;
}

export interface CitationDocx {
  source_type: "docx";
  anchor_type: "paragraph";
  paragraph: number;
  excerpt: string;
}

export type Citation = CitationPdf | CitationDocx;

export interface ExtractionItem {
  id: string;
  label: string;
  supporting_quote: string;
  citations: Citation[];
}

export interface StudyGuideSection {
  id: string;
  title: string;
  content: string;
  citations: Citation[];
}

export interface StudyGuide {
  overview: {
    title: string;
    document_type: Exclude<DocumentType, "UNSUPPORTED">;
    summary: string;
  };
  key_actions: ExtractionItem[];
  checklist: ExtractionItem[];
  important_details: {
    dates: ExtractionItem[];
    policies: ExtractionItem[];
    contacts: ExtractionItem[];
    logistics: ExtractionItem[];
  };
  sections: StudyGuideSection[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string;
  supporting_quote: string;
  citations: Citation[];
}

export interface Quiz {
  document_id: string;
  questions: QuizQuestion[];
}

export interface StudyGuideResponse extends StudyGuide {
  checklist_completion: Record<string, boolean>;
}

export interface DocumentDetail {
  document: DocumentListItem;
  studyGuide: StudyGuide | null;
  checklistCompletion: Record<string, boolean>;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface AuthMeResponse {
  user: AuthUser;
}
