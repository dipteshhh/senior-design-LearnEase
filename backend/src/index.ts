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
import { upload, handleMulterError, apiLimiter } from "./middleware/index.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(apiLimiter);

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
