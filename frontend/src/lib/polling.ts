import { ApiClientError } from "@/lib/api";

export const DEFAULT_POLL_DELAY_MS = 1200;

export function toPollDelayMs(retryAfterSeconds: number | null): number {
  if (retryAfterSeconds == null) return DEFAULT_POLL_DELAY_MS;
  return Math.max(0, Math.floor(retryAfterSeconds * 1000));
}

export function getTransientDelayMs(error: unknown): number | null {
  if (!(error instanceof ApiClientError)) return null;
  if (error.code === "ALREADY_PROCESSING" || error.code === "RATE_LIMITED") {
    return toPollDelayMs(error.retryAfterSeconds);
  }
  return null;
}
