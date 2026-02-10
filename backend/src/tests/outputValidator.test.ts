import test from "node:test";
import assert from "node:assert/strict";
import type { StudyGuide } from "../schemas/analyze.js";
import {
  ContractValidationError,
  normalizeDocumentText,
  validateStudyGuideAgainstDocument,
} from "../services/outputValidator.js";

const BASE_STUDY_GUIDE: StudyGuide = {
  overview: {
    title: "Week 1 Lecture",
    document_type: "LECTURE",
    summary: "Intro content.",
  },
  key_actions: [
    {
      id: "a1",
      label: "Review the schedule",
      supporting_quote: "Review the weekly schedule before class.",
      citations: [
        { source_type: "pdf", page: 1, excerpt: "Review the weekly schedule before class." },
      ],
    },
  ],
  checklist: [],
  important_details: {
    dates: [],
    policies: [],
    contacts: [],
    logistics: [],
  },
  sections: [
    {
      id: "s1",
      title: "Overview",
      content: "Lecture intro.",
      citations: [{ source_type: "pdf", page: 1, excerpt: "Review the weekly schedule before class." }],
    },
  ],
};

test("normalizeDocumentText applies quote/whitespace/pdf hyphenation normalization", () => {
  const raw = "Review “the” weekly exam-\nple  schedule.\u00AD";
  const normalized = normalizeDocumentText(raw, "PDF");
  assert.equal(normalized, 'Review "the" weekly example schedule.');
});

test("validateStudyGuideAgainstDocument passes for grounded quotes and citations", () => {
  const text = "Review the weekly schedule before class.";
  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(BASE_STUDY_GUIDE, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument rejects missing supporting quote", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: "This quote does not exist.",
      },
    ],
  };

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(invalid, {
        text: "Review the weekly schedule before class.",
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "QUOTE_NOT_FOUND");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument rejects citation range violations", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        citations: [
          { source_type: "pdf", page: 9, excerpt: "Review the weekly schedule before class." },
        ],
      },
    ],
  };

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(invalid, {
        text: "Review the weekly schedule before class.",
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "CITATION_OUT_OF_RANGE");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument rejects missing citation excerpt", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        citations: [{ source_type: "pdf", page: 1, excerpt: "This excerpt is missing." }],
      },
    ],
  };

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(invalid, {
        text: "Review the weekly schedule before class.",
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "CITATION_EXCERPT_NOT_FOUND");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument enforces DOCX paragraph range", () => {
  const docxGuide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        citations: [
          {
            source_type: "docx",
            anchor_type: "paragraph",
            paragraph: 5,
            excerpt: "Review the weekly schedule before class.",
          },
        ],
      },
    ],
    sections: [
      {
        id: "s1",
        title: "Overview",
        content: "Lecture intro.",
        citations: [
          {
            source_type: "docx",
            anchor_type: "paragraph",
            paragraph: 5,
            excerpt: "Review the weekly schedule before class.",
          },
        ],
      },
    ],
  };

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(docxGuide, {
        text: "Review the weekly schedule before class.",
        fileType: "DOCX",
        pageCount: 0,
        paragraphCount: 2,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "CITATION_OUT_OF_RANGE");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument rejects source_type mismatch", () => {
  const mismatch: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        citations: [{ source_type: "pdf", page: 1, excerpt: "Review the weekly schedule before class." }],
      },
    ],
  };

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(mismatch, {
        text: "Review the weekly schedule before class.",
        fileType: "DOCX",
        pageCount: 0,
        paragraphCount: 1,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "CITATION_OUT_OF_RANGE");
      return true;
    }
  );
});
