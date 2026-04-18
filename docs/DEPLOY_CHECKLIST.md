# Railway Deployment Checklist

> Custom domains: `app.learnease.app` (frontend) · `api.learnease.app` (backend)
> Reminder emails: optional via Resend API

---

## 1. Create Railway Project

- [ ] Log in to [Railway](https://railway.app)
- [ ] Create a new project from the GitHub repo `dipteshhh/senior-design-LearnEase`

---

## 2. Backend Service

### 2a. Service Settings

| Setting | Value |
|---|---|
| Root directory | `/backend` |
| Config file path | `/backend/railway.json` |
| Replicas | `1` |
| Healthcheck path | `/health` |

### 2b. Volume

- [ ] Attach a persistent volume
- [ ] Mount path: `/app/data`

### 2c. Environment Variables

Paste into Railway → Backend service → Variables:

```dotenv
NODE_ENV=production
OPENAI_API_KEY=<your_openai_api_key>
GOOGLE_CLIENT_ID=<your_google_oauth_web_client_id>
SESSION_SECRET=<replace_with_strong_random_secret>
FILE_ENCRYPTION_KEY=<replace_with_64_char_hex_key>
CORS_ORIGINS=https://app.learnease.app
TRUST_PROXY=1
DATABASE_PATH=/app/data/learnease.sqlite
ARTIFACTS_DIR=/app/data/artifacts
SESSION_MAX_AGE_SECONDS=604800
APP_TIMEZONE=America/New_York
LOG_LEVEL=info
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=60000
OPENAI_MAX_RETRIES=0
OPENAI_FALLBACK_START_ATTEMPT=2
OPENAI_GENERATION_MAX_ATTEMPTS=5
OPENAI_MAX_INPUT_CHARS=120000
OPENAI_TRANSIENT_BACKOFF_BASE_MS=500
OPENAI_TRANSIENT_BACKOFF_MAX_MS=8000
OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD=3
OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS=30000
OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT=1
LLM_CLASSIFIER_TIMEOUT_MS=30000
LLM_CLASSIFIER_ALLOW_LOCAL_FALLBACK=true
GOOGLE_TOKENINFO_TIMEOUT_MS=8000
GOOGLE_TOKENINFO_MAX_RETRIES=1
RETENTION_DAYS=30
RATE_LIMIT_MAX=30
RATE_LIMIT_POLL_MAX=120
UPLOAD_MAX_FILE_SIZE_MB=50
```

> Do **not** set `PORT` — Railway injects it automatically.
>
> If you want reminder emails on Railway Hobby, add `RESEND_API_KEY` and `RESEND_FROM`. SMTP is blocked on Hobby.

### 2d. Custom Domain

- [ ] Add custom domain: `api.learnease.app`
- [ ] Add the CNAME record Railway provides to your DNS

### 2e. Deploy & Verify

- [ ] Trigger deploy
- [ ] Wait for build to succeed
- [ ] Verify: `curl https://api.learnease.app/health` returns `200 OK`

---

## 3. Frontend Service

### 3a. Service Settings

| Setting | Value |
|---|---|
| Root directory | `/frontend` |
| Config file path | `/frontend/railway.json` |
| Healthcheck path | `/api/health` |

### 3b. Environment Variables

Paste into Railway → Frontend service → Variables:

```dotenv
BACKEND_API_BASE_URL=https://api.learnease.app
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your_google_oauth_web_client_id>
```

> Do **not** set `PORT` — Railway injects it automatically.
>
> `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must match the backend's `GOOGLE_CLIENT_ID`.

### 3c. Custom Domain

- [ ] Add custom domain: `app.learnease.app`
- [ ] Add the CNAME record Railway provides to your DNS

### 3d. Deploy & Verify

- [ ] Trigger deploy
- [ ] Wait for build to succeed
- [ ] Verify: `curl https://app.learnease.app/api/health` returns `200 OK`

---

## 4. Google OAuth Console

- [ ] Add `https://app.learnease.app` to **Authorized JavaScript origins**
- [ ] Add `https://app.learnease.app` to **Authorized redirect URIs** (if applicable)

---

## 5. Smoke Test

Perform each step manually in the browser at `https://app.learnease.app`:

| # | Test | Expected Result |
|---|---|---|
| 1 | Google sign-in | Redirects to dashboard, session cookie set |
| 2 | Upload a short PDF (~1–5 pages) | Upload succeeds, processing page appears |
| 3 | Study guide generation | Processing completes, study guide renders |
| 4 | Quiz generation (lecture only) | Quiz loads with questions and answer choices |
| 5 | Restart backend service in Railway | After restart, data persists — same documents visible |
| 6 | Sign out and sign back in | Session restored or new session works correctly |

---

## 6. Post-Deploy (Optional / Later)

- [ ] Set `OPENAI_FALLBACK_MODEL=gpt-4o` if you want fallback on retries
- [ ] Configure `RESEND_API_KEY` and `RESEND_FROM` for reminder emails when ready
- [ ] Consider `OPENAI_CONCURRENCY_LIMIT=3` if you see queue contention in logs
- [ ] Monitor logs for `CITATION_EXCERPT_NOT_FOUND` frequency after real usage

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Backend 502 on first request | Volume not mounted — verify `/app/data` exists in logs |
| CORS errors in browser | `CORS_ORIGINS` must exactly match `https://app.learnease.app` (no trailing slash) |
| Google sign-in fails | `GOOGLE_CLIENT_ID` must match `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; origins must be registered in Google Console |
| Study guide fails immediately | Check `OPENAI_API_KEY` is valid; check logs for circuit breaker or rate limit errors |
| Cookie not persisting | Ensure `BACKEND_API_BASE_URL` points to the backend service and the frontend `/api/[...path]` proxy is deployed |
