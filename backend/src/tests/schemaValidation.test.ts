import test from "node:test";
import assert from "node:assert/strict";
import {
  StudyGuide,
  Quiz,
  Citation,
  ExtractionItem,
  DocumentType,
  AnalyzeDocumentRequest,
} from "../schemas/analyze.js";

test("DocumentType accepts valid types", () => {
  assert.equal(DocumentType.safeParse("HOMEWORK").success, true);
  assert.equal(DocumentType.safeParse("LECTURE").success, true);
  assert.equal(DocumentType.safeParse("SYLLABUS").success, true);
  assert.equal(DocumentType.safeParse("UNSUPPORTED").success, true);
});

test("DocumentType rejects invalid types", () => {
  assert.equal(DocumentType.safeParse("ESSAY").success, false);
  assert.equal(DocumentType.safeParse("").success, false);
  assert.equal(DocumentType.safeParse(123).success, false);
});

test("AnalyzeDocumentRequest validates text length constraints", () => {
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "" }).success, false);
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "hello" }).success, true);
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "a".repeat(50001) }).success, false);
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "a".repeat(50000) }).success, true);
});

test("AnalyzeDocumentRequest allows optional documentType", () => {
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "hello" }).success, true);
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "hello", documentType: "LECTURE" }).success, true);
  assert.equal(AnalyzeDocumentRequest.safeParse({ text: "hello", documentType: "INVALID" }).success, false);
});

test("Citation PDF schema validates correctly", () => {
  const valid = { source_type: "pdf", page: 1, excerpt: "text" };
  assert.equal(Citation.safeParse(valid).success, true);

  const noPage = { source_type: "pdf", excerpt: "text" };
  assert.equal(Citation.safeParse(noPage).success, false);

  const zeroPage = { source_type: "pdf", page: 0, excerpt: "text" };
  assert.equal(Citation.safeParse(zeroPage).success, false);

  const negativePage = { source_type: "pdf", page: -1, excerpt: "text" };
  assert.equal(Citation.safeParse(negativePage).success, false);

  const emptyExcerpt = { source_type: "pdf", page: 1, excerpt: "" };
  assert.equal(Citation.safeParse(emptyExcerpt).success, false);
});

test("Citation DOCX schema validates correctly", () => {
  const valid = { source_type: "docx", anchor_type: "paragraph", paragraph: 1, excerpt: "text" };
  assert.equal(Citation.safeParse(valid).success, true);

  const noParagraph = { source_type: "docx", anchor_type: "paragraph", excerpt: "text" };
  assert.equal(Citation.safeParse(noParagraph).success, false);

  const zeroParagraph = { source_type: "docx", anchor_type: "paragraph", paragraph: 0, excerpt: "text" };
  assert.equal(Citation.safeParse(zeroParagraph).success, false);

  const wrongAnchor = { source_type: "docx", anchor_type: "section", paragraph: 1, excerpt: "text" };
  assert.equal(Citation.safeParse(wrongAnchor).success, false);
});

test("ExtractionItem requires at least one citation", () => {
  const valid = {
    id: "e1",
    label: "Item",
    supporting_quote: "quote",
    citations: [{ source_type: "pdf", page: 1, excerpt: "text" }],
  };
  assert.equal(ExtractionItem.safeParse(valid).success, true);

  const noCitations = { ...valid, citations: [] };
  assert.equal(ExtractionItem.safeParse(noCitations).success, false);
});

test("StudyGuide schema validates complete structure", () => {
  const valid = {
    overview: { title: "Title", document_type: "LECTURE", summary: "Summary" },
    key_actions: [],
    checklist: [],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [],
  };
  assert.equal(StudyGuide.safeParse(valid).success, true);
});

test("StudyGuide schema rejects missing overview fields", () => {
  const noTitle = {
    overview: { document_type: "LECTURE", summary: "Summary" },
    key_actions: [],
    checklist: [],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [],
  };
  assert.equal(StudyGuide.safeParse(noTitle).success, false);
});

test("StudyGuide schema rejects section with no citations", () => {
  const noSectionCitations = {
    overview: { title: "Title", document_type: "LECTURE", summary: "Summary" },
    key_actions: [],
    checklist: [],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [{ id: "s1", title: "Section", content: "Body", citations: [] }],
  };
  assert.equal(StudyGuide.safeParse(noSectionCitations).success, false);
});

test("StudyGuide schema rejects UNSUPPORTED as overview document_type", () => {
  const unsupported = {
    overview: { title: "Title", document_type: "UNSUPPORTED", summary: "Summary" },
    key_actions: [],
    checklist: [],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [],
  };
  assert.equal(StudyGuide.safeParse(unsupported).success, false);
});

test("Quiz schema validates correctly", () => {
  const valid = {
    document_id: "doc-1",
    questions: [
      {
        id: "q1",
        question: "What?",
        options: ["A"],
        answer: "A",
        supporting_quote: "quote",
        citations: [{ source_type: "pdf", page: 1, excerpt: "text" }],
      },
    ],
  };
  assert.equal(Quiz.safeParse(valid).success, true);
});

test("Quiz schema rejects question with no options", () => {
  const noOptions = {
    document_id: "doc-1",
    questions: [
      {
        id: "q1",
        question: "What?",
        options: [],
        answer: "A",
        supporting_quote: "quote",
        citations: [{ source_type: "pdf", page: 1, excerpt: "text" }],
      },
    ],
  };
  assert.equal(Quiz.safeParse(noOptions).success, false);
});

test("Quiz schema rejects question with no citations", () => {
  const noCitations = {
    document_id: "doc-1",
    questions: [
      {
        id: "q1",
        question: "What?",
        options: ["A"],
        answer: "A",
        supporting_quote: "quote",
        citations: [],
      },
    ],
  };
  assert.equal(Quiz.safeParse(noCitations).success, false);
});
