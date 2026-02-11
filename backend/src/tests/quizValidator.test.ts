import test from "node:test";
import assert from "node:assert/strict";
import type { Quiz } from "../schemas/analyze.js";
import {
  ContractValidationError,
  validateQuizAgainstDocument,
} from "../services/outputValidator.js";

const LECTURE_TEXT = "Machine learning is a subset of artificial intelligence. Neural networks process data in layers.";

const VALID_QUIZ: Quiz = {
  document_id: "quiz-doc-1",
  questions: [
    {
      id: "q1",
      question: "What is machine learning?",
      options: ["A subset of AI", "A programming language", "A database", "A network"],
      answer: "A subset of AI",
      supporting_quote: "Machine learning is a subset of artificial intelligence.",
      citations: [
        { source_type: "pdf", page: 1, excerpt: "Machine learning is a subset of artificial intelligence." },
      ],
    },
  ],
};

test("validateQuizAgainstDocument passes for valid quiz with grounded citations", () => {
  assert.doesNotThrow(() =>
    validateQuizAgainstDocument(VALID_QUIZ, {
      text: LECTURE_TEXT,
      fileType: "PDF",
      pageCount: 1,
      paragraphCount: null,
    }, "LECTURE")
  );
});

test("validateQuizAgainstDocument rejects non-LECTURE document type", () => {
  assert.throws(
    () =>
      validateQuizAgainstDocument(VALID_QUIZ, {
        text: LECTURE_TEXT,
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }, "HOMEWORK"),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "SCHEMA_VALIDATION_FAILED");
      return true;
    }
  );
});

test("validateQuizAgainstDocument rejects quiz with fabricated supporting quote", () => {
  const badQuiz: Quiz = {
    ...VALID_QUIZ,
    questions: [
      {
        ...VALID_QUIZ.questions[0],
        supporting_quote: "This quote does not exist in the document.",
      },
    ],
  };

  assert.throws(
    () =>
      validateQuizAgainstDocument(badQuiz, {
        text: LECTURE_TEXT,
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }, "LECTURE"),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "QUOTE_NOT_FOUND");
      return true;
    }
  );
});

test("validateQuizAgainstDocument rejects quiz with out-of-range page citation", () => {
  const badQuiz: Quiz = {
    ...VALID_QUIZ,
    questions: [
      {
        ...VALID_QUIZ.questions[0],
        citations: [
          { source_type: "pdf", page: 99, excerpt: "Machine learning is a subset of artificial intelligence." },
        ],
      },
    ],
  };

  assert.throws(
    () =>
      validateQuizAgainstDocument(badQuiz, {
        text: LECTURE_TEXT,
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }, "LECTURE"),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "CITATION_OUT_OF_RANGE");
      return true;
    }
  );
});

test("validateQuizAgainstDocument rejects DOCX citation on PDF document", () => {
  const badQuiz: Quiz = {
    ...VALID_QUIZ,
    questions: [
      {
        ...VALID_QUIZ.questions[0],
        citations: [
          {
            source_type: "docx",
            anchor_type: "paragraph",
            paragraph: 1,
            excerpt: "Machine learning is a subset of artificial intelligence.",
          },
        ],
      },
    ],
  };

  assert.throws(
    () =>
      validateQuizAgainstDocument(badQuiz, {
        text: LECTURE_TEXT,
        fileType: "PDF",
        pageCount: 1,
        paragraphCount: null,
      }, "LECTURE"),
    (error: unknown) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.code, "CITATION_OUT_OF_RANGE");
      return true;
    }
  );
});
