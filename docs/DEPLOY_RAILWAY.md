# Railway Deployment

This repo should be deployed to Railway as two services from the same GitHub repository:

- `backend`
- `frontend`

## Why this shape

- The backend persists SQLite data and encrypted document artifacts to disk.
- The backend also runs in-process cleanup and reminder schedulers on startup.
- The frontend talks to the backend with cookie-based auth and `credentials: "include"`.

Because of that:

- keep the backend at **one replica**
- attach a **persistent volume** to the backend
- use the same parent domain for frontend and backend, e.g. `app.example.com` and `api.example.com`

## Service Setup

### Backend service

Use the same GitHub repo as the source and configure:

- Root Directory: `/backend`
- Config as Code path: `/backend/railway.json`
- Public domain: `api.example.com`
- Volume mount path: `/app/data`

Recommended environment variables:

- `NODE_ENV=production`
- `OPENAI_API_KEY=...`
- `GOOGLE_CLIENT_ID=...`
- `SESSION_SECRET=...`
- `FILE_ENCRYPTION_KEY=...`
- `SESSION_MAX_AGE_SECONDS=604800`
- `CORS_ORIGINS=https://app.example.com`
- `TRUST_PROXY=true`
- `DATABASE_PATH=/app/data/learnease.sqlite`
- `ARTIFACTS_DIR=/app/data/artifacts`
- `APP_TIMEZONE=America/New_York`
- `LOG_LEVEL=info`

Optional, only if reminders are needed:

- `SMTP_HOST=...`
- `SMTP_PORT=587`
- `SMTP_USER=...`
- `SMTP_PASS=...`
- `SMTP_FROM=noreply@example.com`

Notes:

- Do not scale the backend horizontally while it uses SQLite, local artifacts, and in-process schedulers.
- Railway injects `PORT`; do not hardcode a production port override unless you have a specific reason.
- With a volume attached, expect a small amount of redeploy downtime on Railway.

### Frontend service

Use the same GitHub repo as the source and configure:

- Root Directory: `/frontend`
- Config as Code path: `/frontend/railway.json`
- Public domain: `app.example.com`

Required environment variables:

- `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=...`

## Google Sign-In

Update the Google OAuth client used by the frontend credential flow:

- Authorized JavaScript origins should include `https://app.example.com`

This app posts the Google credential to the backend for token verification and session issuance; it does not use a separate backend OAuth redirect route.

## Auth and Cookie Expectations

The frontend sends authenticated requests with cookies included, and the backend issues an HTTP-only session cookie.

For production:

- serve both apps over HTTPS
- keep frontend and backend on the same parent domain
- set `CORS_ORIGINS` to the exact frontend origin

## First Deploy Checklist

1. Create a Railway project.
2. Add the backend service from this repo.
3. Set backend root directory to `/backend`.
4. Attach a volume to the backend at `/app/data`.
5. Add backend environment variables.
6. Generate or attach the backend public domain.
7. Add the frontend service from this repo.
8. Set frontend root directory to `/frontend`.
9. Add frontend environment variables.
10. Generate or attach the frontend public domain.
11. Update Google OAuth authorized JavaScript origins for the frontend domain.
12. Verify backend health at `/health`.
13. Verify frontend health at `/api/health`.
14. Test sign-in, upload, study guide generation, quiz generation, and a backend restart.

## Railway References

- Config as code: https://docs.railway.com/config-as-code/reference
- Monorepo deploys: https://docs.railway.com/deployments/monorepo
- Build configuration: https://docs.railway.com/builds/build-configuration
- Public networking: https://docs.railway.com/networking/public-networking
- Domains: https://docs.railway.com/networking/domains/working-with-domains
- Volumes: https://docs.railway.com/volumes
- Healthchecks: https://docs.railway.com/deployments/healthchecks
