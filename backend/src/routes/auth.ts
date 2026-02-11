import { createHmac } from "crypto";
import type { Request, Response } from "express";
import { sendApiError } from "../lib/apiError.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { upsertAuthenticatedUser } from "../store/memoryStore.js";

interface GoogleAuthBody {
  credential?: string;
}

interface SessionPayload {
  user: {
    id: string;
    email: string;
    name?: string;
  };
  iat: number;
  exp: number;
}

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  exp?: string;
  name?: string;
  sub?: string;
}

const SESSION_COOKIE_NAME = "learnease_session";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getGoogleClientId(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is required.");
  }
  return clientId;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET is required.");
  }
  return secret;
}

function getSessionMaxAgeSeconds(): number {
  const parsed = Number(process.env.SESSION_MAX_AGE_SECONDS ?? DEFAULT_SESSION_MAX_AGE_SECONDS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  return Math.floor(parsed);
}

function createSignedSession(payload: SessionPayload): string {
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", getSessionSecret())
    .update(payloadPart)
    .digest("base64url");
  return `${payloadPart}.${signature}`;
}

export async function googleAuthHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as GoogleAuthBody | undefined;
  const credential = typeof body?.credential === "string" ? body.credential.trim() : "";
  if (!credential) {
    sendApiError(res, 400, "MISSING_CREDENTIAL", "Missing Google credential token.");
    return;
  }

  let clientId: string;
  try {
    clientId = getGoogleClientId();
    getSessionSecret();
  } catch (error) {
    sendApiError(
      res,
      500,
      "AUTH_CONFIG_ERROR",
      error instanceof Error ? error.message : "Auth configuration error."
    );
    return;
  }

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    if (!response.ok) {
      sendApiError(res, 401, "INVALID_GOOGLE_TOKEN", "Invalid Google token.");
      return;
    }
    const tokenInfo = (await response.json()) as GoogleTokenInfo;
    if (tokenInfo.aud?.trim() !== clientId) {
      sendApiError(res, 401, "INVALID_GOOGLE_TOKEN", "Google token audience mismatch.");
      return;
    }

    const userId = tokenInfo.sub?.trim();
    const email = tokenInfo.email?.trim();
    const name = tokenInfo.name?.trim();

    const expSeconds = Number(tokenInfo.exp ?? "0");
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(expSeconds) || expSeconds <= nowSeconds) {
      sendApiError(res, 401, "INVALID_GOOGLE_TOKEN", "Google token is expired.");
      return;
    }

    if (!userId || !email) {
      sendApiError(res, 401, "INVALID_GOOGLE_TOKEN", "Invalid Google token.");
      return;
    }

    upsertAuthenticatedUser(userId, email, name);

    const maxAgeSeconds = getSessionMaxAgeSeconds();
    const sessionPayload: SessionPayload = {
      user: {
        id: userId,
        email,
        name: name || undefined,
      },
      iat: nowSeconds,
      exp: nowSeconds + maxAgeSeconds,
    };

    const sessionCookie = createSignedSession(sessionPayload);
    res.cookie(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: maxAgeSeconds * 1000,
      path: "/",
    });

    res.status(200).json({
      user: {
        id: userId,
        email,
        name: name || null,
      },
    });
  } catch (error) {
    sendApiError(
      res,
      401,
      "INVALID_GOOGLE_TOKEN",
      error instanceof Error ? error.message : "Invalid Google token."
    );
  }
}

export function meHandler(req: Request, res: Response): void {
  const auth = (req as AuthenticatedRequest).auth;
  res.status(200).json({
    user: {
      id: auth.userId,
      email: auth.email ?? null,
    },
  });
}

export function logoutHandler(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.status(200).json({ success: true });
}
