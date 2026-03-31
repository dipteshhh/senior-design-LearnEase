function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

const DEFAULT_DEV_BACKEND_API_BASE_URL = "http://localhost:3001";

export function getBackendApiBaseUrl(): string {
  const configured =
    process.env.BACKEND_API_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    return normalizeBaseUrl(configured);
  }

  if (process.env.NODE_ENV !== "production") {
    return DEFAULT_DEV_BACKEND_API_BASE_URL;
  }

  throw new Error("BACKEND_API_BASE_URL is required in production.");
}
