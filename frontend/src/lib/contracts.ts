export type DocumentStatus = "READY" | "PROCESSING" | "FAILED";

export interface DocumentListItem {
  id: string;
  title: string;
  status: DocumentStatus;
  pages?: number;
  createdAtLabel: string;
  progress?: number;
}

export interface DocumentDetail extends DocumentListItem {
  content?: string;
}

export interface Quiz {
  questions: {
    id: string;
    question: string;
    options: string[];
    answer: number;
  }[];
}
