# LearnEase

**Accessibility-First Document Understanding for Academic Clarity**  
EECS 4020 — Senior Design Project II  
University of Toledo · College of Engineering

LearnEase is a desktop-focused web application that helps students **understand academic documents** (homework, lecture notes, and syllabi) by restructuring dense text into **clear, accessible, and traceable study views**.

LearnEase is **not** a homework solver. It does **not** generate answers, solutions, or step-by-step guidance for graded assignments. It is **not** a tutoring tool for cheating or academic dishonesty.

---

## 🚫 What LearnEase Will Never Do

- Solve homework problems
- Provide answers, hints, or solution steps
- Generate essays, code, or computed results
- Infer tasks or requirements not explicitly stated in the document

Academic integrity is enforced at the **prompt**, **backend**, and **UI** levels.

---

## ✨ What LearnEase Does

- Allows users to log in with a Google account
- Provides a dashboard where users can:
  - View recent uploads
  - See document page count
  - See upload timestamps
- Provides a persistent left-hand navigation with:
  - Dashboard
  - Upload
  - Settings
- Allows users to upload **PDF or DOCX** academic documents:
  - Homework
  - Lecture notes
  - Syllabi
- Allows users to upload documents from:
  - the Dashboard (via the **Upload Document** action), or
  - the **Upload** page in the left navigation  
  Both entry points route to the **same Upload flow**
- Automatically detects document type
- Uses a local, deterministic **first-match-wins** classifier (no OpenAI classification)
- Enables the **Create Study Guide** action only for supported academic documents
- Includes a **Settings** page where users can:
  - View privacy and encryption status
  - Control automatic document deletion (default: 30 days)
  - View storage usage
  - Permanently delete all stored data

---

## 🧠 Study Guide & Core Features

When a user explicitly clicks **Create Study Guide**, LearnEase generates a **read-only Study Guide** that:

- Breaks content into structured sections
- Separates tasks, constraints, and planning details
- Includes **verifiable source citations**

### 📚 Study Guide Tabs (Context-Aware)

- **Overview** — orientation only
- **Key Actions** — explicit tasks quoted directly from the document
- **Checklist** — explicit constraints and requirements
- **Important Details** — due dates, grading notes, and policies
- **Sections** — chunked content for easier reading

Tabs are shown or hidden based on document type and extracted content.

---

### 🎯 Focus Mode (Lecture Documents Only)

- Displays one section at a time
- Provides a distraction-free reading experience
- Hidden for homework and syllabus documents

---

### 🧪 Test Your Knowledge (Lecture Documents Only)

- Generates comprehension-only questions
- Generated **only when explicitly triggered by the user and never automatically**
- Questions are answerable verbatim from the lecture document
- No grading, analytics, or storage of attempts
- Hidden for homework and syllabus documents

---

## 🔍 Transparency & Citations

Every generated section is traceable to the original document:

- **PDF files:** page number + quoted excerpt
- **DOCX files:** paragraph anchor + quoted excerpt

Users can view citations directly in the UI via a “View source citations” control.

---

## 🛠 Tech Stack

- **Frontend:** Next.js (React), Tailwind CSS
- **Backend:** Node.js API server (contract defined in `docs/API.md`)
- **Storage:** SQLite (metadata and cached outputs)
- **Authentication:** Google OAuth 2.0
- **AI API:** OpenAI
- **Hosting:** Railway
- **File Encryption:** AES-256 (at rest)

---

## 👥 Team

University of Toledo · College of Engineering

- Sid Mahesh
- Nishant Lamichhane
- Habeeb Sowemimo
- Darshan Pandey
- Diptesh Shahi Thakuri
- Prabin Sapkota

---

## 📄 License

Academic-only senior design project.  
Not intended for commercial use.

---

For full system specifications, architecture decisions, and implementation rules, see:

- `docs/AI_contract.md` (LLM behavior rules)
- `docs/SPEC.md` (system behavior)
- `docs/DB_SCHEMA.md` (database + retention source of truth)
- `docs/SCHEMA.md` (mirror of database schema)
- `docs/API.md` (endpoints)
- `docs/API_ERRORS.md` (status codes + idempotency)
- `docs/SCHEMAS.md` (exact JSON output shapes)
- `docs/VALIDATION.md` (quote/citation enforcement)
- `docs/AUTH.md` (auth contract)
- `docs/CLASSIFICATION.md` (local document classification rules)
