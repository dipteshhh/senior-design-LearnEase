/**
 * Tests for route async state transitions:
 * - createStudyGuideHandler: idle → processing → 202
 * - createStudyGuideHandler: UNSUPPORTED → 202 (LLM pre-classifier gates async)
 * - createStudyGuideHandler: already processing → 409
 * - createStudyGuideHandler: already cached → 200
 * - retryStudyGuideHandler: failed → processing → 202
 * - retryStudyGuideHandler: not failed → 409
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

// Set up isolated test DB + encryption before any store imports
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-route-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

import {
  saveDocument,
  getDocument,
  listDocumentsByUser,
  updateChecklistItem as updateChecklistItemStore,
  updateDocument,
} from "../store/memoryStore.js";
import type { DocumentRecord } from "../store/memoryStore.js";

type MockReq = {
  body?: Record<string, unknown>;
  params?: Record<string, string | undefined>;
  auth?: { userId: string; email: string };
  file?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
  };
};

type MockRes = {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
  setHeader: (name: string, value: string) => MockRes;
};

function makeRes(): MockRes {
  const res: MockRes = {
    headers: {},
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };
  return res;
}

function makeAuthReq(body: Record<string, unknown>): MockReq {
  return {
    body,
    auth: { userId: "test-user", email: "test@example.com" },
  };
}

function makeUploadReq(
  text: string,
  {
    filename = "upload.pdf",
    userId = randomUUID(),
    email = "upload@example.com",
  }: {
    filename?: string;
    userId?: string;
    email?: string;
  } = {}
): MockReq {
  return {
    auth: { userId, email },
    file: {
      buffer: buildPdfBuffer(text),
      mimetype: "application/pdf",
      originalname: filename,
    },
  };
}

function buildPdfBuffer(text: string): Buffer {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length > 70 && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  const pageHeight = Math.max(200, 80 + lines.length * 24);
  const startY = pageHeight - 50;
  const contentOps = [
    "BT",
    "/F1 18 Tf",
    `50 ${startY} Td`,
  ];

  lines.forEach((line, index) => {
    const escapedLine = line
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
    if (index > 0) {
      contentOps.push("0 -24 Td");
    }
    contentOps.push(`(${escapedLine}) Tj`);
  });
  contentOps.push("ET");

  const stream = contentOps.join("\n");
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    `3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj`,
    `4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream endobj`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Root 1 0 R /Size ${objects.length + 1} >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function countArtifactDirectories(): number {
  const artifactsDir = process.env.ARTIFACTS_DIR!;
  if (!fs.existsSync(artifactsDir)) return 0;
  return fs
    .readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
}

function seedDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const doc: DocumentRecord = {
    id: randomUUID(),
    userId: "test-user",
    userEmail: "test@example.com",
    filename: "test.pdf",
    fileType: "PDF",
    documentType: "LECTURE",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 1,
    paragraphCount: null,
    extractedText: "Lecture slides for module week chapter learning objectives.",
    studyGuide: null,
    studyGuideStatus: "idle",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    quiz: null,
    quizStatus: "idle",
    quizErrorCode: null,
    quizErrorMessage: null,
    errorCode: null,
    errorMessage: null,
    assignmentDueDate: null,
    assignmentDueTime: null,
    reminderOptIn: false,
    reminderStatus: "pending",
    reminderDeadlineKey: null,
    reminderLastError: null,
    reminderAttemptedAt: null,
    ...overrides,
  };
  saveDocument(doc);
  return doc;
}

async function loadHandlers() {
  return import("../routes/contract.js");
}

async function assertUnsupportedUploadRejected(options: {
  filename: string;
  text: string;
  userId?: string;
}) {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = options.userId ?? randomUUID();
  const req = makeUploadReq(options.text, { filename: options.filename, userId });
  const res = makeRes();
  const beforeArtifacts = countArtifactDirectories();

  await uploadDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
  const body = res.body as {
    error?: { code?: string; message?: string; details?: Record<string, unknown> };
  };
  assert.equal(body.error?.code, "DOCUMENT_UNSUPPORTED_UPLOAD");
  assert.equal(
    body.error?.message,
    "This document type is not supported. Only lecture notes, homework files, and class notes are accepted."
  );
  assert.deepEqual(body.error?.details ?? {}, {});
  assert.equal(listDocumentsByUser(userId).length, 0);
  assert.equal(countArtifactDirectories(), beforeArtifacts);
}

async function assertSupportedLectureUploadAccepted(options: {
  filename: string;
  text: string;
  userId?: string;
}) {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = options.userId ?? randomUUID();
  const req = makeUploadReq(options.text, { filename: options.filename, userId });
  const res = makeRes();
  const beforeArtifacts = countArtifactDirectories();

  await uploadDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 201);
  const docs = listDocumentsByUser(userId);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.documentType, "LECTURE");
  assert.equal(countArtifactDirectories(), beforeArtifacts + 1);
}

test("createStudyGuideHandler returns 202 and sets status to processing", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument();
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing" });

  // Document should now be in processing state
  const updated = getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.studyGuideStatus, "processing");
});

test("uploadDocumentHandler rejects syllabus before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "syllabus.pdf",
    text: "Course syllabus with grading and office hours for the semester.",
  });
});

test("uploadDocumentHandler rejects academic transcript before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "transcript.pdf",
    text: "Academic Transcript. Official transcript with cumulative GPA and grade points.",
  });
});

test("uploadDocumentHandler rejects resume before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "resume.pdf",
    text: "Resume for Jane Doe. Experience and technical skills summary.",
  });
});

test("uploadDocumentHandler rejects invoice before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "invoice.pdf",
    text: "Invoice number 1042. Billing statement with amount due by May 15.",
  });
});

test("uploadDocumentHandler rejects administrative award approval email before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "award-email.pdf",
    text:
      "From: Student Awards studentawards@lastmile-ed.org\n" +
      "Subject: Congratulations! Your Financial Support Application Has Been Approved\n" +
      "Date: February 24, 2026 at 11:09 AM\n" +
      "To: student@example.com\n" +
      "Award Details:\nAward Amount: $1,744.69\n" +
      "Accept Your Award in the Student Application Portal to begin disbursement for tuition payout.",
  });
});

test("uploadDocumentHandler rejects financial support notice with admin-email patterns before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "financial-support.pdf",
    text:
      "From: Financial Support Office\n" +
      "Subject: Funding approval update\n" +
      "Date: March 1, 2026\n" +
      "To: student@example.com\n" +
      "Your financial support application has been approved. Review the award details, award amount, and disbursement instructions.",
  });
});

test("uploadDocumentHandler rejects insurance policy brochure before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "student-secure.pdf",
    text:
      "International Student Health Insurance\n" +
      "General Information\n" +
      "Claims Information\n" +
      "Policy Benefits\n" +
      "Policy Pricing\n" +
      "Policy Exclusions\n" +
      "Description of Coverage with deductible, copayments, and coinsurance tables.",
  });
});

test("uploadDocumentHandler rejects academic administrative approval form before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "research-coop-approval-form.pdf",
    text:
      "RESEARCH CO-OP APPROVAL FORM\n" +
      "STATEMENT OF EXPECTATIONS\n" +
      "Name: Student Rocket ID #: R01234567\n" +
      "Co-op Semester: Spring 2026\n" +
      "Start Date: January 21, 2026 End Date: May 5, 2026\n" +
      "Supervisor/Professor Name: Dr. Example\n" +
      "Institution Name: University of Toledo\n" +
      "Department Name: EECS\n" +
      "Faculty Signature: Example\nStudent Signature: Student\n" +
      "GradLeaders and CPT approval instructions included.",
  });
});

test("uploadDocumentHandler rejects weekly project status report before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "Project_Report_Week8.pdf",
    text:
      "Weekly Progress Report\n" +
      "Project Status Summary (Percentage Completed: 80%)\n" +
      "Individual Contributions\n" +
      "Next Week's SMART Goals\n" +
      "Action/Task Plan\n" +
      "Open Issues, Risks, Change Requests\n" +
      "Milestones and Deliverables\n" +
      "Project Faculty Advisor\n" +
      "Signatures",
  });
});

test("uploadDocumentHandler rejects completed research paper before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "research-paper.docx",
    text:
      "Research Paper: Effects of Social Media on Civic Engagement\n" +
      "Abstract: This research paper examines survey data from undergraduate students.\n" +
      "Introduction: We review prior literature and define the controversy.\n" +
      "Methodology: We analyzed interview responses and coded recurring themes.\n" +
      "Results: The analysis showed increased political discussion among frequent users.\n" +
      "Discussion and Conclusion: The findings suggest platform-specific effects.\n" +
      "References: Journal of Communication, Computers and Composition.",
  });
});

test("uploadDocumentHandler rejects research proposal before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "Research Proposal.pdf",
    text:
      "Research Proposal\n" +
      "Title: Data-Driven Neural Network Models for Intelligent Engineering Applications\n" +
      "Co-op Period: January 21, 2026 - May 5, 2026\n" +
      "Proposed Faculty Supervisor: Dr. Example\n" +
      "Research Objectives\n" +
      "Scope of Work\n" +
      "Proposed Datasets\n" +
      "Methodology\n" +
      "Timeline & Milestones\n" +
      "Expected Outcomes\n" +
      "Student Responsibilities\n" +
      "Faculty Supervisor Role",
  });
});

test("uploadDocumentHandler rejects rental agreement before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "Thrifty Rental Agreement.pdf",
    text:
      "Thrifty Rental Agreement\n" +
      "Rental Record# 422397172\n" +
      "Vehicle: 2025 ALTIMA\n" +
      "Rental Rate 3 @ $52.02 per day\n" +
      "Fuel Responsibility\n" +
      "Service Charges/Taxes\n" +
      "TOTAL ESTIMATED CHARGE $268.96\n" +
      "Credit Card Authorization Amount $469.00\n" +
      "Rental Location: ILIKAI HOTEL\n" +
      "Rental Time: 03/02/26 at 12:11PM\n" +
      "Return Time: 03/05/26 at 10:30AM",
  });
});

test("uploadDocumentHandler rejects peer observation/self-assessment document before persistence", async () => {
  await assertUnsupportedUploadRejected({
    filename: "Peer Observation and Self Assessment.pdf",
    text:
      "Senior Design Project Mid-Semester Peer Observations and Self Assessment\n" +
      "What is your name?\n" +
      "What are your contributions to the senior design project?\n" +
      "Group member name:\n" +
      "What are this group member's contributions to the senior design project?",
  });
});

test("uploadDocumentHandler stores supported homework upload", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const req = makeUploadReq("Homework 3 assignment. Submit by due date.", {
    filename: "homework.pdf",
    userId,
  });
  const res = makeRes();
  const beforeArtifacts = countArtifactDirectories();

  await uploadDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 201);
  const docs = listDocumentsByUser(userId);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.documentType, "HOMEWORK");
  assert.equal(countArtifactDirectories(), beforeArtifacts + 1);
});

test("uploadDocumentHandler stores figure-heavy homework PDF text", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const req = makeUploadReq(
    "September 20, 2023 Circuits Fall 2023 Homework Assignment # 3 " +
      "The assignment is due on Sunday. " +
      "1. Find v1 and v2. " +
      "2. Calculate currents i1 through i4. " +
      "3. Determine voltages v1, v2, and v3.",
    {
      filename: "HW3.pdf",
      userId,
    }
  );
  const res = makeRes();
  const beforeArtifacts = countArtifactDirectories();

  await uploadDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 201);
  const docs = listDocumentsByUser(userId);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.documentType, "HOMEWORK");
  assert.equal(countArtifactDirectories(), beforeArtifacts + 1);
});

test("uploadDocumentHandler stores supported lecture upload", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const req = makeUploadReq("Lecture slides for week 5 module on sorting.", {
    filename: "lecture.pdf",
    userId,
  });
  const res = makeRes();
  const beforeArtifacts = countArtifactDirectories();

  await uploadDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 201);
  const docs = listDocumentsByUser(userId);
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.documentType, "LECTURE");
  assert.equal(countArtifactDirectories(), beforeArtifacts + 1);
});

test("uploadDocumentHandler accepts lecture PDF 01A course introduction content", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "4560-S26 - Lecture 01A - Course Introduction.pdf",
    text:
      "Spring 2026\n" +
      "Lecture 01: Course Introduction\n" +
      "Welcome to EECS 4560 / 5560 / 6980\n" +
      "Instructor: Dr. Larry Thomas\n" +
      "Office Hours: Still TBD\n" +
      "We meet at: M/W 9:35 - 10:55 AM (lecture)\n" +
      "We meet in: NE 2105 / RC 301: FOR EXAMS ONLY\n" +
      "Lectures in Blackboard Collaborate.\n" +
      "About me\n" +
      "Philosophy for the Course\n" +
      "Our Database Platform\n" +
      "One Sticky Point\n" +
      "About the Textbook(s): Textbook (required).\n" +
      "My Lectures: Almost universally PowerPoint presentations.\n" +
      "I will post my slides to Blackboard AFTER the lecture.\n" +
      "A note about lectures in general.\n" +
      "Assignments will be submitted via Blackboard (as .7z archives - see syllabus).\n" +
      "Your homework will be submitted as MS Word files.\n" +
      "Academic Integrity: You may not post any class materials online.",
  });
});

test("uploadDocumentHandler accepts lecture PDF 01B chapter introduction content", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "4560-S26 - Lecture 01B - Chapter 01 - Introduction.pdf",
    text:
      "Lecture 01B: Chapter 01 - Introduction to Relational Databases and SQL\n" +
      "Chapter 1 - Objectives\n" +
      "After completing this chapter, you should be able to describe tables, rows, and cells.\n" +
      "Continued next slide...\n" +
      "Tables typically model entities such as invoices, customers, students, vendors, employees.\n" +
      "The InvoiceID in the Invoice table is the Invoice's PK.",
  });
});

test("uploadDocumentHandler accepts lecture deck with logistics and policy slides", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "lecture-logistics.pdf",
    text:
      "Lecture 02: Course Expectations\n" +
      "Slides for week 2 module.\n" +
      "Office hours, academic integrity, and technology requirements.\n" +
      "Lecture slides will be posted after class.\n" +
      "See the syllabus for archive-format submission rules.",
  });
});

test("uploadDocumentHandler accepts lecture deck with textbook and objectives slides", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "lecture-objectives.pdf",
    text:
      "Lecture 03: Chapter 02 - Data Modeling\n" +
      "Chapter Objectives\n" +
      "After completing this chapter, you should be able to explain ER modeling.\n" +
      "Textbook chapter coverage and concept explanation slides continue next slide.",
  });
});

test("uploadDocumentHandler accepts weaker lecture deck with isolated syllabus mention", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "lecture-syllabus-reference.pdf",
    text:
      "Lecture 04: Query Optimization\n" +
      "Chapter 4 overview and learning objectives.\n" +
      "Slides explain join ordering, cost models, and execution plans.\n" +
      "See syllabus for archive-format submission rules.",
  });
});

test("uploadDocumentHandler accepts weaker lecture deck with isolated amount due mention", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "lecture-invoice-example.pdf",
    text:
      "Lecture 05: Entity Relationships\n" +
      "Chapter objectives and concept overview.\n" +
      "Slides explain why amount due belongs in an invoice example table.\n" +
      "Lecture discussion compares invoices, customers, and orders.",
  });
});

test("uploadDocumentHandler accepts weaker lecture deck with isolated portfolio mention", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "lecture-portfolio.pdf",
    text:
      "Lecture 06: Career Applications of UX Research\n" +
      "Module agenda and learning objectives.\n" +
      "Slides explain how to present course projects in a portfolio after graduation.\n" +
      "Concept overview and discussion prompts continue next slide.",
  });
});

test("uploadDocumentHandler accepts weaker lecture deck with isolated transcript mention", async () => {
  await assertSupportedLectureUploadAccepted({
    filename: "lecture-transcript.pdf",
    text:
      "Lecture 07: Advising and Degree Planning\n" +
      "Week 7 lecture slides with learning objectives.\n" +
      "Concept explanation covers how transcript data maps to prerequisite checks.\n" +
      "Chapter overview and examples continue next slide.",
  });
});

test("uploadDocumentHandler reuses existing document for exact duplicate by same user", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const text = "Homework 8 assignment. Submit by due date.";
  const beforeArtifacts = countArtifactDirectories();

  const firstReq = makeUploadReq(text, {
    filename: "duplicate-homework.pdf",
    userId,
  });
  const firstRes = makeRes();
  await uploadDocumentHandler(firstReq as any, firstRes as any);

  assert.equal(firstRes.statusCode, 201);
  const firstBody = firstRes.body as { document_id: string };
  const firstDocumentId = firstBody.document_id;
  assert.ok(firstDocumentId);

  const secondReq = makeUploadReq(text, {
    filename: "duplicate-homework.pdf",
    userId,
  });
  const secondRes = makeRes();
  await uploadDocumentHandler(secondReq as any, secondRes as any);

  assert.equal(secondRes.statusCode, 200);
  const secondBody = secondRes.body as {
    document_id: string;
    reused_existing: boolean;
  };
  assert.equal(secondBody.reused_existing, true);
  assert.equal(secondBody.document_id, firstDocumentId);

  const docs = listDocumentsByUser(userId);
  assert.equal(docs.length, 1);
  assert.equal(countArtifactDirectories(), beforeArtifacts + 1);
});

test("concurrent identical uploads by same user create only one document and artifact set", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const text = "Homework 12 assignment. Submit by due date.";
  const beforeArtifacts = countArtifactDirectories();

  const reqA = makeUploadReq(text, { filename: "concurrent-duplicate.pdf", userId });
  const reqB = makeUploadReq(text, { filename: "concurrent-duplicate.pdf", userId });
  const resA = makeRes();
  const resB = makeRes();

  await Promise.all([
    uploadDocumentHandler(reqA as any, resA as any),
    uploadDocumentHandler(reqB as any, resB as any),
  ]);

  const statuses = [resA.statusCode, resB.statusCode].sort();
  assert.deepEqual(statuses, [200, 201]);

  const bodyA = resA.body as { document_id?: string };
  const bodyB = resB.body as { document_id?: string };
  assert.ok(bodyA.document_id);
  assert.ok(bodyB.document_id);
  assert.equal(bodyA.document_id, bodyB.document_id);

  const docs = listDocumentsByUser(userId);
  assert.equal(docs.length, 1);
  assert.equal(countArtifactDirectories(), beforeArtifacts + 1);
});

test("legacy document row with null content_hash is backfilled and reused", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const text = "Homework 13 assignment. Submit by due date.";

  const firstReq = makeUploadReq(text, { filename: "legacy-null-hash.pdf", userId });
  const firstRes = makeRes();
  await uploadDocumentHandler(firstReq as any, firstRes as any);
  const firstId = (firstRes.body as { document_id: string }).document_id;
  assert.ok(firstId);

  updateDocument(firstId, (current) => ({
    ...current,
    contentHash: null,
  }));
  assert.equal(getDocument(firstId)?.contentHash ?? null, null);

  const secondReq = makeUploadReq(text, { filename: "legacy-null-hash.pdf", userId });
  const secondRes = makeRes();
  await uploadDocumentHandler(secondReq as any, secondRes as any);

  const secondBody = secondRes.body as {
    document_id: string;
    reused_existing: boolean;
  };
  assert.equal(secondRes.statusCode, 200);
  assert.equal(secondBody.reused_existing, true);
  assert.equal(secondBody.document_id, firstId);
  assert.ok(getDocument(firstId)?.contentHash);
});

test("uploadDocumentHandler allows different users to upload identical files", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const text = "Lecture slides for week 6 module and chapter overview.";
  const userA = randomUUID();
  const userB = randomUUID();
  const beforeArtifacts = countArtifactDirectories();

  const reqA = makeUploadReq(text, { filename: "same-content.pdf", userId: userA });
  const resA = makeRes();
  await uploadDocumentHandler(reqA as any, resA as any);

  const reqB = makeUploadReq(text, { filename: "same-content.pdf", userId: userB });
  const resB = makeRes();
  await uploadDocumentHandler(reqB as any, resB as any);

  assert.equal(resA.statusCode, 201);
  assert.equal(resB.statusCode, 201);
  assert.equal(listDocumentsByUser(userA).length, 1);
  assert.equal(listDocumentsByUser(userB).length, 1);
  assert.equal(countArtifactDirectories(), beforeArtifacts + 2);
});

test("duplicate upload reuses existing ready document", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const text = "Homework 9 assignment. Submit by due date.";

  const firstReq = makeUploadReq(text, { filename: "ready-duplicate.pdf", userId });
  const firstRes = makeRes();
  await uploadDocumentHandler(firstReq as any, firstRes as any);
  const firstId = (firstRes.body as { document_id: string }).document_id;
  assert.ok(firstId);

  updateDocument(firstId, (current) => ({
    ...current,
    studyGuideStatus: "ready",
    studyGuideErrorCode: null,
    studyGuideErrorMessage: null,
    status: "ready",
  }));

  const secondReq = makeUploadReq(text, { filename: "ready-duplicate.pdf", userId });
  const secondRes = makeRes();
  await uploadDocumentHandler(secondReq as any, secondRes as any);

  const body = secondRes.body as {
    document_id: string;
    reused_existing: boolean;
    status: string;
  };
  assert.equal(secondRes.statusCode, 200);
  assert.equal(body.document_id, firstId);
  assert.equal(body.reused_existing, true);
  assert.equal(body.status, "ready");
});

test("duplicate upload reuses existing processing document", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const text = "Homework 10 assignment. Submit by due date.";

  const firstReq = makeUploadReq(text, { filename: "processing-duplicate.pdf", userId });
  const firstRes = makeRes();
  await uploadDocumentHandler(firstReq as any, firstRes as any);
  const firstId = (firstRes.body as { document_id: string }).document_id;
  assert.ok(firstId);

  updateDocument(firstId, (current) => ({
    ...current,
    studyGuideStatus: "processing",
    studyGuideErrorCode: "STUDY_GUIDE_PROCESSING",
    studyGuideErrorMessage: null,
    status: "processing",
  }));

  const secondReq = makeUploadReq(text, { filename: "processing-duplicate.pdf", userId });
  const secondRes = makeRes();
  await uploadDocumentHandler(secondReq as any, secondRes as any);

  const body = secondRes.body as {
    document_id: string;
    reused_existing: boolean;
    status: string;
  };
  assert.equal(secondRes.statusCode, 200);
  assert.equal(body.document_id, firstId);
  assert.equal(body.reused_existing, true);
  assert.equal(body.status, "processing");
});

test("duplicate upload reuses existing failed document", async () => {
  const { uploadDocumentHandler } = await loadHandlers();
  const userId = randomUUID();
  const text = "Homework 11 assignment. Submit by due date.";

  const firstReq = makeUploadReq(text, { filename: "failed-duplicate.pdf", userId });
  const firstRes = makeRes();
  await uploadDocumentHandler(firstReq as any, firstRes as any);
  const firstId = (firstRes.body as { document_id: string }).document_id;
  assert.ok(firstId);

  updateDocument(firstId, (current) => ({
    ...current,
    studyGuideStatus: "failed",
    studyGuideErrorCode: "STUDY_GUIDE:GENERATION_FAILED",
    studyGuideErrorMessage: "Generation failed",
    status: "failed",
    errorCode: "STUDY_GUIDE:GENERATION_FAILED",
    errorMessage: "Generation failed",
  }));

  const secondReq = makeUploadReq(text, { filename: "failed-duplicate.pdf", userId });
  const secondRes = makeRes();
  await uploadDocumentHandler(secondReq as any, secondRes as any);

  const body = secondRes.body as {
    document_id: string;
    reused_existing: boolean;
    status: string;
  };
  assert.equal(secondRes.statusCode, 200);
  assert.equal(body.document_id, firstId);
  assert.equal(body.reused_existing, true);
  assert.equal(body.status, "failed");
});

test("createStudyGuideHandler returns 202 for UNSUPPORTED document (LLM gates async)", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "UNSUPPORTED" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  // Handler returns 202 immediately; the LLM pre-classifier will gate
  // generation asynchronously inside the background task.
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing" });
});

test("createStudyGuideHandler returns 409 when already processing", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "processing" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
  assert.equal(res.headers["retry-after"], "5");
});

test("createQuizHandler returns 409 with Retry-After when already processing", async () => {
  const { createQuizHandler } = await loadHandlers();
  const doc = seedDocument({ quizStatus: "processing", documentType: "LECTURE" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createQuizHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
  assert.equal(res.headers["retry-after"], "5");
});

test("createStudyGuideHandler returns 200 cached when study guide exists", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const fakeGuide = {
    overview: { title: "T", document_type: "LECTURE", summary: "S" },
    key_actions: [],
    checklist: [],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [],
  };
  const doc = seedDocument({ studyGuide: fakeGuide as any, studyGuideStatus: "ready" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ready", cached: true });
});

test("createStudyGuideHandler returns 409 when in failed state (must use retry)", async () => {
  const { createStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "failed" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await createStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
});

test("retryStudyGuideHandler returns 202 from failed state", async () => {
  const { retryStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "failed" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await retryStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing", retry: true });

  const updated = getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.studyGuideStatus, "processing");
});

test("retryStudyGuideHandler returns 409 when not in failed state", async () => {
  const { retryStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ studyGuideStatus: "idle" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await retryStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 409);
});

test("retryStudyGuideHandler returns 202 for UNSUPPORTED document (LLM gates async)", async () => {
  const { retryStudyGuideHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "UNSUPPORTED", studyGuideStatus: "failed" });
  const req = makeAuthReq({ document_id: doc.id });
  const res = makeRes();

  await retryStudyGuideHandler(req as any, res as any);

  // Handler returns 202 immediately; the LLM pre-classifier will gate
  // generation asynchronously inside the background task.
  assert.equal(res.statusCode, 202);
  assert.deepEqual(res.body, { status: "processing", retry: true });
});

test("listDocumentsHandler returns per-flow statuses for each document", async () => {
  const { listDocumentsHandler } = await loadHandlers();
  const doc = seedDocument({
    studyGuideStatus: "processing",
    quizStatus: "failed",
    quizErrorCode: "QUIZ:SCHEMA_VALIDATION_FAILED",
    quizErrorMessage: "Schema invalid",
    status: "failed",
    errorCode: "QUIZ:SCHEMA_VALIDATION_FAILED",
    errorMessage: "Schema invalid",
  });
  const req: MockReq = {
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await listDocumentsHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body));
  const items = res.body as Array<Record<string, unknown>>;
  const item = items.find((entry) => entry.id === doc.id);
  assert.ok(item, "expected seeded document in list response");
  assert.equal(item.study_guide_status, "processing");
  assert.equal(item.quiz_status, "failed");
});

test("getDocumentHandler returns metadata for owned document", async () => {
  const { getDocumentHandler } = await loadHandlers();
  const doc = seedDocument({
    studyGuideStatus: "ready",
    quizStatus: "failed",
    quizErrorCode: "QUIZ:GENERATION_FAILED",
    quizErrorMessage: "Quiz failed",
  });
  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await getDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as Record<string, unknown>;
  assert.equal(body.id, doc.id);
  assert.equal(body.filename, doc.filename);
  assert.equal(body.study_guide_status, "ready");
  assert.equal(body.quiz_status, "failed");
});

test("getDocumentHandler backfills missing homework due date from extracted text", async () => {
  const { getDocumentHandler } = await loadHandlers();
  const doc = seedDocument({
    documentType: "HOMEWORK",
    assignmentDueDate: null,
    extractedText:
      "Assignment 01\nAssigned: 09/28/2025\nDue: 10/12/2025 at 11:59pm\nSubmit on Canvas.",
  });
  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await getDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as Record<string, unknown>;
  assert.equal(body.assignment_due_date, "2025-10-12");

  const persisted = getDocument(doc.id);
  assert.ok(persisted);
  assert.equal(persisted.assignmentDueDate, "2025-10-12");
});

test("getDocumentHandler returns 403 for non-owner", async () => {
  const { getDocumentHandler } = await loadHandlers();
  const doc = seedDocument();
  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "other-user", email: "other@example.com" },
  };
  const res = makeRes();

  await getDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 403);
});

test("getStudyGuideHandler includes checklist_completion state", async () => {
  const { getStudyGuideHandler } = await loadHandlers();
  const fakeGuide = {
    overview: { title: "T", document_type: "LECTURE", summary: "S" },
    key_actions: [],
    checklist: [
      {
        id: "item-1",
        label: "Read section 1",
        supporting_quote: "Read section 1 before class.",
        citations: [
          { source_type: "pdf", page: 1, excerpt: "Read section 1 before class." },
        ],
      },
    ],
    important_details: { dates: [], policies: [], contacts: [], logistics: [] },
    sections: [
      {
        id: "sec-1",
        title: "Section 1",
        content: "Read section 1 before class.",
        citations: [
          { source_type: "pdf", page: 1, excerpt: "Read section 1 before class." },
        ],
      },
    ],
  };
  const doc = seedDocument({ studyGuide: fakeGuide as any, studyGuideStatus: "ready" });
  const updated = updateChecklistItemStore(doc.id, "item-1", true);
  assert.equal(updated, true);

  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await getStudyGuideHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as Record<string, unknown>;
  const checklistCompletion = body.checklist_completion as Record<string, boolean>;
  assert.equal(checklistCompletion["item-1"], true);
});

test("deleteDocumentHandler deletes an owned document", async () => {
  const { deleteDocumentHandler } = await loadHandlers();
  const doc = seedDocument();
  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await deleteDocumentHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(getDocument(doc.id), undefined);
});

// ══════════════════════════════════════════════════════════════════════
// updateDueTimeHandler route tests
// ══════════════════════════════════════════════════════════════════════

test("updateDueTimeHandler rejects when due date is missing (DUE_DATE_REQUIRED_FOR_TIME)", async () => {
  const { updateDueTimeHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "HOMEWORK", assignmentDueDate: null });
  const req: MockReq = {
    params: { documentId: doc.id },
    body: { due_time: "14:00" },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await updateDueTimeHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
  const body = res.body as { error: { code: string } };
  assert.equal(body.error.code, "DUE_DATE_REQUIRED_FOR_TIME");
});

test("updateDueTimeHandler rejects invalid HH:MM format", async () => {
  const { updateDueTimeHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "HOMEWORK", assignmentDueDate: "2099-06-15" });
  const req: MockReq = {
    params: { documentId: doc.id },
    body: { due_time: "25:99" },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await updateDueTimeHandler(req as any, res as any);

  assert.equal(res.statusCode, 400);
  const body = res.body as { error: { code: string } };
  assert.equal(body.error.code, "INVALID_DUE_TIME");
});

test("updateDueTimeHandler rejects non-HOMEWORK documents", async () => {
  const { updateDueTimeHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "LECTURE", assignmentDueDate: "2099-06-15" });
  const req: MockReq = {
    params: { documentId: doc.id },
    body: { due_time: "14:00" },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await updateDueTimeHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
  const body = res.body as { error: { code: string } };
  assert.equal(body.error.code, "NOT_HOMEWORK");
});

test("updateDueTimeHandler accepts valid due-time when due date exists", async () => {
  const { updateDueTimeHandler } = await loadHandlers();
  const doc = seedDocument({ documentType: "HOMEWORK", assignmentDueDate: "2099-06-15" });
  const req: MockReq = {
    params: { documentId: doc.id },
    body: { due_time: "14:30" },
    auth: { userId: "test-user", email: "test@example.com" },
  };
  const res = makeRes();

  await updateDueTimeHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as Record<string, unknown>;
  assert.equal(body.success, true);
  assert.equal(body.assignment_due_time, "14:30");
  assert.equal(body.assignment_due_date, "2099-06-15");
  assert.equal(body.reminder_status, "pending");

  // Verify persisted
  const updated = getDocument(doc.id);
  assert.ok(updated);
  assert.equal(updated.assignmentDueTime, "14:30");
  assert.equal(updated.reminderStatus, "pending");
});
