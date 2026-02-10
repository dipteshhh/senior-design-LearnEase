import { Request, Response } from "express";
import { analyzeDocument } from "../services/contentAnalyzer.js";
import type { AnalyzeDocumentRequest } from "../schemas/analyze.js";
import type { FileType } from "../store/memoryStore.js";

export async function analyzeDocumentHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const body = req.body as AnalyzeDocumentRequest & {
      fileType?: FileType;
      pageCount?: number;
      paragraphCount?: number | null;
    };
    const { text, documentType } = body;

    const result = await analyzeDocument(text, documentType, {
      fileType: body.fileType ?? "DOCX",
      pageCount: body.pageCount ?? Number.MAX_SAFE_INTEGER,
      paragraphCount: body.paragraphCount ?? Number.MAX_SAFE_INTEGER,
    });

    res.json(result);
  } catch (err: unknown) {
    console.error("Analysis error:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: message });
  }
}
