import rateLimit from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per IP
  message: {
    error: "Too many requests. Please try again in a minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 analyze requests per minute (more expensive operation)
  message: {
    error: "Too many analysis requests. Please try again in a minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
