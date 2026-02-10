import mammoth from "mammoth";
import { createRequire } from "module";

// pdf-parse is a CommonJS module - use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export interface ExtractionResult {
  text: string;
  wordCount: number;
  fileType: "PDF" | "DOCX";
  filename: string;
  pageCount: number | null;
  paragraphCount: number | null;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<ExtractionResult> {
  let text = "";
  let fileType: "PDF" | "DOCX";
  let pageCount: number | null = null;
  let paragraphCount: number | null = null;

  if (mimetype === "application/pdf") {
    fileType = "PDF";
    const data = await pdfParse(buffer);
    text = data.text;
    pageCount = typeof data.numpages === "number" ? data.numpages : null;
  } else if (
    mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    fileType = "DOCX";
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    paragraphCount = result.value
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
  } else {
    throw new Error("Unsupported file type");
  }

  const cleanedText = text.replace(/\s+/g, " ").trim();

  if (!cleanedText) {
    throw new Error("No text could be extracted from the file");
  }

  const wordCount = cleanedText.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    text: cleanedText,
    wordCount,
    fileType,
    filename,
    pageCount,
    paragraphCount,
  };
}
