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

  // Lecture-only invariant: nothing is persisted for non-lecture documents.
  assert.equal(countVisualObservationRows(doc.id), 0);
  assert.equal(getVisualObservationsArtifact(doc.id).ok, false);
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

function makeObservationResponse(imageIndexes: number[]) {
  return {
    observations: imageIndexes.map((imageIndex) => ({
      image_index: imageIndex,
      type: "diagram",
      summary: `Observation for image ${imageIndex}.`,
      visible_text: [],
      academic_relevance: "Supports reviewing the lecture material.",
      confidence: "medium",
      limitations: [],
    })),
  };
}

function countVisualObservationRows(documentId: string): number {
  const row = sqlite
    .getDb()
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM document_artifacts
        WHERE document_id = ? AND artifact_type = 'VISUAL_OBSERVATIONS'
      `
    )
    .get(documentId) as { count: number };
  return row.count;
}

function getVisualObservationsArtifactPath(documentId: string): string {
  const row = sqlite
    .getDb()
    .prepare(
      `
        SELECT encrypted_path
        FROM document_artifacts
        WHERE document_id = ? AND artifact_type = 'VISUAL_OBSERVATIONS'
      `
    )
    .get(documentId) as { encrypted_path: string } | undefined;
  assert.ok(row?.encrypted_path);
  return row.encrypted_path;
}

function saveTwoImageInventory(documentId: string): void {
  const imageHash = createHash("sha256").update(tinyPng).digest("hex");
  const makeItem = (index: number) => ({
    id: `docx-image-${index}`,
    source_file_type: "DOCX" as const,
    origin: "docx_embedded_image" as const,
    image_index: index,
    media_path: `word/media/image${index}.png`,
    page: null,
    content_type: "image/png",
    byte_size: tinyPng.byteLength,
    image_hash: imageHash,
    encrypted_artifact_path: `visuals/docx-image-${index}.png`,
    width: 1,
    height: 1,
  });
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
      items: [makeItem(1), makeItem(2)],
      warnings: [],
    },
    assets: [
      { encryptedArtifactPath: "visuals/docx-image-1.png", content: tinyPng },
      { encryptedArtifactPath: "visuals/docx-image-2.png", content: tinyPng },
    ],
  });
}

test("re-running visual observations is idempotent and does not duplicate artifacts", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]));

  await generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any);
  const firstPath = getVisualObservationsArtifactPath(doc.id);

  await generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any);
  const secondPath = getVisualObservationsArtifactPath(doc.id);

  assert.equal(countVisualObservationRows(doc.id), 1);
  assert.equal(firstPath, secondPath);

  const persisted = getVisualObservationsArtifact(doc.id);
  assert.equal(persisted.ok, true);
  if (persisted.ok) {
    assert.equal(persisted.artifact.observations.length, 1);
  }
});

test("deleting one document removes visual observation artifacts and directory", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]));
  await generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any);

  const artifactDir = path.resolve(process.env.ARTIFACTS_DIR!, doc.id);
  assert.equal(fs.existsSync(artifactDir), true);
  assert.equal(countVisualObservationRows(doc.id), 1);

  assert.equal(store.deleteDocumentById(doc.id), true);

  assert.equal(countVisualObservationRows(doc.id), 0);
  assert.equal(fs.existsSync(artifactDir), false);
  assert.equal(getVisualObservationsArtifact(doc.id).ok, false);
});

test("deleting all user data removes visual observation artifacts and directories", async () => {
  const userId = `delete-all-user-${randomUUID()}`;
  const docA = seedDocument({ userId });
  const docB = seedDocument({ userId });
  saveOneImageInventory(docA.id);
  saveOneImageInventory(docB.id);
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]));
  await generateVisualObservationsForDocument(docA.id, userId, fakeClient as any);
  await generateVisualObservationsForDocument(docB.id, userId, fakeClient as any);

  const dirA = path.resolve(process.env.ARTIFACTS_DIR!, docA.id);
  const dirB = path.resolve(process.env.ARTIFACTS_DIR!, docB.id);
  assert.equal(fs.existsSync(dirA), true);
  assert.equal(fs.existsSync(dirB), true);

  store.deleteDocumentsByUser(userId);

  assert.equal(countVisualObservationRows(docA.id), 0);
  assert.equal(countVisualObservationRows(docB.id), 0);
  assert.equal(fs.existsSync(dirA), false);
  assert.equal(fs.existsSync(dirB), false);
});

test("retention purge removes visual observation artifacts without orphans", async () => {
  const oldUploadedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const doc = seedDocument({ uploadedAt: oldUploadedAt });
  saveOneImageInventory(doc.id);
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]));
  await generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any);

  const artifactDir = path.resolve(process.env.ARTIFACTS_DIR!, doc.id);
  assert.equal(fs.existsSync(artifactDir), true);

  const purged = store.purgeExpiredDocuments(30);
  assert.ok(purged >= 1);

  assert.equal(countVisualObservationRows(doc.id), 0);
  assert.equal(fs.existsSync(artifactDir), false);
});

test("corrupt visual observations artifact fails safely and route returns sanitized 404", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]));
  await generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any);

  const artifactPath = getVisualObservationsArtifactPath(doc.id);

  // Corrupt the encrypted file with raw garbage: decrypt must fail.
  fs.writeFileSync(artifactPath, Buffer.from("not-encrypted-garbage"));
  const corruptRead = getVisualObservationsArtifact(doc.id);
  assert.equal(corruptRead.ok, false);
  if (!corruptRead.ok) {
    assert.equal(corruptRead.reason, "decrypt_failed");
  }

  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: doc.userId, email: "visual@example.com" },
  };
  const res = makeRes();
  await getVisualObservationsHandler(req as any, res as any);
  assert.equal(res.statusCode, 404);
  const responseText = JSON.stringify(res.body);
  assert.equal(responseText.includes(artifactPath), false);
  assert.equal(responseText.includes("garbage"), false);

  // Valid encryption of invalid JSON: parse must fail, same sanitized 404.
  const { writeEncryptedText } = await import("../lib/encryption.js");
  writeEncryptedText(artifactPath, "{ this is not valid json");
  const parseRead = getVisualObservationsArtifact(doc.id);
  assert.equal(parseRead.ok, false);
  if (!parseRead.ok) {
    assert.equal(parseRead.reason, "parse_failed");
  }

  const res2 = makeRes();
  await getVisualObservationsHandler(req as any, res2 as any);
  assert.equal(res2.statusCode, 404);
});

test("caps enforcement limits images and warnings never leak image bytes", async () => {
  const doc = seedDocument();
  saveTwoImageInventory(doc.id);
  const capture = { calls: 0, request: undefined as unknown };
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]), capture);

  const artifact = await generateVisualObservationsForDocument(
    doc.id,
    doc.userId,
    fakeClient as any,
    { maxImages: 1, maxImageBytes: 5 * 1024 * 1024, maxTotalBytes: 10 * 1024 * 1024 }
  );

  assert.equal(capture.calls, 1);
  assert.equal(artifact.status, "partial");
  assert.equal(artifact.observations.length, 1);
  assert.match(artifact.warnings.join(" "), /max images/i);

  const rawImageBase64 = tinyPng.toString("base64");
  const artifactText = JSON.stringify(artifact);
  assert.equal(artifactText.includes(rawImageBase64), false);
  assert.equal(artifactText.includes("data:image"), false);
  assert.equal(artifactText.includes("encrypted_artifact_path"), false);

  // Only one image may be sent to the vision model.
  const request = capture.request as {
    messages: Array<{ role: string; content: unknown }>;
  };
  const userContent = request.messages.find((m) => m.role === "user")?.content as Array<{
    type: string;
  }>;
  const imageParts = userContent.filter((part) => part.type === "image_url");
  assert.equal(imageParts.length, 1);
});

test("byte-size caps skip oversized images without leaking bytes", async () => {
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const capture = { calls: 0, request: undefined as unknown };
  const fakeClient = makeOpenAiClient(makeObservationResponse([]), capture);

  const artifact = await generateVisualObservationsForDocument(
    doc.id,
    doc.userId,
    fakeClient as any,
    { maxImages: 3, maxImageBytes: 1, maxTotalBytes: 10 }
  );

  // Every image exceeds the byte cap: no vision call at all.
  assert.equal(capture.calls, 0);
  assert.equal(artifact.status, "skipped");
  assert.equal(artifact.observations.length, 0);
  assert.match(artifact.warnings.join(" "), /byte size exceeds/i);

  const rawImageBase64 = tinyPng.toString("base64");
  assert.equal(JSON.stringify(artifact).includes(rawImageBase64), false);
});

test("visual observation failure never disturbs study guide state or persists partial artifacts", async () => {
  const doc = seedDocument({
    studyGuideStatus: "ready",
    status: "ready",
  });
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

  const after = store.getDocumentMetadata(doc.id);
  assert.ok(after);
  assert.equal(after.studyGuideStatus, "ready");
  assert.equal(after.status, "ready");
  assert.equal(after.errorCode, null);

  // A failed vision call must not leave a half-written observations artifact.
  assert.equal(getVisualObservationsArtifact(doc.id).ok, false);
  assert.equal(countVisualObservationRows(doc.id), 0);
});

test("route never serves a stale observations artifact for a non-lecture document", async () => {
  // Generate a valid artifact while the document is a lecture...
  const doc = seedDocument();
  saveOneImageInventory(doc.id);
  const fakeClient = makeOpenAiClient(makeObservationResponse([1]));
  await generateVisualObservationsForDocument(doc.id, doc.userId, fakeClient as any);
  assert.equal(countVisualObservationRows(doc.id), 1);

  // ...then simulate reclassification / bad data migration to HOMEWORK.
  sqlite
    .getDb()
    .prepare("UPDATE documents SET document_type = 'HOMEWORK' WHERE id = ?")
    .run(doc.id);

  const req: MockReq = {
    params: { documentId: doc.id },
    auth: { userId: doc.userId, email: "visual@example.com" },
  };
  const res = makeRes();
  await getVisualObservationsHandler(req as any, res as any);

  assert.equal(res.statusCode, 404);
  const responseText = JSON.stringify(res.body);
  assert.equal(responseText.includes("summary"), false);
  assert.equal(responseText.includes("Observation for image"), false);
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
