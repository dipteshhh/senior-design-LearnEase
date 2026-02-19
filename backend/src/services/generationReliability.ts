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

interface CircuitBreakerPolicy {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenProbeLimit: number;
}

interface CircuitBreakerState {
  consecutiveTransientFailures: number;
  openedAtMs: number | null;
  halfOpenProbesInFlight: number;
}

const DEFAULT_PRIMARY_MODEL = "gpt-4o-mini";
const DEFAULT_FALLBACK_START_ATTEMPT = 2;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TRANSIENT_BACKOFF_BASE_MS = 500;
const DEFAULT_TRANSIENT_BACKOFF_MAX_MS = 8000;
const DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS = 30000;
const DEFAULT_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT = 1;
const CIRCUIT_BREAKER_ERROR_MESSAGE =
  "OpenAI service is temporarily unavailable. Retry generation.";

const REPAIRABLE_CODES = new Set([
  "SCHEMA_VALIDATION_FAILED",
  "QUOTE_NOT_FOUND",
  "CITATION_EXCERPT_NOT_FOUND",
  "CITATION_OUT_OF_RANGE",
  "ACADEMIC_INTEGRITY_VIOLATION",
]);

const circuitBreakerState: CircuitBreakerState = {
  consecutiveTransientFailures: 0,
  openedAtMs: null,
  halfOpenProbesInFlight: 0,
};

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

function getCircuitBreakerPolicy(): CircuitBreakerPolicy {
  return {
    failureThreshold: readEnvInt(
      "OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD",
      DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      0
    ),
    cooldownMs: readEnvInt(
      "OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS",
      DEFAULT_CIRCUIT_BREAKER_COOLDOWN_MS,
      0
    ),
    halfOpenProbeLimit: readEnvInt(
      "OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT",
      DEFAULT_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT,
      1
    ),
  };
}

function isCircuitBreakerEnabled(policy: CircuitBreakerPolicy): boolean {
  return policy.failureThreshold > 0;
}

function makeCircuitBreakerError(retryAfterMs: number): ContractValidationError {
  return new ContractValidationError(
    "GENERATION_FAILED",
    CIRCUIT_BREAKER_ERROR_MESSAGE,
    {
      source: "circuit_breaker",
      retry_after_ms: Math.max(0, retryAfterMs),
    }
  );
}

export function assertCircuitBreakerAllowsGeneration(nowMs = Date.now()): void {
  const policy = getCircuitBreakerPolicy();
  if (!isCircuitBreakerEnabled(policy)) {
    return;
  }

  if (circuitBreakerState.openedAtMs === null) {
    return;
  }

  const elapsedMs = Math.max(0, nowMs - circuitBreakerState.openedAtMs);
  if (elapsedMs < policy.cooldownMs) {
    throw makeCircuitBreakerError(policy.cooldownMs - elapsedMs);
  }

  if (circuitBreakerState.halfOpenProbesInFlight >= policy.halfOpenProbeLimit) {
    throw makeCircuitBreakerError(1000);
  }

  circuitBreakerState.halfOpenProbesInFlight += 1;
}

export function isCircuitBreakerError(error: unknown): boolean {
  return (
    error instanceof ContractValidationError &&
    error.code === "GENERATION_FAILED" &&
    error.details?.source === "circuit_breaker"
  );
}

export function recordGenerationOutcome(
  outcome: GenerationErrorBucket | "success",
  nowMs = Date.now()
): void {
  const policy = getCircuitBreakerPolicy();
  if (!isCircuitBreakerEnabled(policy)) {
    circuitBreakerState.consecutiveTransientFailures = 0;
    circuitBreakerState.openedAtMs = null;
    circuitBreakerState.halfOpenProbesInFlight = 0;
    return;
  }

  if (outcome === "transient") {
    circuitBreakerState.consecutiveTransientFailures += 1;
    if (circuitBreakerState.consecutiveTransientFailures >= policy.failureThreshold) {
      circuitBreakerState.openedAtMs = nowMs;
      circuitBreakerState.halfOpenProbesInFlight = 0;
    }
    return;
  }

  circuitBreakerState.consecutiveTransientFailures = 0;
  circuitBreakerState.openedAtMs = null;
  circuitBreakerState.halfOpenProbesInFlight = 0;
}

export function resetCircuitBreakerStateForTests(): void {
  circuitBreakerState.consecutiveTransientFailures = 0;
  circuitBreakerState.openedAtMs = null;
  circuitBreakerState.halfOpenProbesInFlight = 0;
}

export function getCircuitBreakerStateForTests(): CircuitBreakerState {
  return { ...circuitBreakerState };
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

export function computeAttemptTimeoutMs(
  baseTimeoutMs: number,
  attempt: number,
  retryMultiplier = 1.5,
  maxTimeoutMs = 60000
): number {
  const safeBase = Math.max(1000, Math.floor(baseTimeoutMs));
  const safeAttempt = Math.max(1, Math.floor(attempt));
  if (safeAttempt <= 1) {
    return safeBase;
  }
  const scaledTimeout = safeBase * retryMultiplier ** (safeAttempt - 1);
  return Math.min(maxTimeoutMs, Math.floor(scaledTimeout));
}

export async function sleepMs(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
