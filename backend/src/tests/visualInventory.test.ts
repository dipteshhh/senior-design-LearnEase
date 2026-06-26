import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { buildVisualInventory } from "../services/visualInventory.js";
import { buildZip, tinyJpeg, tinyPng } from "./visualInventoryTestUtils.js";

const createdAt = "2026-06-26T12:00:00.000Z";

test("buildVisualInventory extracts supported DOCX raster images", () => {
  const docx = buildZip([
    { name: "word/document.xml", data: "<xml />" },
    { name: "word/media/image1.png", data: tinyPng },
    { name: "word/media/image2.jpg", data: tinyJpeg },
  ]);

  const result = buildVisualInventory({
    documentId: "doc-visual-supported",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
  });

  assert.equal(result.manifest.status, "complete");
  assert.equal(result.manifest.source_file_type, "DOCX");
  assert.equal(result.manifest.items.length, 2);
  assert.equal(result.assets.length, 2);

  assert.deepEqual(
    result.manifest.items.map((item) => item.media_path),
    ["word/media/image1.png", "word/media/image2.jpg"]
  );
  assert.deepEqual(
    result.manifest.items.map((item) => item.content_type),
    ["image/png", "image/jpeg"]
  );
  assert.equal(result.manifest.items[0].width, 1);
  assert.equal(result.manifest.items[0].height, 1);
  assert.equal(result.manifest.items[1].width, 3);
  assert.equal(result.manifest.items[1].height, 2);
  assert.equal(
    result.manifest.items[0].image_hash,
    createHash("sha256").update(tinyPng).digest("hex")
  );
  assert.equal(result.assets[0].encryptedArtifactPath, "visuals/docx-image-1.png");
  assert.deepEqual(result.assets[0].content, tinyPng);
});

test("buildVisualInventory ignores unsupported DOCX media", () => {
  const docx = buildZip([
    { name: "word/document.xml", data: "<xml />" },
    { name: "word/media/image1.emf", data: Buffer.from("emf") },
    { name: "word/media/image2.svg", data: Buffer.from("<svg />") },
    { name: "customXml/item1.xml", data: "<xml />" },
  ]);

  const result = buildVisualInventory({
    documentId: "doc-visual-unsupported",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
  });

  assert.equal(result.manifest.status, "complete");
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.assets.length, 0);
  assert.deepEqual(result.manifest.warnings, []);
});

test("buildVisualInventory stores partial DOCX inventory when max image count is reached", () => {
  const docx = buildZip([
    { name: "word/media/image1.png", data: tinyPng },
    { name: "word/media/image2.png", data: tinyPng },
  ]);

  const result = buildVisualInventory({
    documentId: "doc-visual-count-cap",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
    limits: { max_images: 1 },
  });

  assert.equal(result.manifest.status, "partial");
  assert.equal(result.manifest.items.length, 1);
  assert.equal(result.assets.length, 1);
  assert.match(result.manifest.warnings[0], /max_images/);
});

test("buildVisualInventory skips oversized DOCX images without failing", () => {
  const docx = buildZip([{ name: "word/media/image1.png", data: tinyPng }]);

  const result = buildVisualInventory({
    documentId: "doc-visual-size-cap",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
    limits: { max_image_bytes: tinyPng.byteLength - 1 },
  });

  assert.equal(result.manifest.status, "partial");
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.assets.length, 0);
  assert.match(result.manifest.warnings[0], /max_image_bytes/);
});

test("buildVisualInventory skips DOCX images over the pixel cap", () => {
  const docx = buildZip([{ name: "word/media/image1.png", data: tinyPng }]);

  const result = buildVisualInventory({
    documentId: "doc-visual-pixel-cap",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
    limits: { max_image_pixels: 0 },
  });

  assert.equal(result.manifest.status, "partial");
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.assets.length, 0);
  assert.match(result.manifest.warnings[0], /max_image_pixels/);
});

test("buildVisualInventory skips corrupt DOCX image bytes without failing", () => {
  const docx = buildZip([{ name: "word/media/image1.png", data: Buffer.from("not a png") }]);

  const result = buildVisualInventory({
    documentId: "doc-visual-corrupt-image",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
  });

  assert.equal(result.manifest.status, "partial");
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.assets.length, 0);
  assert.match(result.manifest.warnings[0], /dimensions could not be read/);
});

test("buildVisualInventory records partial DOCX inventory when timeout is reached", () => {
  const docx = buildZip([{ name: "word/media/image1.png", data: tinyPng }]);

  const result = buildVisualInventory({
    documentId: "doc-visual-timeout",
    fileType: "DOCX",
    fileBuffer: docx,
    createdAt,
    limits: { timeout_ms: 0 },
  });

  assert.equal(result.manifest.status, "partial");
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.assets.length, 0);
  assert.match(result.manifest.warnings[0], /timeout_ms/);
});

test("buildVisualInventory leaves PDF visual inventory as a safe no-op", () => {
  const result = buildVisualInventory({
    documentId: "doc-visual-pdf",
    fileType: "PDF",
    fileBuffer: Buffer.from("%PDF-1.4"),
    createdAt,
  });

  assert.equal(result.manifest.status, "skipped");
  assert.equal(result.manifest.source_file_type, "PDF");
  assert.equal(result.manifest.items.length, 0);
  assert.equal(result.assets.length, 0);
  assert.match(result.manifest.warnings[0], /not implemented in Phase 2A/);
});
