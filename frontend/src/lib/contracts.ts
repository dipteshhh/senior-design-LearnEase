export type DocumentStatus = "READY" | "PROCESSING" | "FAILED";

export interface DocumentListItem {
  id: string;
  title: string;
  status: DocumentStatus;
  pages?: number;
  createdAtLabel: string; // list view label
  progress?: number;
}

export interface DocumentDetail extends Omit<DocumentListItem, "createdAtLabel"> {
  createdAt: string; // ISO string from mock/backend
  content?: string;

  studyGuide: {
    summary: string;
    keyTakeaways: string[];
    checklist: string[];
  };

  // Optional future fields (safe placeholders for now)
  topic?: string;
  dueDate?: string; // ISO or label
  estimatedTime?: string;
}

export interface Quiz {
  questions: {
    id: string;
    question: string;
    options: string[];
    answer: number;
  }[];
}
