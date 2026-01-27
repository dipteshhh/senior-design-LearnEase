# LearnEase – Senior Design Project - Spring 2026

LearnEase is a web-based learning support system designed to reduce cognitive load by presenting educational content in multiple accessible formats. The system supports learners who benefit from simplified explanations and multimodal content delivery, including (but not limited to) students with ADHD or learning difficulties.

Users are not required to disclose any personal, medical, or diagnostic information.

---

## Problem Statement

Many students rely on AI tools that directly complete assignments rather than support understanding. This reduces learning and retention. LearnEase addresses this issue by transforming learning materials into structured, accessible formats without generating direct answers to assignments or homework.

---

## MVP Scope (Demo-Ready)

### Inputs
- Paste text
- Drag-and-drop PDF upload and Word document (.docx) upload
- PowerPoint (.pptx) upload. This could be a future enhancement (stretch goal) extracting slide text and speaker notes for audio-based and simplified learning.

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
- The system refuses to generate final answers or completed homework. We want to make sure the students learn and not cheat    with this software.
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

## Team

Senior Design Project – University of Toledo  
Spring 2026