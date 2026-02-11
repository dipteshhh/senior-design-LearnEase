import rateLimit from "express-rate-limit";

const maxRequests = Number(process.env.RATE_LIMIT_MAX) || 10;

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: maxRequests, // requests per minute per IP (default 10)
  message: {
    error: "Too many requests. Please try again in a minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
