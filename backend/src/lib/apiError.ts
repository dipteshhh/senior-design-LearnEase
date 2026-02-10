import { Response } from "express";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {}
): void {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      details,
    },
  };

  res.status(status).json(body);
}

