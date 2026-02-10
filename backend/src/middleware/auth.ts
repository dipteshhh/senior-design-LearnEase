import { NextFunction, Request, Response } from "express";
import { sendApiError } from "../lib/apiError.js";

interface AuthContext {
  userId: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const parts = header.split(";").map((part) => part.trim()).filter(Boolean);
  const entries = parts.map((part) => {
    const eqIndex = part.indexOf("=");
    if (eqIndex < 0) return [part, ""] as const;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim();
    return [key, decodeURIComponent(value)] as const;
  });
  return Object.fromEntries(entries);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);

  const userId = cookies.learnease_user_id;
  const email = cookies.learnease_user_email;

  if (!userId || userId.trim().length === 0 || !email || email.trim().length === 0) {
    sendApiError(
      res,
      401,
      "UNAUTHORIZED",
      "Authentication required. Provide a valid session cookie."
    );
    return;
  }

  (req as AuthenticatedRequest).auth = {
    userId: userId.trim(),
    email: email.trim(),
  };
  next();
}
