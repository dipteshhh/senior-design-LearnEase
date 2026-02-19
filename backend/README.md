# LearnEase Backend

Express API server for LearnEase upload, extraction, classification, study-guide generation, and quiz generation.

Contract source of truth:
- `../docs/API.md`
- `../docs/API_ERRORS.md`
- `../docs/SCHEMAS.md`
- `../docs/VALIDATION.md`
- `../docs/AI_contract.md`
- `../docs/DB_SCHEMA.md`

## Setup

```bash
npm install
cp .env.example .env
# edit .env and set required secrets/keys
```

## Run

```bash
# development
npm run dev

# production
npm run build
npm start
```

Default local URL: `http://localhost:3001`

## Implemented Routes

### Public auth routes

- `POST /api/auth/google`
- `POST /api/auth/logout`

### Authenticated routes

- `GET /api/auth/me`
- `POST /api/upload`
- `GET /api/documents`
- `DELETE /api/documents/:documentId`
- `POST /api/study-guide/create`
- `POST /api/study-guide/retry`
- `GET /api/study-guide/:documentId`
- `POST /api/quiz/create`
- `POST /api/quiz/retry`
- `GET /api/quiz/:documentId`
- `PATCH /api/checklist/:documentId`
- `DELETE /api/user/data`

## Environment Variables

- `PORT` (default `3001`)
- `OPENAI_API_KEY` (required)
- `OPENAI_TIMEOUT_MS` (OpenAI request timeout in ms; default `30000`)
- `OPENAI_MAX_RETRIES` (OpenAI SDK network retries; default `2`)
- `OPENAI_MODEL` (primary model for generation; default `gpt-4o-mini`)
- `OPENAI_FALLBACK_MODEL` (optional fallback model used on later attempts after retryable failures)
- `OPENAI_FALLBACK_START_ATTEMPT` (attempt number at which fallback model becomes eligible; default `2`)
- `OPENAI_GENERATION_MAX_ATTEMPTS` (max study-guide/quiz generation attempts per request; default `5`)
- `OPENAI_TRANSIENT_BACKOFF_BASE_MS` (transient retry base backoff in ms; default `500`)
- `OPENAI_TRANSIENT_BACKOFF_MAX_MS` (transient retry max backoff cap in ms; default `8000`)
- `OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD` (consecutive transient failures required to open the in-memory circuit breaker; set `0` to disable; default `3`)
- `OPENAI_CIRCUIT_BREAKER_COOLDOWN_MS` (cooldown window while circuit is open before allowing a half-open probe request; default `30000`)
- `OPENAI_CIRCUIT_BREAKER_HALF_OPEN_PROBE_LIMIT` (max concurrent half-open probe requests allowed after cooldown before circuit closes again; default `1`)
- `GOOGLE_CLIENT_ID` (required)
- `GOOGLE_TOKENINFO_TIMEOUT_MS` (Google token verification timeout in ms; default `8000`)
- `GOOGLE_TOKENINFO_MAX_RETRIES` (Google token verification retries; default `1`)
- `DATABASE_PATH` (default `data/learnease.sqlite`)
- `ARTIFACTS_DIR` (default `data/artifacts`)
- `RETENTION_DAYS` (default `30`)
- `RATE_LIMIT_MAX` (requests per minute per IP for non-polling routes; default `30`)
- `RATE_LIMIT_POLL_MAX` (requests per minute per IP for polling-style `GET /api/documents`, `GET /api/study-guide/:id`, and `GET /api/quiz/:id`; default `120`)
- `UPLOAD_MAX_FILE_SIZE_MB` (upload size limit in MB for `POST /api/upload`; default `10`)
- `SESSION_MAX_AGE_SECONDS` (default `604800`)
- `FILE_ENCRYPTION_KEY` (required for artifact encryption)
- `ALLOW_LEGACY_UNENCRYPTED_ARTIFACTS` (`false` by default; set `true` only during one-time migration from plaintext artifacts)
- `SESSION_SECRET` (required for signed session cookies)
- `ALLOW_LEGACY_AUTH_COOKIES` (`false` by default; only honored when `NODE_ENV=test`)
- `CORS_ORIGINS` (comma-separated allowlist; required in production)
- `LOG_LEVEL` (`debug`, `info`, `warn`, or `error`; default `info`)
- `TRUST_PROXY` (production only; accepts `true`, `false`, hop count, or IP/subnet string for reverse-proxy deployments)
