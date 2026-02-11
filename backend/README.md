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
- `GOOGLE_CLIENT_ID` (required)
- `DATABASE_PATH` (default `data/learnease.sqlite`)
- `ARTIFACTS_DIR` (default `data/artifacts`)
- `RETENTION_DAYS` (default `30`)
- `RATE_LIMIT_MAX` (requests per minute per IP; default `10`)
- `SESSION_MAX_AGE_SECONDS` (default `604800`)
- `FILE_ENCRYPTION_KEY` (required for artifact encryption)
- `SESSION_SECRET` (required for signed session cookies)
- `ALLOW_LEGACY_AUTH_COOKIES` (`false` by default)
- `CORS_ORIGINS` (comma-separated allowlist; default allows any origin)
- `LOG_LEVEL` (`debug`, `info`, `warn`, or `error`; default `info`)
