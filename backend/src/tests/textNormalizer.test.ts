import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDocumentText } from "../services/outputValidator.js";

test("normalizeDocumentText collapses multiple whitespace to single space", () => {
  assert.equal(normalizeDocumentText("hello   world", "PDF"), "hello world");
});

test("normalizeDocumentText trims leading and trailing whitespace", () => {
  assert.equal(normalizeDocumentText("  hello  ", "PDF"), "hello");
});

test("normalizeDocumentText normalizes smart quotes to straight quotes", () => {
  assert.equal(normalizeDocumentText("\u201Chello\u201D", "PDF"), '"hello"');
  assert.equal(normalizeDocumentText("\u2018hello\u2019", "PDF"), "'hello'");
});

test("normalizeDocumentText removes soft hyphens and zero-width chars", () => {
  const input = "hel\u00ADlo\u200Bwor\u200Cld\uFEFF";
  assert.equal(normalizeDocumentText(input, "PDF"), "helloworld");
});

test("normalizeDocumentText joins PDF hyphenated line breaks", () => {
  assert.equal(normalizeDocumentText("exam-\nple", "PDF"), "example");
});

test("normalizeDocumentText does NOT join hyphenated line breaks for DOCX", () => {
  const result = normalizeDocumentText("exam-\nple", "DOCX");
  assert.equal(result, "exam- ple");
});

test("normalizeDocumentText normalizes CRLF to LF then collapses", () => {
  assert.equal(normalizeDocumentText("hello\r\nworld", "PDF"), "hello world");
  assert.equal(normalizeDocumentText("hello\rworld", "PDF"), "hello world");
});

test("normalizeDocumentText handles empty string", () => {
  assert.equal(normalizeDocumentText("", "PDF"), "");
  assert.equal(normalizeDocumentText("   ", "PDF"), "");
});
