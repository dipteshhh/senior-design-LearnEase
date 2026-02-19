import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
} from "openai/error";
import { readEnvInt } from "../lib/env.js";
import { ContractValidationError } from "./outputValidator.js";

export type GenerationErrorBucket = "transient" | "repairable" | "terminal";

export interface GenerationPolicy {
  primaryModel: string;
  fallbackModel: string | null;
  fallbackStartAttempt: number;
  maxAttempts: number;
  transientBackoffBaseMs: number;
  transientBackoffMaxMs: number;
}

const DEFAULT_PRIMARY_MODEL = "gpt-4o-mini";
const DEFAULT_FALLBACK_START_ATTEMPT = 2;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TRANSIENT_BACKOFF_BASE_MS = 500;
const DEFAULT_TRANSIENT_BACKOFF_MAX_MS = 8000;

const REPAIRABLE_CODES = new Set([
  "SCHEMA_VALIDATION_FAILED",
  "QUOTE_NOT_FOUND",
  "CITATION_EXCERPT_NOT_FOUND",
  "CITATION_OUT_OF_RANGE",
  "ACADEMIC_INTEGRITY_VIOLATION",
]);

export function getGenerationPolicy(): GenerationPolicy {
  const maxAttempts = readEnvInt("OPENAI_GENERATION_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS, 1);
  const fallbackStartAttempt = Math.min(
    maxAttempts,
    readEnvInt("OPENAI_FALLBACK_START_ATTEMPT", DEFAULT_FALLBACK_START_ATTEMPT, 2)
  );
  const primaryModel = (process.env.OPENAI_MODEL ?? DEFAULT_PRIMARY_MODEL).trim() || DEFAULT_PRIMARY_MODEL;
  const fallbackModelRaw = process.env.OPENAI_FALLBACK_MODEL;
  const fallbackModel = fallbackModelRaw && fallbackModelRaw.trim().length > 0
    ? fallbackModelRaw.trim()
    : null;

  return {
    primaryModel,
    fallbackModel,
    fallbackStartAttempt,
    maxAttempts,
    transientBackoffBaseMs: readEnvInt(
      "OPENAI_TRANSIENT_BACKOFF_BASE_MS",
      DEFAULT_TRANSIENT_BACKOFF_BASE_MS,
      0
    ),
    transientBackoffMaxMs: readEnvInt(
      "OPENAI_TRANSIENT_BACKOFF_MAX_MS",
      DEFAULT_TRANSIENT_BACKOFF_MAX_MS,
      0
    ),
  };
}

export function classifyGenerationError(
  error: unknown,
  normalizedError?: unknown
): GenerationErrorBucket {
  if (
    error instanceof APIConnectionTimeoutError ||
    error instanceof APIConnectionError ||
    error instanceof RateLimitError
  ) {
    return "transient";
  }

  if (error instanceof APIError) {
    const status = error.status ?? 0;
    if (status === 408 || status === 409 || status === 429 || status >= 500) {
      return "transient";
    }
    return "terminal";
  }

  const candidate = normalizedError ?? error;
  if (candidate instanceof ContractValidationError) {
    if (candidate.code === "GENERATION_FAILED") {
      return "transient";
    }
    if (REPAIRABLE_CODES.has(candidate.code)) {
      return "repairable";
    }
    return "terminal";
  }

  return "terminal";
}

export function selectModelForAttempt(
  policy: GenerationPolicy,
  attempt: number,
  previousFailureBucket: GenerationErrorBucket | null
): string {
  if (
    policy.fallbackModel !== null &&
    attempt >= policy.fallbackStartAttempt &&
    previousFailureBucket !== null &&
    previousFailureBucket !== "terminal"
  ) {
    return policy.fallbackModel;
  }
  return policy.primaryModel;
}

export function computeTransientBackoffMs(
  attempt: number,
  policy: Pick<GenerationPolicy, "transientBackoffBaseMs" | "transientBackoffMaxMs">,
  randomValue = Math.random()
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const cappedDelay = Math.min(
    policy.transientBackoffMaxMs,
    policy.transientBackoffBaseMs * 2 ** (safeAttempt - 1)
  );
  const jitter = Math.max(0, Math.min(1, randomValue));
  return Math.floor(cappedDelay * jitter);
}

export async function sleepMs(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
