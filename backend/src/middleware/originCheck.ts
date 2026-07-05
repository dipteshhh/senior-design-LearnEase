import type { NextFunction, Request, Response } from "express";
import { sendApiError } from "../lib/apiError.js";
import { logger } from "../lib/logger.js";

/**
 * Cross-site request forgery defense for state-changing routes.
 *
 * The browser sends the session cookie first-party to the frontend origin and
 * the frontend proxy forwards the browser's Origin header to the backend.
 * Modern browsers always attach an Origin header to cross-site state-changing
 * requests, so rejecting untrusted origins here blocks CSRF even if a
 * SameSite bypass exists.
 *
 * Requests with neither Origin nor Referer (curl, server-to-server, E2E
 * scripts) are allowed through: CSRF is a browser-cookie attack, and a
 * non-browser client that already holds a valid session cookie is outside
 * this threat model.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function getTrustedOrigins(): Set<string> {
  const trusted = new Set<string>();
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    return trusted;
  }

  for (const entry of raw.split(",")) {
    const normalized = normalizeOrigin(entry.trim());
    if (normalized) {
      trusted.add(normalized);
    }
  }

  return trusted;
}

function getRequestOrigin(req: Request): string | null {
  const originHeader = req.headers.origin;
  if (typeof originHeader === "string" && originHeader.trim()) {
    const trimmedOrigin = originHeader.trim();
    if (trimmedOrigin.toLowerCase() === "null") {
      return null;
    }

    return normalizeOrigin(trimmedOrigin);
  }

  // Older browsers may omit Origin but still send Referer.
  const refererHeader = req.headers.referer;
  if (typeof refererHeader === "string" && refererHeader.trim()) {
    return normalizeOrigin(refererHeader.trim());
  }

  return null;
}

export function enforceTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const hasBrowserContext =
    (typeof originHeader === "string" && originHeader.trim() !== "") ||
    (typeof refererHeader === "string" && refererHeader.trim() !== "");
  if (!hasBrowserContext) {
    next();
    return;
  }

  const requestOrigin = getRequestOrigin(req);
  const trustedOrigins = getTrustedOrigins();
  const isProduction = process.env.NODE_ENV === "production";

  if (requestOrigin) {
    if (trustedOrigins.has(requestOrigin)) {
      next();
      return;
    }

    // Local development and tests commonly run on shifting localhost ports.
    if (!isProduction && isLoopbackOrigin(requestOrigin)) {
      next();
      return;
    }
  }

  logger.warn("Blocked state-changing request from untrusted origin", {
    method: req.method,
    path: req.originalUrl,
    origin: requestOrigin ?? "unparseable",
  });
  sendApiError(
    res,
    403,
    "ORIGIN_NOT_ALLOWED",
    "Cross-site request blocked: origin is not trusted."
  );
}
