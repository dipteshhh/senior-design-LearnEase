const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiRequestOptions {
  suppressUnauthorizedEvent?: boolean;
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

  const response = await fetch(joinUrl(path), {
    ...init,
    headers,
    credentials: "include",
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
}
