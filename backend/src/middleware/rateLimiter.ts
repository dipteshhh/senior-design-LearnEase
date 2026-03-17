import rateLimit from "express-rate-limit";

const DEFAULT_RATE_LIMIT_MAX = 30;
const DEFAULT_RATE_LIMIT_POLL_MAX = 120;
const DEV_RATE_LIMIT_MAX_FLOOR = 120;
const DEV_RATE_LIMIT_POLL_MAX_FLOOR = 600;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

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

function withDevelopmentFloor(value: number, floor: number): number {
  if (isProduction()) {
    return value;
  }
  return Math.max(value, floor);
}

function computeRetryAfterSeconds(resetTime: unknown): number | null {
  if (!(resetTime instanceof Date)) {
    return null;
  }
  const remainingMs = resetTime.getTime() - Date.now();
  if (remainingMs <= 0) {
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

const maxRequests = withDevelopmentFloor(
  readRateLimitMax("RATE_LIMIT_MAX", DEFAULT_RATE_LIMIT_MAX),
  DEV_RATE_LIMIT_MAX_FLOOR
);
const pollMaxRequests = withDevelopmentFloor(
  readRateLimitMax("RATE_LIMIT_POLL_MAX", DEFAULT_RATE_LIMIT_POLL_MAX),
  DEV_RATE_LIMIT_POLL_MAX_FLOOR
);

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
  handler: (req, res, _next, options) => {
    const requestWithRateLimit = req as typeof req & {
      rateLimit?: {
        resetTime?: Date;
      };
    };
    const retryAfterSeconds = computeRetryAfterSeconds(requestWithRateLimit.rateLimit?.resetTime);
    if (retryAfterSeconds !== null) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
    }
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});
