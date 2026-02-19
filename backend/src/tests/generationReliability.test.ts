import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCircuitBreakerAllowsGeneration,
  classifyGenerationError,
  computeAttemptTimeoutMs,
  computeTransientBackoffMs,
  getCircuitBreakerStateForTests,
  getGenerationPolicy,
  recordGenerationOutcome,
  resetCircuitBreakerStateForTests,
  selectModelForAttempt,
  type GenerationPolicy,
} from "../services/generationReliability.js";
import { ContractValidationError } from "../services/outputValidator.js";

const POLICY_ENV_KEYS = [
  "OPENAI_MODEL",
  "OPENAI_FALLBACK_MODEL",
  "OPENAI_FALLBACK_START_ATTEMPT",
  "OPENAI_GENERATION_MAX_ATTEMPTS",
  "OPENAI_TRANSIENT_BACKOFF_BASE_MS",
  "OPENAI_TRANSIENT_BACKOFF_MAX_MS",
  "OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD",
  "OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS",
  "OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT",
] as const;

test("classifyGenerationError marks schema failures as repairable", () => {
  const error = new ContractValidationError(
    "SCHEMA_VALIDATION_FAILED",
    "Model output did not match schema."
  );
  assert.equal(classifyGenerationError(error), "repairable");
});

test("classifyGenerationError marks integrity violations as repairable", () => {
  const error = new ContractValidationError(
    "ACADEMIC_INTEGRITY_VIOLATION",
    "Model produced answer-like content."
  );
  assert.equal(classifyGenerationError(error), "repairable");
});

test("classifyGenerationError marks generation failures as transient", () => {
  const error = new ContractValidationError("GENERATION_FAILED", "Provider timeout.");
  assert.equal(classifyGenerationError(error), "transient");
});

test("classifyGenerationError marks lecture guard as terminal", () => {
  const error = new ContractValidationError("DOCUMENT_NOT_LECTURE", "Lecture-only.");
  assert.equal(classifyGenerationError(error), "terminal");
});

test("computeTransientBackoffMs applies cap with jitter", () => {
  const delay = computeTransientBackoffMs(
    5,
    {
      transientBackoffBaseMs: 1000,
      transientBackoffMaxMs: 5000,
    },
    1
  );

  assert.equal(delay, 5000);
});

test("computeAttemptTimeoutMs scales attempts after the first and applies cap", () => {
  assert.equal(computeAttemptTimeoutMs(30000, 1), 30000);
  assert.equal(computeAttemptTimeoutMs(30000, 2), 45000);
  assert.equal(computeAttemptTimeoutMs(30000, 3), 60000);
  assert.equal(computeAttemptTimeoutMs(30000, 4), 60000);
});

test("selectModelForAttempt switches to fallback after retryable failures", () => {
  const policy: GenerationPolicy = {
    primaryModel: "gpt-4o-mini",
    fallbackModel: "gpt-4o",
    fallbackStartAttempt: 3,
    maxAttempts: 4,
    transientBackoffBaseMs: 500,
    transientBackoffMaxMs: 8000,
  };

  assert.equal(selectModelForAttempt(policy, 1, null), "gpt-4o-mini");
  assert.equal(selectModelForAttempt(policy, 3, "transient"), "gpt-4o");
  assert.equal(selectModelForAttempt(policy, 3, "repairable"), "gpt-4o");
});

test("getGenerationPolicy reads env overrides and clamps fallback attempt", () => {
  const previous = Object.fromEntries(
    POLICY_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof POLICY_ENV_KEYS)[number], string | undefined>;

  try {
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    process.env.OPENAI_FALLBACK_MODEL = "gpt-4o";
    process.env.OPENAI_FALLBACK_START_ATTEMPT = "8";
    process.env.OPENAI_GENERATION_MAX_ATTEMPTS = "4";
    process.env.OPENAI_TRANSIENT_BACKOFF_BASE_MS = "700";
    process.env.OPENAI_TRANSIENT_BACKOFF_MAX_MS = "9000";

    const policy = getGenerationPolicy();

    assert.equal(policy.primaryModel, "gpt-4o-mini");
    assert.equal(policy.fallbackModel, "gpt-4o");
    assert.equal(policy.maxAttempts, 4);
    assert.equal(policy.fallbackStartAttempt, 4);
    assert.equal(policy.transientBackoffBaseMs, 700);
    assert.equal(policy.transientBackoffMaxMs, 9000);
  } finally {
    for (const key of POLICY_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});

test("circuit breaker opens after transient failures and blocks until cooldown", () => {
  const previous = Object.fromEntries(
    POLICY_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof POLICY_ENV_KEYS)[number], string | undefined>;

  try {
    process.env.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD = "2";
    process.env.OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS = "30000";
    process.env.OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT = "1";
    resetCircuitBreakerStateForTests();

    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(1000));

    recordGenerationOutcome("transient", 1001);
    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(1002));

    recordGenerationOutcome("transient", 1003);
    const opened = getCircuitBreakerStateForTests();
    assert.equal(opened.openedAtMs, 1003);

    assert.throws(
      () => assertCircuitBreakerAllowsGeneration(1200),
      (error: unknown) =>
        error instanceof ContractValidationError &&
        error.code === "GENERATION_FAILED" &&
        error.details?.source === "circuit_breaker"
    );

    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(31003));

    assert.throws(
      () => assertCircuitBreakerAllowsGeneration(31004),
      (error: unknown) =>
        error instanceof ContractValidationError &&
        error.code === "GENERATION_FAILED" &&
        error.details?.source === "circuit_breaker"
    );

    recordGenerationOutcome("success", 31005);
    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(31006));
  } finally {
    resetCircuitBreakerStateForTests();
    for (const key of POLICY_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});

test("repairable outcomes close the circuit", () => {
  const previous = Object.fromEntries(
    POLICY_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof POLICY_ENV_KEYS)[number], string | undefined>;

  try {
    process.env.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD = "1";
    process.env.OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS = "30000";
    process.env.OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT = "1";
    resetCircuitBreakerStateForTests();

    recordGenerationOutcome("transient", 5000);
    assert.throws(() => assertCircuitBreakerAllowsGeneration(5001));

    recordGenerationOutcome("repairable", 5002);
    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(5003));
  } finally {
    resetCircuitBreakerStateForTests();
    for (const key of POLICY_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});

test("half-open probe limit allows configured parallel probes", () => {
  const previous = Object.fromEntries(
    POLICY_ENV_KEYS.map((key) => [key, process.env[key]])
  ) as Record<(typeof POLICY_ENV_KEYS)[number], string | undefined>;

  try {
    process.env.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD = "1";
    process.env.OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS = "1000";
    process.env.OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT = "2";
    resetCircuitBreakerStateForTests();

    recordGenerationOutcome("transient", 1000);
    assert.throws(() => assertCircuitBreakerAllowsGeneration(1001));

    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(2001));
    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(2002));
    assert.throws(() => assertCircuitBreakerAllowsGeneration(2003));

    const state = getCircuitBreakerStateForTests();
    assert.equal(state.halfOpenProbesInFlight, 2);

    recordGenerationOutcome("success", 2004);
    assert.doesNotThrow(() => assertCircuitBreakerAllowsGeneration(2005));
  } finally {
    resetCircuitBreakerStateForTests();
    for (const key of POLICY_ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});
