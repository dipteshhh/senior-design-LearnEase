# LearnEase Frontend

This folder contains the **Next.js frontend** for the LearnEase senior design project.

LearnEase is an accessibility-first document understanding web app. Students upload assignments, lecture slides, or notes, and LearnEase produces structured outputs (summary, key actions, checklist, sections, and quiz) designed to reduce cognitive load.

---

## Contract Source Of Truth

Frontend integration must use root contract docs only:
- `../docs/API.md`
- `../docs/AUTH.md`
- `../docs/API_ERRORS.md`
- `../docs/SCHEMAS.md`

`./docs/` is legacy snapshot material and is non-authoritative for implementation.

---

## Run locally

1) Install dependencies:
```bash
npm install
```

2) Run the dev server:
```bash
npm run dev
```

3) Optional contract drift guard:
```bash
npm run check:contracts
```
