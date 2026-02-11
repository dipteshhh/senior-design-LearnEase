# LearnEase Backend

Express API server for LearnEase document upload, extraction, classification, Study Guide generation, and quiz generation.

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
# Edit .env and set required secrets/keys
```

## Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

Default local URL: `http://localhost:3001`

## Implemented Routes

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
- `DATABASE_PATH` (default `data/learnease.sqlite`)
- `ARTIFACTS_DIR` (default `data/artifacts`)
- `RETENTION_DAYS` (default `30`)
- `RATE_LIMIT_MAX` (requests per minute per IP; default `10`)
- `FILE_ENCRYPTION_KEY` (required for artifact encryption)
- `SESSION_SECRET` (required for signed session cookie auth)
- `ALLOW_LEGACY_AUTH_COOKIES` (`false` by default)
- `CORS_ORIGINS` (comma-separated allowlist; default allows any origin in development)
- `LOG_LEVEL` (`debug`, `info`, `warn`, or `error`; default `info`)
