"use client";

import { useEffect, useRef, useState } from "react";
import {
  computePacedProgress,
  type PacedProgressConfig,
  type PacedProgressResult,
} from "./pacedProgress";

const TICK_INTERVAL_MS = 400;

function readStoredStartedAt(storageKey: string | undefined): number | null {
  if (!storageKey || typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKey);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function storeStartedAt(storageKey: string | undefined, value: number): void {
  if (!storageKey || typeof window === "undefined") return;
  window.sessionStorage.setItem(storageKey, String(value));
}

export interface UsePacedProgressOptions extends PacedProgressConfig {
  /** True while the backend reports the task is still running. */
  isProcessing: boolean;
  /** True once the backend confirms the task succeeded. */
  isReady: boolean;
  /** True once the backend confirms the task failed. */
  isFailed: boolean;
  /** Optional sessionStorage key used to resume visual progress after navigation. */
  storageKey?: string;
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
  const { isProcessing, isReady, isFailed, storageKey, ...config } = options;

  const initialStartedAt = readStoredStartedAt(storageKey);
  const startedAtRef = useRef<number | null>(initialStartedAt);
  const [elapsedMs, setElapsedMs] = useState(() =>
    initialStartedAt == null ? 0 : Math.max(0, Date.now() - initialStartedAt)
  );
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
      const now = Date.now();
      startedAtRef.current = now;
      storeStartedAt(storageKey, now);
    }

    const interval = window.setInterval(() => {
      if (isMountedRef.current && startedAtRef.current != null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isProcessing, isReady, storageKey]);

  const result = computePacedProgress(elapsedMs, isReady, isFailed, config);

  const start = () => {
    const now = Date.now();
    startedAtRef.current = now;
    storeStartedAt(storageKey, now);
    setElapsedMs(0);
  };

  const reset = () => {
    const now = Date.now();
    startedAtRef.current = now;
    storeStartedAt(storageKey, now);
    setElapsedMs(0);
  };

  return { ...result, start, reset };
}
