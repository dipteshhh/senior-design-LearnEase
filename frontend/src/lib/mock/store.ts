// src/lib/mock/store.ts

export type DocStatus = "READY" | "PROCESSING" | "FAILED";

export type RecentDoc = {
  id: string;
  title: string;
  pages?: number;
  createdAtLabel: string; // UI-friendly label for now
  status: DocStatus;
  progress?: number; // 0-100 when processing
};

export type DocDetail = {
  id: string;
  title: string;
  pages?: number;
  createdAt: string; // ISO string for consistency
  status: DocStatus;
  studyGuide: {
    summary: string;
    keyTakeaways: string[];
    checklist: string[];
  };
};

const MOCK_DOCS: DocDetail[] = [
  {
    id: "advanced-algorithms",
    title: "Advanced Algorithms Assignment.pdf",
    pages: 12,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    status: "READY",
    studyGuide: {
      summary:
        "This assignment focuses on designing efficient algorithms and analyzing time complexity using asymptotic notation. The main goal is to justify correctness and performance for each solution.",
      keyTakeaways: [
        "Identify the correct algorithmic paradigm (greedy, DP, divide & conquer).",
        "State assumptions clearly before proving correctness.",
        "Compare time/space complexity across approaches.",
      ],
      checklist: [
        "Read the full problem statement first (no skipping).",
        "Write inputs/outputs and constraints for each question.",
        "Provide correctness argument (in words) for each solution.",
        "Compute Big-O time complexity for each approach.",
        "Double-check edge cases and include examples.",
      ],
    },
  },
  {
    id: "ml-lecture-5",
    title: "Machine Learning Lecture 5.pptx",
    pages: 45,
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    status: "READY",
    studyGuide: {
      summary:
        "This lecture introduces model evaluation and overfitting, including train/validation/test splits, bias-variance tradeoff, and common metrics.",
      keyTakeaways: [
        "Overfitting happens when a model memorizes noise.",
        "Use validation sets or cross-validation for tuning.",
        "Choose metrics that match the real objective.",
      ],
      checklist: [
        "Define the metric (accuracy, F1, MSE, etc.).",
        "Use a baseline model for comparison.",
        "Tune hyperparameters with validation, not the test set.",
        "Report results clearly with a short interpretation.",
      ],
    },
  },
  {
    id: "research-methods",
    title: "Research Methods Project Guidelines.pdf",
    pages: 8,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: "PROCESSING",
    studyGuide: {
      summary:
        "This document is currently processing. Once ready, the study guide will appear here.",
      keyTakeaways: ["Processing…"],
      checklist: ["Processing…"],
    },
  },
  {
    id: "db-final",
    title: "Database Systems Final Project.pdf",
    pages: 18,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: "READY",
    studyGuide: {
      summary:
        "This project emphasizes schema design, normalization, and building correct SQL queries with clear assumptions and constraints.",
      keyTakeaways: [
        "Normalize to reduce redundancy (up to 3NF when appropriate).",
        "Use JOINs intentionally and watch for duplicates.",
        "Validate queries with small test datasets.",
      ],
      checklist: [
        "Create ER diagram + relational schema.",
        "List constraints and keys (PK/FK).",
        "Write core queries and test against sample data.",
        "Explain each query in one sentence (what it returns).",
      ],
    },
  },
];

export function getRecentDocuments(): RecentDoc[] {
  return [
    {
      id: "advanced-algorithms",
      title: "Advanced Algorithms Assignment.pdf",
      pages: 12,
      createdAtLabel: "2 hours ago",
      status: "READY",
    },
    {
      id: "ml-lecture-5",
      title: "Machine Learning Lecture 5.pptx",
      pages: 45,
      createdAtLabel: "Yesterday",
      status: "READY",
    },
    {
      id: "research-methods",
      title: "Research Methods Project Guidelines.pdf",
      pages: 8,
      createdAtLabel: "5 minutes ago",
      status: "PROCESSING",
      progress: 40,
    },
    {
      id: "db-final",
      title: "Database Systems Final Project.pdf",
      pages: 18,
      createdAtLabel: "3 days ago",
      status: "READY",
    },
  ];
}

export function getDocumentById(id: string): DocDetail | undefined {
  return MOCK_DOCS.find((d) => d.id === id);
}

export function getQuizByDocumentId(id: string) {
  const doc = getDocumentById(id);

  // Basic fallback quiz if doc doesn't exist yet
  if (!doc) {
    return {
      documentId: id,
      title: `Quiz for ${id}`,
      questions: [
        {
          id: "q1",
          prompt: "This is a placeholder quiz question.",
          choices: ["Choice A", "Choice B", "Choice C", "Choice D"],
          answerIndex: 0,
          explanation: "Mock explanation. Replace with backend-generated quiz later.",
        },
      ],
    };
  }

  const takeaways = doc.studyGuide?.keyTakeaways ?? [];
  const questions =
    takeaways.length > 0
      ? takeaways.slice(0, 3).map((t, idx) => ({
          id: `q${idx + 1}`,
          prompt: `Which statement best matches this key takeaway?\n\n"${t}"`,
          choices: [t, "Unrelated option", "Opposite idea", "Random detail"],
          answerIndex: 0,
          explanation:
            "This is mock quiz generation from the study guide. Later, backend will generate better questions.",
        }))
      : [
          {
            id: "q1",
            prompt: "What is the main idea of this document?",
            choices: ["Mock answer A", "Mock answer B", "Mock answer C", "Mock answer D"],
            answerIndex: 0,
            explanation: "Mock explanation. Later, backend output will replace this.",
          },
        ];

  return {
    documentId: doc.id,
    title: `Quiz: ${doc.title}`,
    questions,
  };
}
