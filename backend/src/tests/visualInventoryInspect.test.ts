import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import type { DocumentRecord } from "../store/memoryStore.js";

// Isolated DB + artifacts + key, set before importing modules that capture them.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learnease-inspect-"));
process.env.DATABASE_PATH = path.join(tmpDir, "test.sqlite");
process.env.ARTIFACTS_DIR = path.join(tmpDir, "artifacts");
process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

const sqlite = await import("../db/sqlite.js");
const store = await import("../store/memoryStore.js");
const { buildVisualInventory } = await import("../services/visualInventory.js");
const { buildZip, tinyPng } = await import("./visualInventoryTestUtils.js");
const encryption = await import("../lib/encryption.js");
const cli = await import("../cli/inspectVisualInventory.js");
const { getInternalVisualInventoryHandler } = await import("../routes/contract.js");

sqlite.initializeDatabase();

function makeDoc(id: string, userId: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id,
    userId,
    userEmail: `${userId}@example.com`,
    filename: `${id}.docx`,
    fileType: "DOCX",
    documentType: "LECTURE",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    pageCount: 0,
    paragraphCount: 3,
    extractedText: "Lecture slides for module week chapter learning objectives content.",
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
}

function seedDocWithInventory(docId: string, userId: string): void {
  store.saveDocument(makeDoc(docId, userId));
  const inventory = buildVisualInventory({
    documentId: docId,
    fileType: "DOCX",
    fileBuffer: buildZip([{ name: "word/media/image1.png", data: tinyPng }]),
    createdAt: "2026-06-26T12:00:00.000Z",
  });
  store.saveVisualInventoryArtifact(docId, inventory);
}

function assetPathFor(docId: string, relative: string): string {
  return path.resolve(process.env.ARTIFACTS_DIR!, docId, relative);
}

function manifestPathFor(docId: string): string {
  return path.resolve(process.env.ARTIFACTS_DIR!, docId, "visual-inventory.json");
}

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

function makeReq(documentId: string, userId: string): MockReq {
  return {
    params: { documentId },
    auth: { userId, email: `${userId}@example.com` },
  };
}

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

function restoreEnv(
  name: "NODE_ENV" | "ENABLE_INTERNAL_DEBUG_ROUTES",
  previous: string | undefined
): void {
  if (previous === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = previous;
  }
}

test("getVisualInventoryManifest returns the manifest for a DOCX with an image", () => {
  const docId = "aaaaaaaa-b001-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-happy");

  const result = store.getVisualInventoryManifest(docId);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.status, "complete");
  assert.equal(result.manifest.source_file_type, "DOCX");
  assert.equal(result.manifest.items.length, 1);
  assert.equal(result.manifest.items[0].content_type, "image/png");
  assert.equal(result.manifest.items[0].encrypted_artifact_path, "visuals/docx-image-1.png");
});

test("getVisualInventoryManifest returns missing when there is no inventory artifact", () => {
  const docId = "aaaaaaaa-b002-4aaa-8aaa-aaaaaaaaaaaa";
  store.saveDocument(makeDoc(docId, "user-inspect-missing"));

  const result = store.getVisualInventoryManifest(docId);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "missing");
});

test("getVisualInventoryManifest reports decrypt_failed for a non-enveloped manifest file", () => {
  const docId = "aaaaaaaa-b003-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-decrypt");
  fs.writeFileSync(manifestPathFor(docId), Buffer.from("plaintext not encrypted"));

  let result: ReturnType<typeof store.getVisualInventoryManifest> | undefined;
  assert.doesNotThrow(() => {
    result = store.getVisualInventoryManifest(docId);
  });
  assert.equal(result?.ok, false);
  if (result?.ok) return;
  assert.equal(result?.reason, "decrypt_failed");
});

test("getVisualInventoryManifest reports parse_failed for non-JSON manifest content", () => {
  const docId = "aaaaaaaa-b004-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-parse");
  encryption.writeEncryptedText(manifestPathFor(docId), "{ not valid json");

  const result = store.getVisualInventoryManifest(docId);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "parse_failed");
});

test("verifyVisualInventoryAssets succeeds for intact assets", () => {
  const docId = "aaaaaaaa-b005-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-verify-ok");

  const result = store.verifyVisualInventoryAssets(docId);
  assert.equal("items" in result, true);
  if (!("items" in result)) return;
  assert.equal(result.ok, true);
  assert.equal(result.manifest_status, "complete");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].ok, true);
});

test("verifyVisualInventoryAssets flags a missing encrypted asset", () => {
  const docId = "aaaaaaaa-b006-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-verify-missing");
  fs.rmSync(assetPathFor(docId, "visuals/docx-image-1.png"), { force: true });

  const result = store.verifyVisualInventoryAssets(docId);
  assert.equal("items" in result, true);
  if (!("items" in result)) return;
  assert.equal(result.ok, false);
  assert.equal(result.items[0].ok, false);
  assert.equal(result.items[0].reason, "missing_asset");
});

test("verifyVisualInventoryAssets flags a tampered asset (hash mismatch)", () => {
  const docId = "aaaaaaaa-b007-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-verify-tamper");
  // Same byte length, different content -> byte size matches, hash differs.
  const tampered = Buffer.alloc(tinyPng.byteLength, 0x00);
  encryption.writeEncryptedBuffer(assetPathFor(docId, "visuals/docx-image-1.png"), tampered);

  const result = store.verifyVisualInventoryAssets(docId);
  assert.equal("items" in result, true);
  if (!("items" in result)) return;
  assert.equal(result.ok, false);
  assert.equal(result.items[0].ok, false);
  assert.equal(result.items[0].reason, "hash_mismatch");
  assert.ok(result.items[0].expected_hash);
  assert.ok(result.items[0].actual_hash);
  assert.notEqual(result.items[0].expected_hash, result.items[0].actual_hash);
});

test("verifyVisualInventoryAssets returns a manifest_read_error without throwing when manifest is missing", () => {
  const docId = "aaaaaaaa-b008-4aaa-8aaa-aaaaaaaaaaaa";
  store.saveDocument(makeDoc(docId, "user-inspect-verify-no-manifest"));

  let result: ReturnType<typeof store.verifyVisualInventoryAssets> | undefined;
  assert.doesNotThrow(() => {
    result = store.verifyVisualInventoryAssets(docId);
  });
  assert.equal(result && "manifest_read_error" in result, true);
  if (!result || !("manifest_read_error" in result)) return;
  assert.equal(result.ok, false);
  assert.equal(result.manifest_read_error, "missing");
});

test("CLI text output is metadata-only and never leaks image bytes", () => {
  const docId = "aaaaaaaa-b009-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-cli-leak");

  const read = store.getVisualInventoryManifest(docId);
  assert.equal(read.ok, true);
  if (!read.ok) return;
  const report = cli.buildDocumentReport(docId, read);
  const text = cli.formatDocumentReportText(report).join("\n");

  assert.match(text, /image\/png/);
  assert.match(text, /sha256=/);
  assert.equal(text.includes(tinyPng.toString("base64")), false);
  assert.equal(text.includes(tinyPng.toString("hex")), false);
});

test("parseArgs validates flag combinations", () => {
  assert.deepEqual(cli.parseArgs(["--document", "doc-1"]), {
    documentId: "doc-1",
    verify: false,
    json: false,
  });
  assert.deepEqual(cli.parseArgs(["--user", "user-1", "--verify", "--json"]), {
    userId: "user-1",
    verify: true,
    json: true,
  });
  assert.throws(() => cli.parseArgs([]), cli.InspectArgsError);
  assert.throws(() => cli.parseArgs(["--document"]), cli.InspectArgsError);
  assert.throws(
    () => cli.parseArgs(["--document", "a", "--user", "b"]),
    cli.InspectArgsError
  );
});

test("runInspection exits nonzero for an unknown document", () => {
  const stub = {
    getVisualInventoryManifest: () => ({ ok: false, reason: "missing" }) as const,
    verifyVisualInventoryAssets: () => ({ ok: false, manifest_read_error: "missing" }) as const,
    listDocumentsByUser: () => [],
  };
  const result = cli.runInspection({ documentId: "nope", verify: false, json: false }, stub);
  assert.equal(result.exitCode, 1);
});

test("runInspection --verify exits nonzero when an asset fails verification", () => {
  const docId = "aaaaaaaa-b00a-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-cli-verify");
  fs.rmSync(assetPathFor(docId, "visuals/docx-image-1.png"), { force: true });

  const result = cli.runInspection({ documentId: docId, verify: true, json: true });
  assert.equal(result.exitCode, 1);
  assert.equal(Array.isArray((result.json as { documents: unknown[] }).documents), true);
});

test("runInspection succeeds (exit 0) for a healthy document", () => {
  const docId = "aaaaaaaa-b00b-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-inspect-cli-ok");

  const result = cli.runInspection({ documentId: docId, verify: true, json: false });
  assert.equal(result.exitCode, 0);
});

test("internal visual inventory route returns 404 when disabled", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFlag = process.env.ENABLE_INTERNAL_DEBUG_ROUTES;
  process.env.NODE_ENV = "production";
  delete process.env.ENABLE_INTERNAL_DEBUG_ROUTES;

  try {
    const req = makeReq("aaaaaaaa-b00c-4aaa-8aaa-aaaaaaaaaaaa", "user-route-disabled");
    const res = makeRes();
    await getInternalVisualInventoryHandler(req as any, res as any);

    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
      error: { code: "NOT_FOUND", message: "Not found.", details: {} },
    });
  } finally {
    restoreEnv("NODE_ENV", previousNodeEnv);
    restoreEnv("ENABLE_INTERNAL_DEBUG_ROUTES", previousFlag);
  }
});

test("internal visual inventory route returns DOCX manifest metadata only when enabled", async () => {
  const docId = "aaaaaaaa-b00d-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "user-route-enabled";
  seedDocWithInventory(docId, userId);
  process.env.ENABLE_INTERNAL_DEBUG_ROUTES = "true";

  const req = makeReq(docId, userId);
  const res = makeRes();
  await getInternalVisualInventoryHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  const body = res.body as {
    document_id?: string;
    status?: string;
    source_file_type?: string;
    extraction_version?: string;
    item_count?: number;
    items?: Array<Record<string, unknown>>;
  };
  assert.equal(body.document_id, docId);
  assert.equal(body.status, "complete");
  assert.equal(body.source_file_type, "DOCX");
  assert.equal(body.extraction_version, "phase2a-docx-embedded-images-v1");
  assert.equal(body.item_count, 1);
  assert.equal(body.items?.length, 1);
  assert.equal(body.items?.[0]?.media_path, "word/media/image1.png");
  assert.equal(body.items?.[0]?.content_type, "image/png");
  assert.equal(body.items?.[0]?.byte_size, tinyPng.byteLength);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      body.items?.[0] ?? {},
      "encrypted_artifact_path"
    ),
    false
  );
});

test("internal visual inventory route never returns image bytes or base64", async () => {
  const docId = "aaaaaaaa-b00e-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "user-route-no-bytes";
  seedDocWithInventory(docId, userId);
  process.env.ENABLE_INTERNAL_DEBUG_ROUTES = "true";

  const req = makeReq(docId, userId);
  const res = makeRes();
  await getInternalVisualInventoryHandler(req as any, res as any);

  assert.equal(res.statusCode, 200);
  const responseText = JSON.stringify(res.body);
  assert.equal(responseText.includes(tinyPng.toString("base64")), false);
  assert.equal(responseText.includes(tinyPng.toString("hex")), false);
  assert.equal(responseText.includes("data:image"), false);
  assert.equal(responseText.includes("encrypted_artifact_path"), false);
});

test("internal visual inventory route rejects non-owner access", async () => {
  const docId = "aaaaaaaa-b00f-4aaa-8aaa-aaaaaaaaaaaa";
  seedDocWithInventory(docId, "user-route-owner");
  process.env.ENABLE_INTERNAL_DEBUG_ROUTES = "true";

  const req = makeReq(docId, "user-route-other");
  const res = makeRes();
  await getInternalVisualInventoryHandler(req as any, res as any);

  assert.equal(res.statusCode, 403);
  const responseText = JSON.stringify(res.body);
  assert.equal(responseText.includes("word/media/image1.png"), false);
  assert.equal(responseText.includes("image_hash"), false);
});

test("internal visual inventory route returns 404 when manifest is missing", async () => {
  const docId = "aaaaaaaa-b010-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "user-route-missing";
  store.saveDocument(makeDoc(docId, userId));
  process.env.ENABLE_INTERNAL_DEBUG_ROUTES = "true";

  const req = makeReq(docId, userId);
  const res = makeRes();
  await getInternalVisualInventoryHandler(req as any, res as any);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    error: {
      code: "VISUAL_INVENTORY_NOT_FOUND",
      message: "Visual inventory not found.",
      details: {},
    },
  });
});

test("internal visual inventory route returns a safe error for corrupt manifests", async () => {
  const docId = "aaaaaaaa-b011-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "user-route-corrupt";
  seedDocWithInventory(docId, userId);
  encryption.writeEncryptedText(manifestPathFor(docId), "{ not valid json");
  process.env.ENABLE_INTERNAL_DEBUG_ROUTES = "true";

  const req = makeReq(docId, userId);
  const res = makeRes();
  await getInternalVisualInventoryHandler(req as any, res as any);

  assert.equal(res.statusCode, 422);
  const responseText = JSON.stringify(res.body);
  assert.match(responseText, /VISUAL_INVENTORY_INVALID/);
  assert.equal(responseText.includes("{ not valid json"), false);
  assert.equal(responseText.includes(tinyPng.toString("base64")), false);
});

test("cleanup inspect test environment", () => {
  sqlite.closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
