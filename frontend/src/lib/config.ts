// Browser requests stay same-origin and are forwarded by Next route handlers.
export const API_BASE_URL = "";

export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
