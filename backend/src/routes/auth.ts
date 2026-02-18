import { createHmac } from "crypto";
import type { Request, Response } from "express";
import { sendApiError } from "../lib/apiError.js";
import { logger } from "../lib/logger.js";
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
  email_verified?: string;
  exp?: string;
  name?: string;
  sub?: string;
}

class AuthProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthProviderError";
  }
}

const SESSION_COOKIE_NAME = "learnease_session";
const DEFAULT_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_GOOGLE_TOKENINFO_TIMEOUT_MS = 8000;
const DEFAULT_GOOGLE_TOKENINFO_MAX_RETRIES = 1;

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

function readEnvInt(
  name: string,
  defaultValue: number,
  minValue: number
): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minValue) {
    return defaultValue;
  }

  return Math.floor(parsed);
}

function getGoogleTokenInfoTimeoutMs(): number {
  return readEnvInt(
    "GOOGLE_TOKENINFO_TIMEOUT_MS",
    DEFAULT_GOOGLE_TOKENINFO_TIMEOUT_MS,
    1000
  );
}

function getGoogleTokenInfoMaxRetries(): number {
  return readEnvInt(
    "GOOGLE_TOKENINFO_MAX_RETRIES",
    DEFAULT_GOOGLE_TOKENINFO_MAX_RETRIES,
    0
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function waitForBackoff(attempt: number): Promise<void> {
  const delayMs = Math.min(1500, 250 * attempt);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchGoogleTokenInfo(credential: string): Promise<GoogleTokenInfo | null> {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const timeoutMs = getGoogleTokenInfoTimeoutMs();
  const maxRetries = getGoogleTokenInfoMaxRetries();

  let lastProviderError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        // Token is invalid or expired; retrying will not change this.
        if (response.status >= 400 && response.status < 500) {
          return null;
        }

        throw new AuthProviderError(`Google tokeninfo returned ${response.status}.`);
      }
      return (await response.json()) as GoogleTokenInfo;
    } catch (error) {
      const isProviderError =
        isAbortError(error) ||
        error instanceof TypeError ||
        error instanceof AuthProviderError;

      if (!isProviderError) {
        throw error;
      }

      lastProviderError = error;
      if (attempt < maxRetries) {
        await waitForBackoff(attempt + 1);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AuthProviderError(
    lastProviderError instanceof Error
      ? lastProviderError.message
      : "Google token verification is unavailable."
  );
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
    const tokenInfo = await fetchGoogleTokenInfo(credential);
    if (!tokenInfo) {
      sendApiError(res, 401, "INVALID_GOOGLE_TOKEN", "Invalid Google token.");
      return;
    }

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

    if (tokenInfo.email_verified !== "true") {
      sendApiError(res, 401, "EMAIL_NOT_VERIFIED", "Google email is not verified.");
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
    if (error instanceof AuthProviderError) {
      sendApiError(
        res,
        500,
        "AUTH_PROVIDER_UNAVAILABLE",
        "Google token verification is currently unavailable. Please try again."
      );
      return;
    }

    logger.warn("Unexpected Google auth verification error", {
      error,
    });
    sendApiError(
      res,
      401,
      "INVALID_GOOGLE_TOKEN",
      "Invalid Google token."
    );
  }
}

export function meHandler(req: Request, res: Response): void {
  const auth = (req as AuthenticatedRequest).auth;
  res.status(200).json({
    user: {
      id: auth.userId,
      email: auth.email ?? null,
      name: auth.name ?? null,
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
