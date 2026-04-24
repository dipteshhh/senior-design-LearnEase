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

function buildStructuredHomeworkText(headings: string[]): string {
  return [
    ...headings,
    `${"Detailed homework prose with hints and constraints. ".repeat(150)} Review the weekly schedule before class.`,
  ].join(" ");
}

function buildSection(id: string, title: string, page: number) {
  return {
    id,
    title,
    content: `${title} walkthrough.`,
    citations: [
      { source_type: "pdf" as const, page, excerpt: "Review the weekly schedule before class." },
    ],
  };
}

test("validateStudyGuideAgainstDocument allows two sections when only two distinct Question markers are detected", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      buildSection("s1", "Question 1: Implement the algorithm", 1),
      buildSection("s2", "Question 2: Write a short summary", 2),
    ],
  };

  const text = buildStructuredHomeworkText([
    "Question 1: Implement the algorithm in code.",
    "Question 2: Write a short summary of the paper.",
  ]);

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 3,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument allows two sections when only two distinct Problem markers are detected", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      buildSection("s1", "Problem 1: Database normalization", 1),
      buildSection("s2", "Problem 2: SQL window functions", 2),
    ],
  };

  const text = buildStructuredHomeworkText([
    "Problem 1: Normalize the schema to 3NF.",
    "Problem 2: Write the SQL window function.",
  ]);

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 3,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument allows two sections when only two distinct Task markers are detected", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      buildSection("s1", "Task 1: Setup the environment", 1),
      buildSection("s2", "Task 2: Run the experiments", 2),
    ],
  };

  const text = buildStructuredHomeworkText([
    "Task 1: Setup the development environment.",
    "Task 2: Run the experiments and report metrics.",
  ]);

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 3,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument allows single-section guide when only one problem marker is detected", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [buildSection("s1", "Problem 1: Single Worksheet Task", 1)],
  };

  const text = buildStructuredHomeworkText(["Problem 1: Solve the worksheet."]);

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 2,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument counts repeated mentions of the same marker only once", () => {
  const guide: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [buildSection("s1", "Question 1: The only problem", 1)],
  };

  const text = buildStructuredHomeworkText([
    "Table of contents: Question 1.",
    "Body header: Question 1.",
    "Footer reference: Question 1 again.",
  ]);

  assert.doesNotThrow(() =>
    validateStudyGuideAgainstDocument(guide, {
      text,
      fileType: "PDF",
      pageCount: 2,
      paragraphCount: null,
    })
  );
});

test("validateStudyGuideAgainstDocument still requires three sections when three or more distinct Task markers are detected", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      buildSection("s1", "Task 1: Setup", 1),
      buildSection("s2", "Task 2: Implement", 2),
    ],
  };

  const text = buildStructuredHomeworkText([
    "Task 1: Setup the environment.",
    "Task 2: Implement the algorithm.",
    "Task 3: Run experiments.",
  ]);

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

test("validateStudyGuideAgainstDocument attaches diagnostic fields when section count is insufficient", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [
      buildSection("s1", "Question 1: Algorithm", 1),
      buildSection("s2", "Question 2: Summary", 2),
    ],
  };

  const text = buildStructuredHomeworkText([
    "Question 1: Implement the algorithm.",
    "Question 2: Summarize the paper.",
    "Question 3: Reflect on the class.",
  ]);

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
      assert.equal(error.details.min_sections, 3);
      assert.equal(error.details.actual_sections, 2);
      assert.equal(error.details.heading_marker_count, 3);
      assert.equal(error.details.section_requirement_reason, "strong_explicit_structure");
      assert.deepEqual(
        (error.details.detected_markers as string[]).slice().sort(),
        ["question:1", "question:2", "question:3"]
      );
      assert.equal(error.details.detected_markers_truncated, false);
      assert.equal(typeof error.details.source_text_preview, "string");
      assert.ok((error.details.source_text_preview as string).length <= 400);
      return true;
    }
  );
});

test("validateStudyGuideAgainstDocument reports text_length_fallback when no markers are detected", () => {
  const invalid: StudyGuide = {
    ...BASE_STUDY_GUIDE,
    sections: [buildSection("s1", "Overview of the module", 1)],
  };

  const text = `${"Plain prose with no numbered markers at all. ".repeat(200)} Review the weekly schedule before class.`;

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
      assert.equal(error.details.section_requirement_reason, "text_length_fallback");
      assert.equal(error.details.heading_marker_count, 0);
      assert.deepEqual(error.details.detected_markers, []);
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
