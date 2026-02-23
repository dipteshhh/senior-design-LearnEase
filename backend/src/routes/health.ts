import { Request, Response } from "express";
import { getDb } from "../db/sqlite.js";
import { logger } from "../lib/logger.js";

interface HealthResult {
  statusCode: number;
  payload: { status: "ok" | "degraded" };
}

function isDatabaseReady(): boolean {
  try {
    const db = getDb();
    db.prepare("SELECT 1 AS ok").get();
    return true;
  } catch (error) {
    logger.error("Health check database probe failed", { error });
    return false;
  }
}

export function evaluateHealth(
  checkDatabase: () => boolean = isDatabaseReady
): HealthResult {
  if (!checkDatabase()) {
    return {
      statusCode: 503,
      payload: { status: "degraded" },
    };
  }

  return {
    statusCode: 200,
    payload: { status: "ok" },
  };
}

export function healthHandler(_req: Request, res: Response): void {
  const result = evaluateHealth();
  res.status(result.statusCode).json(result.payload);
}
