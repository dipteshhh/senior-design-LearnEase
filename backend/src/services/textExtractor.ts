import mammoth from "mammoth";
import { createRequire } from "module";

// pdf-parse is a CommonJS module - use createRequire for ESM compatibility
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export interface ExtractionResult {
  text: string;
  wordCount: number;
  fileType: "pdf" | "docx";
  filename: string;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimetype: string,
  filename: string
): Promise<ExtractionResult> {
  let text = "";
  let fileType: "pdf" | "docx";

  if (mimetype === "application/pdf") {
    fileType = "pdf";
    const data = await pdfParse(buffer);
    text = data.text;
  } else if (
    mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    fileType = "docx";
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
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
  };
}
