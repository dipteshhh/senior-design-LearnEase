import { Request, Response } from "express";
import { extractTextFromBuffer } from "../services/textExtractor.js";

export async function extractHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const result = await extractTextFromBuffer(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    res.json(result);
  } catch (err: unknown) {
    console.error("Extraction error:", err);
    const message = err instanceof Error ? err.message : "Extraction failed";
    res.status(500).json({ error: message });
  }
}
