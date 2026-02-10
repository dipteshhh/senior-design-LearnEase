import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  createQuizHandler,
  createStudyGuideHandler,
  deleteUserDataHandler,
  getQuizHandler,
  getStudyGuideHandler,
  listDocumentsHandler,
  retryQuizHandler,
  retryStudyGuideHandler,
  updateChecklistHandler,
  uploadDocumentHandler,
} from "./routes/contract.js";
import { upload, handleMulterError, apiLimiter, requireAuth } from "./middleware/index.js";
import { initializeDatabase } from "./db/sqlite.js";
import { purgeExpiredDocuments } from "./store/memoryStore.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? "30");

initializeDatabase();
purgeExpiredDocuments(RETENTION_DAYS);
setInterval(
  () => purgeExpiredDocuments(RETENTION_DAYS),
  24 * 60 * 60 * 1000
).unref();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(apiLimiter);
app.use(requireAuth);

app.post("/api/upload", upload.single("file"), handleMulterError, uploadDocumentHandler);
app.get("/api/documents", listDocumentsHandler);

app.post("/api/study-guide/create", createStudyGuideHandler);
app.post("/api/study-guide/retry", retryStudyGuideHandler);
app.get("/api/study-guide/:documentId", getStudyGuideHandler);

app.post("/api/quiz/create", createQuizHandler);
app.post("/api/quiz/retry", retryQuizHandler);
app.get("/api/quiz/:documentId", getQuizHandler);
app.patch("/api/checklist/:documentId", updateChecklistHandler);
app.delete("/api/user/data", deleteUserDataHandler);

app.listen(PORT, () => {
  console.log(`LearnEase backend running at http://localhost:${PORT}`);
});
