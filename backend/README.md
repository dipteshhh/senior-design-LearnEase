# LearnEase Backend

Express API for the LearnEase learning support system. Handles text transformation (simple, steps, bullets) and guardrails (Hint Mode) via OpenAI.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
```

## Run

```bash
# Development (with auto-reload)
npm run dev

# Production
npm run build
npm start
```

Server runs at **http://localhost:3001** by default.

## API

### POST /api/transform

Request body:

```json
{
  "inputText": "Your learning material or question...",
  "mode": "simple" | "steps" | "bullets"
}
```

Response:

```json
{
  "hintMode": false,
  "mode": "simple",
  "outputText": "Transformed explanation..."
}
```

## Environment

| Variable         | Description                    |
|-----------------|--------------------------------|
| `PORT`          | Server port (default: 3001)   |
| `OPENAI_API_KEY`| OpenAI API key (required)      |
