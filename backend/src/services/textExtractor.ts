import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

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
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      text = data.text;
      pageCount = typeof data.total === "number" ? data.total : null;
    } finally {
      await parser.destroy();
    }
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

  const cleanedText = text.trim();
  const compactText = cleanedText.replace(/\s+/g, " ").trim();

  if (!compactText) {
    throw new Error("No text could be extracted from the file");
  }

  const wordCount = compactText.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    text: cleanedText,
    wordCount,
    fileType,
    filename,
    pageCount,
    paragraphCount,
  };
}
