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
      group: null,
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

test("normalizeDocumentText normalizes bullets and dash variants", () => {
  const raw = "Note: • Work must be original — no copied AI output.";
  const normalized = normalizeDocumentText(raw, "PDF");
  assert.equal(normalized, "Note: Work must be original - no copied AI output.");
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

test("validateStudyGuideAgainstDocument accepts grounded quotes with punctuation variants", () => {
  const text = "Note: • Work must be written in your own words — copied AI output will not be accepted.";
  const variantQuote =
    "Note - Work must be written in your own words - copied AI output will not be accepted";

  const variantGuide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: variantQuote,
        citations: [{ source_type: "pdf", page: 1, excerpt: variantQuote }],
      },
    ],
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [{ source_type: "pdf", page: 1, excerpt: variantQuote }],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(variantGuide, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument accepts short grounded quotes with symbol variants", () => {
  const text = "Q = Query matrix. K = Key matrix. V = Value matrix.";
  const variantQuote = "Q Query matrix";

  const variantGuide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: variantQuote,
        citations: [{ source_type: "pdf", page: 1, excerpt: variantQuote }],
      },
    ],
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [{ source_type: "pdf", page: 1, excerpt: variantQuote }],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(variantGuide, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument accepts quote when strongly aligned with grounded citation", () => {
  const text = "Work must be written entirely in your own words and include your own reflections.";
  const citationExcerpt = "written entirely in your own words and include your own reflections";
  const paraphrasedQuote =
    "Submission must be in your own words and include your own reflections";

  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: paraphrasedQuote,
        citations: [{ source_type: "pdf", page: 1, excerpt: citationExcerpt }],
      },
    ],
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [{ source_type: "pdf", page: 1, excerpt: citationExcerpt }],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument accepts extraction-item citation fallback to grounded supporting quote", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: "Review the weekly schedule before class.",
        citations: [
          {
            source_type: "pdf",
            page: 1,
            excerpt: "Review the weekly schedule before each class session.",
          },
        ],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text: "Review the weekly schedule before class.",
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument accepts citation excerpts with ordered ellipsis fragments", () => {
  const text = "Review the weekly schedule before class and discuss assignments with your group.";
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: "Review the weekly schedule before class.",
        citations: [
          {
            source_type: "pdf",
            page: 1,
            excerpt: "Review the weekly schedule...discuss assignments with your group.",
          },
        ],
      },
    ],
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [
          {
            source_type: "pdf",
            page: 1,
            excerpt: "Review the weekly schedule...discuss assignments with your group.",
          },
        ],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
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

test("validateStudyGuideAgainstDocument rejects missing section citation excerpt", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
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

test("validateStudyGuideAgainstDocument rejects section with no citations", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [],
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
      assert.equal(error.code, "SCHEMA_VALIDATION_FAILED");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument requires at least three sections for structured documents", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        id: "s1",
        title: "Overview",
        content: "Lecture intro.",
        citations: [{ source_type: "pdf", page: 1, excerpt: "Review the weekly schedule before class." }],
      },
      {
        id: "s2",
        title: "Key Concepts",
        content: "Concept summary.",
        citations: [{ source_type: "pdf", page: 2, excerpt: "Review the weekly schedule before class." }],
      },
    ],
  };

  const text = [
    "Question 1: Reading notes and lecture context.",
    "Question 2: Reading notes and lecture context.",
    "Question 3: Reading notes and lecture context.",
    `${"Reading notes and lecture context. ".repeat(120)} Review the weekly schedule before class.`,
  ].join(" ");

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(invalid, {
        text,
        fileType: "PDF",
        pageCount: 4,
        paragraphCount: null,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "SCHEMA_VALIDATION_FAILED");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument rejects generic section titles", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        title: "Section 1",
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
      assert.equal(error.code, "SCHEMA_VALIDATION_FAILED");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument allows fewer sections for short documents", () => {
  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(BASE_STUDY_GUIDE, {
      text: "Review the weekly schedule before class.",
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
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

test("validateStudyGuideAgainstDocument rejects solver-style section content", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        content: "The answer is option A.",
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
      assert.equal(error.code, "ACADEMIC_INTEGRITY_VIOLATION");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument rejects 'here's a step-by-step' solver guidance", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        content: "Here's a step-by-step guide to completing this problem.",
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
      assert.equal(error.code, "ACADEMIC_INTEGRITY_VIOLATION");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument allows descriptive 'step by step' in section content", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        content: "Implement the attention mechanism step by step using Python.",
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text: "Review the weekly schedule before class.",
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument allows descriptive 'step-by-step' in checklist labels", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    checklist: [
      {
        id: "c1",
        label: "Complete the step-by-step implementation of scaled dot-product attention",
        supporting_quote: "Review the weekly schedule before class.",
        citations: [{ source_type: "pdf", page: 1, excerpt: "Review the weekly schedule before class." }],
        group: null,
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text: "Review the weekly schedule before class.",
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument rejects 'follow these step-by-step' solver guidance", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        content: "Follow these step-by-step instructions to solve the problem.",
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
      assert.equal(error.code, "ACADEMIC_INTEGRITY_VIOLATION");
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument accepts citation excerpt with token-overlap grounding (PDF extraction artifacts)", () => {
  // Simulates a model-generated excerpt that is close to but not identical to the extracted text
  // due to PDF extraction artifacts (e.g. ligatures, extra whitespace, minor reordering).
  const text =
    "The transformer architecture uses self-attention mechanisms to process input sequences in parallel. " +
    "Multi-head attention allows the model to jointly attend to information from different representation subspaces. " +
    "Each attention head computes scaled dot-product attention independently.";

  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    key_actions: [
      {
        ...BASE_STUDY_GUIDE.key_actions[0],
        supporting_quote: "self-attention mechanisms to process input sequences in parallel",
        citations: [
          {
            source_type: "pdf",
            page: 1,
            // Excerpt has minor word differences vs extracted text — direct substring match fails
            excerpt: "The transformer architecture uses self-attention mechanisms to process input sequences",
          },
        ],
      },
    ],
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [
          {
            source_type: "pdf",
            page: 1,
            excerpt: "Multi-head attention allows the model to jointly attend to information from different subspaces",
          },
        ],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument still rejects completely fabricated section citation excerpts even with token-overlap", () => {
  // Section citations do NOT have the groundedFallbackExcerpt path, so the
  // fabricated excerpt must fail on its own merits (no supporting-quote bail-out).
  const text =
    "Review the weekly schedule before class and prepare for the group discussion. " +
    "Students should complete all assigned readings prior to the lecture session. " +
    "Active participation in seminar activities contributes to the final grade. " +
    "Office hours are available on Tuesday and Thursday afternoons for additional help.";

  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      {
        ...BASE_STUDY_GUIDE.sections[0],
        citations: [
          {
            source_type: "pdf",
            page: 1,
            // Completely fabricated excerpt — zero meaningful token overlap with source text
            excerpt: "Convolutional kernels apply spatial filtering across pixel neighborhoods in image tensors.",
          },
        ],
      },
    ],
  };

  assert.throws(
    () =>
      validateStudyGuideAgainstDocument(guide, {
        text,
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
