# LearnEase — Authentication Contract

All API routes require an authenticated user.

This project assumes **Google OAuth** handled by the web app layer.
Backend behavior is defined here to prevent drift.

---

## 1) Identity

Backend derives the user identity from server-side session (recommended: NextAuth).

Required user fields:
- `user.id` (stable unique id, e.g., provider subject)
- `user.email`

Backend stores:
- `users.id` = stable unique id
- `users.email`
- `users.name` (optional)

---

## 2) Request Requirements

Requests are authenticated via:
- Cookie-based session (default)

If the request is unauthenticated:
- return `401` with error payload (see `docs/API_ERRORS.md`)

If user is authenticated but attempts to access a document not owned by them:
- return `403`

---

## 3) Multi-tenant Rule

All document access MUST be scoped by `user_id`.
No cross-user access is allowed.
