import { API_BASE_URL } from "./config.ts";
const DEFAULT_API_TIMEOUT_MS = 30_000;

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiRequestOptions {
  suppressUnauthorizedEvent?: boolean;
  timeoutMs?: number;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Record<string, unknown> | undefined,
    retryAfterSeconds: number | null
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function readRetryAfterSeconds(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.floor(parsed);
  }
  return null;
}

function joinUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {}
): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers = new Headers(init.headers ?? {});
  if (!isFormData && init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const upstreamSignal = init.signal;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const abortFromUpstream = () => {
    controller.abort();
  };

  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      controller.abort();
    } else {
      upstreamSignal.addEventListener("abort", abortFromUpstream, { once: true });
    }
  }

  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  }

  try {
    const response = await fetch(joinUrl(path), {
      ...init,
      headers,
      credentials: "include",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload & T;
    if (response.ok) {
      return payload as T;
    }

    const code = payload.error?.code ?? "UNKNOWN";
    const message = payload.error?.message ?? "Request failed.";
    const details = payload.error?.details;
    const retryAfterSeconds = readRetryAfterSeconds(response.headers.get("Retry-After"));

    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !options.suppressUnauthorizedEvent
    ) {
      window.dispatchEvent(new CustomEvent("learnease:unauthorized"));
    }

    throw new ApiClientError(response.status, code, message, details, retryAfterSeconds);
  } catch (error) {
    if (timedOut) {
      throw new ApiClientError(
        504,
        "REQUEST_TIMEOUT",
        "Request timed out. Please try again.",
        undefined,
        null
      );
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    upstreamSignal?.removeEventListener("abort", abortFromUpstream);
  }
}
