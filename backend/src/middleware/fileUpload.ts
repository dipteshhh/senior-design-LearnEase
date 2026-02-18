import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { sendApiError } from "../lib/apiError.js";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const DEFAULT_MAX_FILE_SIZE_MB = 10;

function readUploadMaxFileSizeMb(): number {
  const raw = process.env.UPLOAD_MAX_FILE_SIZE_MB?.trim();
  if (!raw) {
    return DEFAULT_MAX_FILE_SIZE_MB;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_FILE_SIZE_MB;
  }

  return Math.floor(parsed);
}

const maxFileSizeMb = readUploadMaxFileSizeMb();
const MAX_FILE_SIZE = maxFileSizeMb * 1024 * 1024;

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
      sendApiError(
        res,
        400,
        "FILE_TOO_LARGE",
        `File too large. Maximum size is ${maxFileSizeMb}MB.`
      );
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
