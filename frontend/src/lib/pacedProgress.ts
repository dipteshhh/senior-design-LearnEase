/**
 * Pure, framework-agnostic paced-progress helpers.
 *
 * These are used by `usePacedProgress` (React hook) and can be tested
 * independently of React.  The same logic works for both study-guide
 * and quiz generation progress UIs.
 *
 * Pacing uses an asymptotic exponential curve so that:
 *   - progress rises quickly at first, giving the user immediate feedback
 *   - progress slows down over time, never reaching the cap until the
 *     backend confirms a terminal state
 *   - the five visual steps are spread across the full wait instead of
 *     clustering in the first few seconds
 */

// ── Types ────────────────────────────────────────────────────────────

export type StepState = "complete" | "active" | "pending" | "halted";

export interface PacedStepItem {
  key: string;
  label: string;
  state: StepState;
}

export interface PacedProgressResult {
  /** 0 – 100 visual percentage for the progress bar. */
  percent: number;
  /** 1-indexed: which step is currently active (0 = none, 6 = all done). */
  visualStepIndex: number;
  /** Derived step items ready for rendering. */
  steps: PacedStepItem[];
  /** True once the backend is ready AND the visual sequence has caught up. */
  isVisuallyReady: boolean;
}

export interface PacedProgressConfig {
  /** Labels for each step, in order. */
  stepLabels: readonly string[];
  /**
   * Exponential time constant (ms). Controls how fast the curve rises.
   * A larger value makes progress slower.  Default 25 000 ms.
   */
  tauMs?: number;
  /**
   * Maximum visual percentage while the backend is still processing.
   * Progress never exceeds this until terminal confirmation.  Default 92.
   */
  maxPercent?: number;
  /**
   * Minimum milliseconds the visual sequence must run before the UI
   * is allowed to show "ready".  Prevents an instant flash-to-done
   * if the backend responds very quickly.  Default 3 000 ms.
   */
  minSequenceMs?: number;
}

// ── Defaults ─────────────────────────────────────────────────────────

const DEFAULT_TAU_MS = 25_000;
const DEFAULT_MAX_PERCENT = 92;
const DEFAULT_MIN_SEQUENCE_MS = 3_000;

// ── Pure computation ─────────────────────────────────────────────────

/**
 * Compute the full paced-progress state from elapsed time and backend
 * status.  This function is pure and has no side-effects.
 *
 * @param elapsedMs     Milliseconds since the visual sequence started.
 * @param backendReady  True when the backend has confirmed `ready`.
 * @param backendFailed True when the backend has confirmed `failed`.
 * @param config        Step labels and optional tuning parameters.
 */
export function computePacedProgress(
  elapsedMs: number,
  backendReady: boolean,
  backendFailed: boolean,
  config: PacedProgressConfig,
): PacedProgressResult {
  const {
    stepLabels,
    tauMs = DEFAULT_TAU_MS,
    maxPercent = DEFAULT_MAX_PERCENT,
    minSequenceMs = DEFAULT_MIN_SEQUENCE_MS,
  } = config;

  const totalSteps = stepLabels.length;

  // ── Terminal: failed ───────────────────────────────────────────────
  if (backendFailed) {
    const failedAtStep = Math.min(2, totalSteps - 1);
    const steps: PacedStepItem[] = stepLabels.map((label, i) => {
      if (i < failedAtStep) return { key: label, label, state: "complete" as const };
      if (i === failedAtStep) return { key: label, label, state: "halted" as const };
      return { key: label, label, state: "pending" as const };
    });
    return {
      percent: Math.round((failedAtStep / totalSteps) * 100),
      visualStepIndex: failedAtStep,
      steps,
      isVisuallyReady: false,
    };
  }

  // ── Terminal: ready (after min-sequence elapsed) ───────────────────
  const isVisuallyReady = backendReady && elapsedMs >= minSequenceMs;

  if (isVisuallyReady) {
    const steps: PacedStepItem[] = stepLabels.map((label) => ({
      key: label,
      label,
      state: "complete" as const,
    }));
    return {
      percent: 100,
      visualStepIndex: totalSteps + 1,
      steps,
      isVisuallyReady: true,
    };
  }

  // ── In-progress: asymptotic curve ─────────────────────────────────
  //
  // fraction = maxFraction * (1 - e^(-t / τ))
  //
  // If the backend is already ready but we haven't hit minSequenceMs yet,
  // accelerate to fill the remaining steps quickly so the user isn't
  // waiting for an artificially slow animation.
  const effectiveTau = backendReady ? Math.min(tauMs, minSequenceMs / 3) : tauMs;
  const maxFraction = maxPercent / 100;
  const fraction = maxFraction * (1 - Math.exp(-elapsedMs / effectiveTau));
  const percent = Math.round(fraction * 100);

  // Map fraction → step index.  Each step owns an equal band.
  const stepFraction = 1 / totalSteps;
  let visualStepIndex: number;
  if (fraction >= maxFraction * ((totalSteps - 1) / totalSteps)) {
    // In the last step's band → show last step active
    visualStepIndex = totalSteps;
  } else {
    visualStepIndex = Math.floor(fraction / (maxFraction * stepFraction)) + 1;
  }
  visualStepIndex = Math.max(1, Math.min(totalSteps, visualStepIndex));

  const steps: PacedStepItem[] = stepLabels.map((label, i) => {
    const stepNumber = i + 1;
    let state: StepState = "pending";
    if (visualStepIndex > stepNumber) {
      state = "complete";
    } else if (visualStepIndex === stepNumber) {
      state = "active";
    }
    return { key: label, label, state };
  });

  return { percent, visualStepIndex, steps, isVisuallyReady: false };
}
