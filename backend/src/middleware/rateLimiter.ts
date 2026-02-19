import rateLimit from "express-rate-limit";

const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_POLL_MAX = 120;

function readRateLimitMax(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultValue;
  }

  return Math.floor(parsed);
}

function isPollingEndpoint(method: string, path: string): boolean {
  if (method !== "GET") return false;
  return path.startsWith("/api/documents") || path.startsWith("/api/study-guide/") || path.startsWith("/api/quiz/");
}

const maxRequests = readRateLimitMax("RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX);
const pollMaxRequests = readRateLimitMax("RATE_LIMIT_POLL_MAX", DEFAULT_RATE_LIMIT_POLL_MAX);

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: (req) => (isPollingEndpoint(req.method, req.path) ? pollMaxRequests : maxRequests),
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again in a minute.",
      details: {},
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
