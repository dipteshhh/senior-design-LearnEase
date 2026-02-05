import { Request, Response } from "express";
import { analyzeDocument } from "../services/contentAnalyzer.js";
import type { AnalyzeDocumentRequest } from "../schemas/analyze.js";

export async function analyzeDocumentHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { text, documentType } = req.body as AnalyzeDocumentRequest;

    const result = await analyzeDocument(text, documentType);

    res.json(result);
  } catch (err: unknown) {
    console.error("Analysis error:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: message });
  }
}
