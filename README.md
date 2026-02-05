# LearnEase (Working Name): Accessibility-First Document Understanding Web App

## 1) The problem we are solving

Students often receive assignments, lecture slides, and study materials that are long, dense, and spread across multiple pages/slides. For students with ADHD, learning disabilities, or attention/processing challenges (but not limited to them), this creates real problems:

- **Hard to figure out what exactly to do**
- **Easy to miss requirements, constraints, and deadlines**
- **Hard to keep context when instructions are scattered**
- **Overwhelming cognitive load** → students shut down or delay starting

We are not building a “learning/tutoring app.”

We are building an **accessibility and clarity tool** that helps students understand and act on what is already in the document.

## 2) What the app does (core idea)

A student uploads a document (assignment PDF/DOCX, lecture slides, notes). The system extracts the text and produces structured, actionable outputs designed to reduce cognitive overload:

- **A short overview**
- **A task breakdown (“what to do”)**
- **A checklist of requirements**
- **Key details** like deadlines, submission format, grading/rubric items
- **Chunked sections (cards)** instead of one long summary
- **Optional quiz** from the material (secondary feature)

The key differentiator is:

**We don’t just summarize — we decompose instructions and present them in a way that is easier to process.**

## 3) What “standing out” means for our project

Many teams can build “Upload PDF → AI summary.” That’s common and weak.

We stand out by emphasizing:

- **Instruction Decomposition** (turn messy instructions into steps + checklist)
- **Progressive Disclosure UI** (show content in chunks; reduce overwhelm)
- **Evidence/Citations** (tie extracted requirements back to page/slide when possible)
- **Polished SaaS-level UI** (feels deployed, not a class demo)
- **Measurable evaluation** (time-to-understand + perceived clarity)

## 4) User flow (shared understanding)

### Primary flow (must work)

- **Dashboard**: see recent uploads and progress
- **Upload**: upload assignment/notes/lecture slides (PDF/DOCX/PPTX)
- **Processing**: extraction + analysis runs
- **Study View (Results)**: student sees:
  - “What you need to do”
  - checklist
  - steps
  - key constraints + deadlines
  - chunked sections, expandable
- **Optional Quiz**: generate quiz from content, track progress

## 5) What the UI must feel like (frontend vision)

The UI should look like a complete web app (SaaS style):

- Sidebar navigation + top bar search/profile
- Cards, good spacing, consistent components
- Loading states (skeletons), empty states, clear errors
- “Focus mode” / “one section at a time” reading to reduce overload
- Minimal clutter, readable typography

Frontend’s main job is to make the experience feel:

**Calm, structured, and actionable.**

## 6) What the backend must produce (backend vision)

Backend’s main job is reliable extraction + structured outputs (JSON), not fancy text blobs.

Backend pipeline:

- Receive upload
- Store file + metadata
- Extract text (PDF/DOCX/PPTX)
- Run analysis (OpenAI API or other NLP)
- Return structured JSON for frontend to render

Analysis output should include (minimum):

- `overview` (short)
- `keyActions` (top tasks)
- `checklist` (requirements)
- `steps` (ordered)
- `importantDetails` (deadlines, submission format, grading notes)
- `sections` (chunked content)
- (Optional) `citations` (page/slide references)

## 7) Clear scope (so we don’t overpromise)

### In scope (what we will build)

- ✅ Upload PDF/DOCX/PPTX
- ✅ Text extraction
- ✅ “Instruction Decomposition” + chunked study view
- ✅ Checklist + steps + key requirements
- ✅ Quiz generation (optional but strong)
- ✅ Saved documents + history

### Out of scope (what we should NOT claim)

- ❌ “Improves grades”
- ❌ Full personalized tutoring system
- ❌ Replacing instructors
- ❌ Perfect medical/clinical ADHD treatment claims
- ❌ OCR of scanned handwritten docs (unless explicitly added later)

We should frame it as:

**assistive clarity tool + accessibility-first presentation.**

## 8) Team split (3 frontend + 3 backend aligned to this vision)

### Frontend team focus

- Build a polished app shell + pages
- Make results view highly usable (chunking + checklist + focus mode)
- Connect UI to backend endpoints

### Backend team focus

- Build stable upload + extraction pipeline
- Build analysis endpoint returning structured JSON
- Build quiz endpoints + progress tracking

## 9) How we will demo (expo-ready)

The demo should be simple and powerful:

- Show a real assignment PDF (messy and long)
- Upload it
- Show LearnEase output:
  - “What you need to do”
  - checklist
  - steps
  - deadlines
  - chunked sections
- Generate a quiz and answer 1–2 questions
- Show “progress” updated

That “before vs after” is what makes judges remember.

---

## Project Structure

| Folder | Description |
|---|---|
| `frontend/` | Next.js app (UI, pages, document upload, study view) |
| `backend/` | Express API (extraction + analysis, guardrails, OpenAI) |

- **Frontend setup:** See [`frontend/README.md`](frontend/README.md) and [`frontend/docs/DEV_SETUP.md`](frontend/docs/DEV_SETUP.md).
- **Backend setup:** See [`backend/README.md`](backend/README.md) and `backend/.env.example` for environment variables.

Run the backend and frontend separately for local development.

---

## Team

EECS 4020 Senior Design Project II – University of Toledo, College of Engineering (Spring 2026)

1. Sid Mahesh
2. Nishant Lamichhane
3. Habeeb Sowemimo
4. Darshan Pandey
5. Diptesh Shahi Thakuri
6. Prabin Sapkota