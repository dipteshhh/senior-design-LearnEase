import { createHash } from "crypto";
import { performance } from "perf_hooks";
import { inflateRawSync } from "zlib";

export type VisualInventorySourceFileType = "PDF" | "DOCX";
export type VisualInventoryStatus = "complete" | "partial" | "skipped";

export interface VisualInventoryLimits {
  max_images: number;
  max_total_bytes: number;
  max_image_bytes: number;
  max_image_pixels: number;
  timeout_ms: number;
}

export interface VisualInventoryItem {
  id: string;
  source_file_type: VisualInventorySourceFileType;
  origin: "docx_embedded_image" | "pdf_embedded_image";
  image_index: number;
  media_path?: string;
  page?: number | null;
  content_type: string;
  byte_size: number;
  image_hash: string;
  encrypted_artifact_path: string;
  width?: number | null;
  height?: number | null;
}

export interface VisualInventoryManifest {
  document_id: string;
  status: VisualInventoryStatus;
  created_at: string;
  source_file_type: VisualInventorySourceFileType;
  extraction_version: string;
  limits: VisualInventoryLimits;
  items: VisualInventoryItem[];
  warnings: string[];
}

export interface VisualInventoryAsset {
  encryptedArtifactPath: string;
  content: Buffer;
}

export interface VisualInventoryBuildResult {
  manifest: VisualInventoryManifest;
  assets: VisualInventoryAsset[];
}

export interface BuildVisualInventoryOptions {
  documentId: string;
  fileType: VisualInventorySourceFileType;
  fileBuffer: Buffer;
  createdAt?: string;
  limits?: Partial<VisualInventoryLimits>;
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EXTRACTION_VERSION = "phase2a-docx-embedded-images-v1";
const DEFAULT_LIMITS: VisualInventoryLimits = {
  max_images: 50,
  max_total_bytes: 25 * 1024 * 1024,
  max_image_bytes: 5 * 1024 * 1024,
  max_image_pixels: 4096 * 4096,
  timeout_ms: 15_000,
};

const SUPPORTED_DOCX_MEDIA: Record<string, { contentType: string; extension: string }> = {
  ".gif": { contentType: "image/gif", extension: "gif" },
  ".jpeg": { contentType: "image/jpeg", extension: "jpg" },
  ".jpg": { contentType: "image/jpeg", extension: "jpg" },
  ".png": { contentType: "image/png", extension: "png" },
  ".webp": { contentType: "image/webp", extension: "webp" },
};

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

class VisualInventoryTimeoutError extends Error {
  constructor() {
    super("Visual inventory extraction timed out.");
  }
}

export function buildVisualInventory(
  options: BuildVisualInventoryOptions
): VisualInventoryBuildResult {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.LEARNEASE_TEST_FORCE_VISUAL_INVENTORY_FAILURE === "true"
  ) {
    throw new Error("Forced visual inventory failure for test.");
  }

  const limits = normalizeLimits(options.limits);
  const createdAt = options.createdAt ?? new Date().toISOString();

  if (options.fileType === "PDF") {
    return {
      manifest: {
        document_id: options.documentId,
        status: "skipped",
        created_at: createdAt,
        source_file_type: "PDF",
        extraction_version: EXTRACTION_VERSION,
        limits,
        items: [],
        warnings: ["PDF visual inventory is intentionally not implemented in Phase 2A."],
      },
      assets: [],
    };
  }

  return buildDocxVisualInventory({
    documentId: options.documentId,
    fileBuffer: options.fileBuffer,
    createdAt,
    limits,
  });
}

function normalizeLimits(limits?: Partial<VisualInventoryLimits>): VisualInventoryLimits {
  return {
    max_images: limits?.max_images ?? DEFAULT_LIMITS.max_images,
    max_total_bytes: limits?.max_total_bytes ?? DEFAULT_LIMITS.max_total_bytes,
    max_image_bytes: limits?.max_image_bytes ?? DEFAULT_LIMITS.max_image_bytes,
    max_image_pixels: limits?.max_image_pixels ?? DEFAULT_LIMITS.max_image_pixels,
    timeout_ms: limits?.timeout_ms ?? DEFAULT_LIMITS.timeout_ms,
  };
}

function buildDocxVisualInventory({
  documentId,
  fileBuffer,
  createdAt,
  limits,
}: {
  documentId: string;
  fileBuffer: Buffer;
  createdAt: string;
  limits: VisualInventoryLimits;
}): VisualInventoryBuildResult {
  const warnings: string[] = [];
  const items: VisualInventoryItem[] = [];
  const assets: VisualInventoryAsset[] = [];
  const startedAtMs = performance.now();
  let entries: ZipEntry[];
  let totalBytes = 0;

  try {
    throwIfTimedOut(startedAtMs, limits.timeout_ms);
    entries = readZipEntries(fileBuffer, () => throwIfTimedOut(startedAtMs, limits.timeout_ms));
  } catch (error) {
    if (error instanceof VisualInventoryTimeoutError) {
      warnings.push(
        `DOCX visual inventory reached timeout_ms (${limits.timeout_ms}); skipped media extraction.`
      );
      return buildDocxManifestResult(documentId, createdAt, limits, items, assets, warnings);
    }
    throw error;
  }

  for (const entry of entries) {
    if (isTimedOut(startedAtMs, limits.timeout_ms)) {
      warnings.push(
        `DOCX visual inventory reached timeout_ms (${limits.timeout_ms}); skipped remaining supported media.`
      );
      break;
    }

    const mediaPath = entry.name.replace(/\\/g, "/");
    if (!mediaPath.startsWith("word/media/") || mediaPath.endsWith("/")) {
      continue;
    }

    const mediaType = getSupportedDocxMediaType(mediaPath);
    if (!mediaType) {
      continue;
    }

    if (items.length >= limits.max_images) {
      warnings.push(
        `DOCX visual inventory reached max_images (${limits.max_images}); skipped remaining supported media.`
      );
      break;
    }

    if (entry.uncompressedSize > limits.max_image_bytes) {
      warnings.push(
        `Skipped ${mediaPath}: image byte size ${entry.uncompressedSize} exceeds max_image_bytes (${limits.max_image_bytes}).`
      );
      continue;
    }

    if (totalBytes + entry.uncompressedSize > limits.max_total_bytes) {
      warnings.push(
        `DOCX visual inventory reached max_total_bytes (${limits.max_total_bytes}); skipped remaining supported media.`
      );
      break;
    }

    let imageBytes: Buffer;
    try {
      imageBytes = readZipEntryContent(fileBuffer, entry);
    } catch {
      warnings.push(`Skipped ${mediaPath}: failed to extract media entry.`);
      continue;
    }

    if (isTimedOut(startedAtMs, limits.timeout_ms)) {
      warnings.push(
        `DOCX visual inventory reached timeout_ms (${limits.timeout_ms}); skipped remaining supported media.`
      );
      break;
    }

    if (imageBytes.byteLength > limits.max_image_bytes) {
      warnings.push(
        `Skipped ${mediaPath}: image byte size ${imageBytes.byteLength} exceeds max_image_bytes (${limits.max_image_bytes}).`
      );
      continue;
    }

    if (totalBytes + imageBytes.byteLength > limits.max_total_bytes) {
      warnings.push(
        `DOCX visual inventory reached max_total_bytes (${limits.max_total_bytes}); skipped remaining supported media.`
      );
      break;
    }

    const imageIndex = items.length + 1;
    const imageHash = createHash("sha256").update(imageBytes).digest("hex");
    const id = `docx-image-${imageIndex}`;
    const encryptedArtifactPath = `visuals/${id}.${mediaType.extension}`;
    const dimensions = readImageDimensions(imageBytes, mediaType.contentType);

    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      warnings.push(`Skipped ${mediaPath}: image dimensions could not be read.`);
      continue;
    }

    const pixelCount = dimensions.width * dimensions.height;
    if (pixelCount > limits.max_image_pixels) {
      warnings.push(
        `Skipped ${mediaPath}: image pixel count ${pixelCount} exceeds max_image_pixels (${limits.max_image_pixels}).`
      );
      continue;
    }

    items.push({
      id,
      source_file_type: "DOCX",
      origin: "docx_embedded_image",
      image_index: imageIndex,
      media_path: mediaPath,
      page: null,
      content_type: mediaType.contentType,
      byte_size: imageBytes.byteLength,
      image_hash: imageHash,
      encrypted_artifact_path: encryptedArtifactPath,
      width: dimensions.width,
      height: dimensions.height,
    });
    assets.push({
      encryptedArtifactPath,
      content: imageBytes,
    });
    totalBytes += imageBytes.byteLength;
  }

  return buildDocxManifestResult(documentId, createdAt, limits, items, assets, warnings);
}

function buildDocxManifestResult(
  documentId: string,
  createdAt: string,
  limits: VisualInventoryLimits,
  items: VisualInventoryItem[],
  assets: VisualInventoryAsset[],
  warnings: string[]
): VisualInventoryBuildResult {
  return {
    manifest: {
      document_id: documentId,
      status: warnings.length > 0 ? "partial" : "complete",
      created_at: createdAt,
      source_file_type: "DOCX",
      extraction_version: EXTRACTION_VERSION,
      limits,
      items,
      warnings,
    },
    assets,
  };
}

function getSupportedDocxMediaType(
  mediaPath: string
): { contentType: string; extension: string } | null {
  const lowerPath = mediaPath.toLowerCase();
  const dotIndex = lowerPath.lastIndexOf(".");
  if (dotIndex === -1) return null;
  return SUPPORTED_DOCX_MEDIA[lowerPath.slice(dotIndex)] ?? null;
}

function readZipEntries(buffer: Buffer, checkTimeout: () => void): ZipEntry[] {
  checkTimeout();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) {
    throw new Error("DOCX ZIP central directory not found.");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (
    totalEntries === ZIP64_SENTINEL_16 ||
    centralDirectorySize === ZIP64_SENTINEL_32 ||
    centralDirectoryOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error("DOCX ZIP64 archives are not supported for visual inventory.");
  }

  ensureRange(buffer, centralDirectoryOffset, centralDirectorySize);

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  while (offset < centralDirectoryEnd && entries.length < totalEntries) {
    checkTimeout();
    ensureRange(buffer, offset, 46);
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid DOCX ZIP central directory entry.");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameOffset = offset + 46;

    ensureRange(buffer, nameOffset, fileNameLength);
    const name = buffer.toString("utf8", nameOffset, nameOffset + fileNameLength);

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    offset = nameOffset + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function isTimedOut(startedAtMs: number, timeoutMs: number): boolean {
  return performance.now() - startedAtMs >= timeoutMs;
}

function throwIfTimedOut(startedAtMs: number, timeoutMs: number): void {
  if (isTimedOut(startedAtMs, timeoutMs)) {
    throw new VisualInventoryTimeoutError();
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimumEocdLength = 22;
  if (buffer.byteLength < minimumEocdLength) {
    return -1;
  }

  const maxCommentLength = 0xffff;
  const start = Math.max(0, buffer.length - minimumEocdLength - maxCommentLength);

  for (let offset = buffer.length - minimumEocdLength; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function readZipEntryContent(buffer: Buffer, entry: ZipEntry): Buffer {
  ensureRange(buffer, entry.localHeaderOffset, 30);
  if (buffer.readUInt32LE(entry.localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("Invalid DOCX ZIP local file header.");
  }

  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraFieldLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const contentOffset = entry.localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  ensureRange(buffer, contentOffset, entry.compressedSize);
  const compressed = buffer.subarray(contentOffset, contentOffset + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return Buffer.from(compressed);
  }

  if (entry.compressionMethod === 8) {
    const inflated = inflateRawSync(compressed);
    if (entry.uncompressedSize !== 0 && inflated.byteLength !== entry.uncompressedSize) {
      throw new Error("DOCX ZIP entry size mismatch.");
    }
    return inflated;
  }

  throw new Error(`Unsupported DOCX ZIP compression method: ${entry.compressionMethod}.`);
}

function ensureRange(buffer: Buffer, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error("DOCX ZIP entry is out of bounds.");
  }
}

function readImageDimensions(
  buffer: Buffer,
  contentType: string
): { width: number; height: number } | null {
  if (contentType === "image/png") return readPngDimensions(buffer);
  if (contentType === "image/jpeg") return readJpegDimensions(buffer);
  if (contentType === "image/gif") return readGifDimensions(buffer);
  if (contentType === "image/webp") return readWebpDimensions(buffer);
  return null;
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.byteLength < 24 || buffer.subarray(0, 8).toString("hex") !== pngSignature) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readGifDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.byteLength < 10 || !buffer.subarray(0, 4).toString("ascii").startsWith("GIF8")) {
    return null;
  }
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.byteLength < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 3 < buffer.byteLength) {
    while (offset < buffer.byteLength && buffer[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= buffer.byteLength) return null;

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return null;
    if (offset + 2 > buffer.byteLength) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.byteLength) {
      return null;
    }

    if (isJpegStartOfFrameMarker(marker) && segmentLength >= 7) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function isJpegStartOfFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (
    buffer.byteLength < 30 ||
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    return null;
  }

  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8X" && buffer.byteLength >= 30) {
    return {
      width: 1 + readUInt24LE(buffer, 24),
      height: 1 + readUInt24LE(buffer, 27),
    };
  }

  if (chunkType === "VP8L" && buffer.byteLength >= 25 && buffer[20] === 0x2f) {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    return {
      width: 1 + b0 + ((b1 & 0x3f) << 8),
      height: 1 + ((b1 & 0xc0) >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
    };
  }

  if (
    chunkType === "VP8 " &&
    buffer.byteLength >= 30 &&
    buffer[23] === 0x9d &&
    buffer[24] === 0x01 &&
    buffer[25] === 0x2a
  ) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  return null;
}

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}
