import { NextFunction, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { sendApiError } from "../lib/apiError.js";

interface AuthContext {
  userId: string;
  email?: string;
  name?: string;
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

interface SessionPayload {
  user?: {
    id?: string;
    email?: string;
    name?: string;
  };
  exp?: number;
}

function verifySignedSession(
  sessionCookie: string,
  sessionSecret: string
): AuthContext | null {
  const dotIndex = sessionCookie.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === sessionCookie.length - 1) {
    return null;
  }

  const payloadPart = sessionCookie.slice(0, dotIndex);
  const signaturePart = sessionCookie.slice(dotIndex + 1);
  const expectedSignature = createHmac("sha256", sessionSecret)
    .update(payloadPart)
    .digest("base64url");

  const actualBuffer = Buffer.from(signaturePart);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as SessionPayload;
    const userId = parsed.user?.id?.trim();
    const email = parsed.user?.email?.trim();
    if (!userId || !email) {
      return null;
    }

    if (typeof parsed.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (parsed.exp <= nowSeconds) {
        return null;
      }
    }

    const name = parsed.user?.name?.trim() || undefined;
    return { userId, email, name };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const cookies = parseCookies(req.headers.cookie);
  const sessionSecret = process.env.SESSION_SECRET?.trim();

  const sessionCookie = cookies.learnease_session;
  if (sessionSecret && sessionCookie) {
    const authContext = verifySignedSession(sessionCookie, sessionSecret);
    if (authContext) {
      (req as AuthenticatedRequest).auth = authContext;
      next();
      return;
    }
  }

  const allowLegacyCookies = process.env.ALLOW_LEGACY_AUTH_COOKIES === "true";
  if (allowLegacyCookies) {
    const userId = cookies.learnease_user_id;
    const email = cookies.learnease_user_email;
    if (userId && userId.trim().length > 0 && email && email.trim().length > 0) {
      (req as AuthenticatedRequest).auth = {
        userId: userId.trim(),
        email: email.trim(),
      };
      next();
      return;
    }
  }

  sendApiError(
    res,
    401,
    "UNAUTHORIZED",
    "Authentication required. Provide a valid session cookie."
  );
}
