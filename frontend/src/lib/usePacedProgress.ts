"use client";

import { useEffect, useRef, useState } from "react";
import {
  computePacedProgress,
  type PacedProgressConfig,
  type PacedProgressResult,
} from "./pacedProgress";

const TICK_INTERVAL_MS = 400;

export interface UsePacedProgressOptions extends PacedProgressConfig {
  /** True while the backend reports the task is still running. */
  isProcessing: boolean;
  /** True once the backend confirms the task succeeded. */
  isReady: boolean;
  /** True once the backend confirms the task failed. */
  isFailed: boolean;
}

export interface UsePacedProgressReturn extends PacedProgressResult {
  /** Call this when the user triggers generation (optimistic start). */
  start: () => void;
  /** Call this to reset the visual sequence (e.g. on retry). */
  reset: () => void;
}

/**
 * Drives a paced visual progress sequence that distributes step
 * transitions evenly over the real wait time.
 *
 * Reusable for study-guide and quiz generation pages.
 */
export function usePacedProgress(
  options: UsePacedProgressOptions,
): UsePacedProgressReturn {
  const { isProcessing, isReady, isFailed, ...config } = options;

  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-start + tick in one effect.  When isProcessing or isReady
  // becomes true, we lazily stamp startedAtRef so the pacing curve
  // begins.  The interval reads from the ref on every tick so that
  // start() / reset() take effect immediately without re-creating
  // the interval.
  useEffect(() => {
    if (!isProcessing && !isReady) return;

    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }

    const interval = window.setInterval(() => {
      if (isMountedRef.current && startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isProcessing, isReady]);

  const result = computePacedProgress(elapsedMs, isReady, isFailed, config);

  const start = () => {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
  };

  const reset = () => {
    startedAtRef.current = Date.now();
    setElapsedMs(0);
  };

  return { ...result, start, reset };
}
