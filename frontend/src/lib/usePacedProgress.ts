"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-start the timer when backend is already processing or already ready
  // and we haven't started yet. This covers page reloads while generation is
  // running and direct loads of a ready document into the processing page.
  useEffect(() => {
    if ((isProcessing || isReady) && startedAt == null) {
      setStartedAt(Date.now());
    }
  }, [isProcessing, isReady, startedAt]);

  // Tick the elapsed counter while the sequence is running.
  useEffect(() => {
    if (startedAt == null) return;

    // Keep ticking while processing, or while holding for min-sequence.
    const shouldTick = isProcessing || isReady;
    if (!shouldTick) return;

    const interval = window.setInterval(() => {
      if (isMountedRef.current) {
        setElapsedMs(Date.now() - startedAt);
      }
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isProcessing, isReady, startedAt]);

  // Stop ticking once visually ready or failed.
  const result = computePacedProgress(elapsedMs, isReady, isFailed, config);

  const start = useCallback(() => {
    setStartedAt(Date.now());
    setElapsedMs(0);
  }, []);

  const reset = useCallback(() => {
    setStartedAt(Date.now());
    setElapsedMs(0);
  }, []);

  return { ...result, start, reset };
}
