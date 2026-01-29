# LearnEase Frontend

Next.js app for the LearnEase learning support system. Talks to the **backend** for text transformation (see `../backend`).

## Run locally

1. Start the backend first (see root README or `../backend/README.md`).
2. In this folder:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` – development server
- `npm run build` – production build
- `npm run start` – run production build
- `npm run lint` – run ESLint

## Environment

Create a `.env.local` with:

```
# Backend API base URL (required for Transform/workspace)
NEXT_PUBLIC_API_URL=http://localhost:3001
```
