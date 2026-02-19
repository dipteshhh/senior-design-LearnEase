# LearnEase — Authentication Contract

All API routes require an authenticated user **except** the public routes (`GET /health`, `POST /api/auth/google`, `POST /api/auth/logout`).

Authentication uses **Google OAuth**. The backend provides a token exchange endpoint.

---

## 1) Auth Flow

1. Frontend initiates Google Sign-In (One Tap or redirect via Google Identity Services).
2. Google returns an **ID token** (`credential`) to the frontend.
3. Frontend sends `POST /api/auth/google` with `{ "credential": "<token>" }`.
4. Backend verifies the token with Google, upserts the user, and returns a signed `learnease_session` HttpOnly cookie via `Set-Cookie`.
5. All subsequent API requests include this cookie automatically (browser handles it).
6. To log out, frontend calls `POST /api/auth/logout` which clears the cookie.

---

## 2) Identity

Backend derives the user identity from the signed `learnease_session` cookie.

Session payload shape:
```json
{
  "user": { "id": "google_sub", "email": "user@example.com", "name": "Display Name" },
  "iat": 1700000000,
  "exp": 1700604800
}
```

The cookie is HMAC-SHA256 signed with `SESSION_SECRET`. It is HttpOnly, SameSite=Lax, and expires after `SESSION_MAX_AGE_SECONDS` (default 7 days).

Required user fields:
- `user.id` (Google `sub` — stable unique id)
- `user.email`

Backend stores:
- `users.id` = Google `sub`
- `users.email`
- `users.name` (optional)

---

## 3) Request Requirements

Requests are authenticated via:
- `learnease_session` HttpOnly cookie (primary; set by `POST /api/auth/google`)
- Legacy plain-text cookies are disabled outside `NODE_ENV=test` even if `ALLOW_LEGACY_AUTH_COOKIES=true`

If the request is unauthenticated:
- return `401` with error payload (see `docs/API_ERRORS.md`)

If user is authenticated but attempts to access a document not owned by them:
- return `403`

---

## 4) Multi-tenant Rule

All document access MUST be scoped by `user_id`.
No cross-user access is allowed.

---

## 5) Frontend Integration Checklist

The frontend team needs to:

1. **Add Google Identity Services** (the `<script src="https://accounts.google.com/gsi/client">` tag or `@react-oauth/google` package).
2. **Configure Google Client ID** — must match the `GOOGLE_CLIENT_ID` env var on the backend.
3. **On sign-in callback**, send the Google `credential` to `POST /api/auth/google`.
4. **On logout**, call `POST /api/auth/logout`.
5. **Use `GET /api/auth/me`** to check session validity on page load / app init.
   Response shape: `{ "user": { "id": string, "email": string, "name": string | null } }`
6. **Ensure `credentials: "include"`** on all `fetch()` calls to the backend so cookies are sent cross-origin.
7. **Replace all mock data** in `src/lib/mock/store.ts` and `src/lib/data/documents.ts` with real API calls to the backend.
8. **Match backend response shapes** — see `docs/SCHEMAS.md` for `StudyGuide` and `Quiz` JSON structures.

---

## 6) Environment Requirements

Backend env vars for auth:
- `GOOGLE_CLIENT_ID` (required; from Google Cloud Console)
- `SESSION_SECRET` (required; strong random secret for HMAC signing)
- `SESSION_MAX_AGE_SECONDS` (optional; default `604800` = 7 days)
