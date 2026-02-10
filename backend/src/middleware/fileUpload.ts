import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { sendApiError } from "../lib/apiError.js";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF and DOCX files are allowed."));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

export function handleMulterError(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      sendApiError(res, 400, "FILE_TOO_LARGE", "File too large. Maximum size is 10MB.");
      return;
    }
    sendApiError(res, 400, "UPLOAD_FAILED", err.message);
    return;
  }
  if (err) {
    if (err.message.includes("Invalid file type")) {
      sendApiError(res, 415, "UNSUPPORTED_MEDIA_TYPE", err.message);
      return;
    }
    sendApiError(res, 400, "BAD_REQUEST", err.message);
    return;
  }
  next();
}
