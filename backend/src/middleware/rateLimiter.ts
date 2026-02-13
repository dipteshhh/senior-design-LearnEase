import rateLimit from "express-rate-limit";

const DEFAULT_RATE_LIMIT_MAX = 10;

function readRateLimitMax(): number {
  const raw = process.env.RATE_LIMIT_MAX?.trim();
  if (!raw) {
    return DEFAULT_RATE_LIMIT_MAX;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_RATE_LIMIT_MAX;
  }

  return Math.floor(parsed);
}

const maxRequests = readRateLimitMax();

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: maxRequests, // requests per minute per IP (default 10)
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
