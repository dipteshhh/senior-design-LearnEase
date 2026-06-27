import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { tinyPng } from "./visualInventoryTestUtils.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-visual-observations-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";
process.env.OPENAI_CIRCUIT_BREAKER_FAILURE_THRESHOLD = "0";

const sqlite = await import("../db/sqlite.js");
sqlite.initializeDatabase();

import type { DocumentRecord } from "../store/memoryStore.js";
import { VisualObservationsArtifact } from "../schemas/visualObservations.js";

const store = await import("../store/memoryStore.js");
const visualObservationAnalyzer = await import("../services/visualObservationAnalyzer.js");
const routes = await import("../routes/contract.js");

const {
  getVisualObservationsArtifact,
  saveDocument,
  saveVisualInventoryArtifact,
} = store;
const {
  generateVisualObservationsBestEffort,
  generateVisualObservationsForDocument,
} = visualObservationAnalyzer;
const { getVisualObservationsHandler } = routes;

type MockReq = {
  params?: Record<string, string | undefined>;
  auth?: { userId: string; email: string };
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

function seedDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  const doc: DocumentRecord = {
    id: randomUUID(),
    userId: "visual-user",
    userEmail: "visual@example.com",
    filename: "lecture.docx",
    fileType: "DOCX",
    contentHash: null,
    documentType: "LECTURE",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 1,
    paragraphCount: 1,
    extractedText: "Lecture notes about graphs and traversal.",
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

function saveOneImageInventory(documentId: string): void {
  const imageHash = createHash("sha256").update(tinyPng).digest("hex");
  saveVisualInventoryArtifact(documentId, {
    manifest: {
      document_id: documentId,
      status: "complete",
      created_at: new Date().toISOString(),
      source_file_type: "DOCX",
      extraction_version: "test",
      limits: {
        max_images: 50,
        max_total_bytes: 25 * 1024 * 1024,
        max_image_bytes: 5 * 1024 * 1024,
        max_image_pixels: 4096 * 4096,
        timeout_ms: 15_000,
      },
      items: [
        {
          id: "docx-image-1",
          source_file_type: "DOCX",
          origin: "docx_embedded_image",
          image_index: 1,
          media_path: "word/media/image1.png",
          page: null,
          content_type: "image/png",
          byte_size: tinyPng.byteLength,
          image_hash: imageHash,
          encrypted_artifact_path: "visuals/docx-image-1.png",
          width: 1,
          height: 1,
        },
      ],
      warnings: [],
    },
    assets: [{ encryptedArtifactPath: "visuals/docx-image-1.png", content: tinyPng }],
  });
}

function makeOpenAiClient(responsePayload: unknown, capture?: { request?: unknown; calls: number }) {
  return {
    chat: {
      completions: {
        async create(params: unknown) {
          if (capture) {
            capture.request = params;
            capture.calls += 1;
          }
          return {
            choices: [{ message: { content: JSON.stringify(responsePayload) } }],
          };
        },
      },
    },
  };
}

test("lecture document with visual inventory creates visual observations", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const capture = { calls: 0, request: undefined as unknown };
  const fakeClient = makeOpenAiClient(
    {
      observations: [
        {
          image_index: 1,
          type: "diagram",
          summary: "A small diagram is visible.",
          visible_text: ["Graph"],
          academic_relevance: "It may support reviewing graph traversal concepts.",
          confidence: "medium",
          limitations: ["The image is very small."],
        },
      ],
    },
    capture
  );

  const artifact = await generateVisualObservationsForDocument(
    doc.id,
    doc.userId,
    fakeClient as any
  );

  assert.equal(capture.calls, 1);
  assert.equal(artifact.status, "complete");
  assert.equal(artifact.observations.length, 1);
  assert.equal(artifact.observations[0]?.visual_inventory_item_id, "docx-image-1");
  assert.equal(artifact.observations[0]?.media_path, "word/media/image1.png");
  assert.equal(artifact.observations[0]?.summary, "A small diagram is visible.");

  const persisted = getVisualObservationsArtifact(doc.id);
  assert.equal(persisted.ok, true);
  if (persisted.ok) {
    assert.equal(persisted.artifact.observations.length, 1);
  }
});

test("homework document skips visual observations without calling OpenAI", async () => {
  const doc = seedDocument({ documentType: "HOMEWORK", filename: "homework.docx" });
  saveOneImageInventory(doc.id);
  const capture = { calls: 0, request: undefined as unknown };
  const fakeClient = makeOpenAiClient({ observations: [] }, capture);

  const artifact = await generateVisualObservationsForDocument(
    doc.id,
    doc.userId,
    fakeClient as any
  );

  assert.equal(capture.calls, 0);
  assert.equal(artifact.status, "skipped");
  assert.equal(artifact.observations.length, 0);
  assert.match(artifact.warnings.join(" "), /only available for lecture/i);
});

test("lecture document without visual inventory returns skipped without calling OpenAI", async () => {
  const doc = seedDocument();
  const capture = { calls: 0, request: undefined as unknown };
  const fakeClient = makeOpenAiClient({ observations: [] }, capture);

  const artifact = await generateVisualObservationsForDocument(
    doc.id,
    doc.userId,
    fakeClient as any
  );

  assert.equal(capture.calls, 0);
  assert.equal(artifact.status, "skipped");
  assert.equal(artifact.observations.length, 0);
  assert.match(artifact.warnings.join(" "), /No visual inventory/i);
});

test("visual observation output schema validation rejects invalid observations", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const fakeClient = makeOpenAiClient({
    observations: [
      {
        image_index: 1,
        type: "solution_steps",
        summary: "Invalid type.",
        visible_text: [],
        academic_relevance: "Invalid.",
        confidence: "medium",
        limitations: [],
      },
    ],
  });

  await assert.rejects(
    () => generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any),
    /Invalid/
  );
});

test("OpenAI vision failure is isolated by best-effort wrapper", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const failingClient = {
    chat: {
      completions: {
        async create() {
          throw new Error("vision unavailable");
        },
      },
    },
  };

  await generateVisualObservationsBestEffort(doc.id, doc.userId, failingClient as any);
  assert.ok(true);
});

test("visual observations route enforces ownership and returns no raw image bytes", async () => {
  const doc = seedDocument();
  const rawImageBase64 = tinyPng.toString("base64");
  const artifact = VisualObservationsArtifact.parse({
    document_id: doc.id,
    status: "complete",
    created_at: new Date().toISOString(),
    model: "test-model",
    source_inventory_artifact_hash: "inventory-hash",
    observations: [
      {
        id: randomUUID(),
        visual_inventory_item_id: "docx-image-1",
        image_hash: createHash("sha256").update(tinyPng).digest("hex"),
        source_file_type: "DOCX",
        origin: "docx_embedded_image",
        media_path: "word/media/image1.png",
        page: null,
        image_index: 1,
        content_type: "image/png",
        type: "diagram",
        summary: "A diagram is visible.",
        visible_text: [],
        academic_relevance: "Helpful for review.",
        confidence: "medium",
        limitations: [],
      },
    ],
    warnings: [],
  });
  const { saveVisualObservationsArtifact } = await import("../store/memoryStore.js");
  saveVisualObservationsArtifact(doc.id, artifact);

  const ownerReq: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: doc.userId, email: "visual@example.com" },
  };
  const ownerRes = makeRes();
  await getVisualObservationsHandler(ownerReq as any, ownerRes as any);

  assert.equal(ownerRes.statusCode, 200);
  const responseText = JSON.stringify(ownerRes.body);
  assert.equal(responseText.includes(rawImageBase64), false);
  assert.equal(responseText.includes("encrypted_artifact_path"), false);
  assert.equal(responseText.includes("data:image"), false);

  const otherReq: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: "other-user", email: "other@example.com" },
  };
  const otherRes = makeRes();
  await getVisualObservationsHandler(otherReq as any, otherRes as any);
  assert.equal(otherRes.statusCode, 403);
});
