import "dotenv/config";
import express from "express";
import cors from "cors";
import { transformHandler } from "./transform.js";
import { analyzeDocumentHandler } from "./routes/analyze.js";
import { extractHandler } from "./routes/extract.js";
import { apiLimiter, analyzeLimiter, validateBody, validateTextLength, upload, handleMulterError } from "./middleware/index.js";
import { AnalyzeDocumentRequest } from "./schemas/analyze.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(apiLimiter);

app.post("/api/transform", transformHandler);

app.post(
  "/api/analyze-document",
  analyzeLimiter,
  validateTextLength,
  validateBody(AnalyzeDocumentRequest),
  analyzeDocumentHandler
);

app.post(
  "/api/extract",
  upload.single("file"),
  handleMulterError,
  extractHandler
);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`LearnEase backend running at http://localhost:${PORT}`);
});
