import "dotenv/config";
import express from "express";
import cors from "cors";
import type { Server } from "http";
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
import { closeDatabase, initializeDatabase } from "./db/sqlite.js";
import { purgeExpiredDocuments } from "./store/memoryStore.js";
import { logger } from "./lib/logger.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? "30");
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : null;

initializeDatabase();
purgeExpiredDocuments(RETENTION_DAYS);
setInterval(
  () => purgeExpiredDocuments(RETENTION_DAYS),
  24 * 60 * 60 * 1000
).unref();

app.use(
  cors({
    origin: CORS_ORIGINS && CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true,
    credentials: true,
  })
);
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

const server: Server = app.listen(PORT, () => {
  logger.info("LearnEase backend server started", {
    port: Number(PORT),
    corsOrigins: CORS_ORIGINS && CORS_ORIGINS.length > 0 ? CORS_ORIGINS : "ANY",
  });
});

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info("Shutdown signal received", { signal });

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit", { timeoutMs: 10000 });
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close((error?: Error) => {
    if (error) {
      logger.error("HTTP server close failed", { error, signal });
      process.exit(1);
      return;
    }

    try {
      closeDatabase();
      clearTimeout(forceExitTimer);
      logger.info("Graceful shutdown complete", { signal });
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimer);
      logger.error("Database close failed during shutdown", { error, signal });
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
