import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_REGEX = /^[a-zA-Z0-9._:-]{1,128}$/;

export interface RequestWithId extends Request {
  requestId?: string;
}

function getRequestId(req: Request): string {
  const candidate = req.header(REQUEST_ID_HEADER)?.trim();
  if (candidate && REQUEST_ID_REGEX.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

function pickLogLevel(statusCode: number): "info" | "warn" | "error" {
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  return "info";
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = getRequestId(req);
  (req as RequestWithId).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const userId = (req as Request & { auth?: { userId?: string } }).auth?.userId;

    const context: Record<string, unknown> = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(2)),
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    };

    if (userId) {
      context.userId = userId;
    }

    const level = pickLogLevel(res.statusCode);
    logger[level]("request completed", context);
  });

  next();
}
