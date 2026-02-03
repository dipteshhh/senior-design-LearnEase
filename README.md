# LearnEase – Senior Design Project

LearnEase is a web-based learning support system designed to reduce cognitive load by presenting educational content in multiple accessible formats. The system supports learners who benefit from simplified explanations and multimodal content delivery, including (but not limited to) students with ADHD or learning difficulties.

Users are not required to disclose any personal, medical, or diagnostic information.

---

## Problem Statement

Many students rely on AI tools that directly complete assignments rather than support understanding. This reduces learning and retention. LearnEase addresses this issue by transforming learning materials into structured, accessible formats without generating direct answers to assignments or homework.

---

## MVP Scope (Demo-Ready)

### Inputs
- Paste text
- Drag-and-drop PDF upload
- Drag-and-drop Word document (.docx) upload

### Processing Flow
- Text extraction from input
- Preview and manual editing
- AI-powered transformation into learning-friendly formats

### Outputs
- Short & Simple explanation
- Step-by-step breakdown
- Bullet-point summary
- Audio narration (Speechify-style controls)

### Guardrails
- Assignment prompts trigger **Hint Mode**
- The system refuses to generate final answers or completed homework
- Focus is on explanation, structure, and comprehension

---

## Out of Scope (Current Phase)

- User accounts or login
- Database-backed storage
- Mobile application

---

## Technology Stack (Planned)

- Next.js (TypeScript)
- Tailwind CSS
- OpenAI API (NLP / text transformation)
- Browser Text-to-Speech API
- Local browser storage (no database)

---

## Project Structure

| Folder      | Description |
|------------|-------------|
| `frontend/` | Next.js app (UI, pages, text extraction, workspace) |
| `backend/`  | Express API (text transformation, Hint Mode, OpenAI) |

- **Frontend setup:** See [`frontend/README.md`](frontend/README.md) and [`frontend/docs/DEV_SETUP.md`](frontend/docs/DEV_SETUP.md).
- **Backend setup:** See [`backend/README.md`](backend/README.md) and `backend/.env.example` for environment variables.

Run the backend and frontend separately for local development.

---

## Team

EECS 4020 Senior Design Project II – University of Toledo, College of Engineering

1. Sid Mahesh
2. Nishant Lamichhane
3. Habeeb Sowemimo
4. Darshan Pandey
5. Diptesh Shahi Thakuri
<<<<<<< HEAD


Testing branch protection
=======
6. Prabin Sapkota
>>>>>>> 2dfd0f3 (new member added in README.md)
