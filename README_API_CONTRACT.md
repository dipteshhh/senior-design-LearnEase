# LearnEase API Contract v1 (Frontend ↔ Backend)

Base URL: http://localhost:3001
All responses are JSON.
Document IDs are strings (slug/uuid).

---

## 1) Create Document (Upload)
POST /api/documents

Request: multipart/form-data
- file: PDF/DOCX/PPTX (required)

Response 201:
{
  "id": "advanced-algorithms",
  "title": "Advanced Algorithms Assignment.pdf",
  "pages": 12,
  "createdAt": "2026-02-09T23:10:00Z",
  "status": "PROCESSING"
}

Notes:
- Backend may set pages=null if unknown during upload.
- If file type unsupported -> 400.

---

## 2) List Recent Documents (Dashboard)
GET /api/documents?limit=12

Response 200:
[
  {
    "id": "advanced-algorithms",
    "title": "Advanced Algorithms Assignment.pdf",
    "pages": 12,
    "createdAt": "2026-02-09T23:10:00Z",
    "status": "READY",
    "progress": 100
  }
]

status: "READY" | "PROCESSING" | "FAILED"
progress: number 0-100 (optional; required if PROCESSING)

---

## 3) Get Document Detail (Study Guide Page)
GET /api/documents/:id

Response 200:
{
  "id": "advanced-algorithms",
  "title": "Advanced Algorithms Assignment.pdf",
  "pages": 12,
  "createdAt": "2026-02-09T23:10:00Z",
  "status": "READY",
  "studyGuide": {
    "summary": "string",
    "keyTakeaways": ["string"],
    "checklist": ["string"]
  }
}

If status=PROCESSING:
- studyGuide may be null
- include progress

If status=FAILED:
- include errorMessage

---

## 4) Get Quiz (Quiz Page)
GET /api/documents/:id/quiz

Response 200:
{
  "docId": "advanced-algorithms",
  "title": "Advanced Algorithms Assignment.pdf",
  "questions": [
    {
      "id": "q1",
      "question": "string",
      "options": ["string", "string", "string", "string"]
    }
  ]
}

Notes:
- No scoring required for MVP.
- Questions can be generated from extracted text.

---

## 5) (Optional MVP) Transform Text
POST /api/transform
Body:
{
  "inputText": "string",
  "mode": "simple" | "steps" | "bullets"
}
Response:
{
  "hintMode": false,
  "mode": "simple",
  "outputText": "string"
}

This can be used for “Paste Text” mode and/or internal pipeline helpers.
