import crypto from "crypto";
import fs from "fs";
import path from "path";

const MAGIC = Buffer.from("LE1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function parseKey(rawKey: string): Buffer {
  const hexKey = /^[0-9a-fA-F]{64}$/.test(rawKey) ? Buffer.from(rawKey, "hex") : null;
  if (hexKey && hexKey.length === 32) {
    return hexKey;
  }

  const base64Key = Buffer.from(rawKey, "base64");
  if (base64Key.length === 32) {
    return base64Key;
  }

  const utf8Key = Buffer.from(rawKey, "utf8");
  if (utf8Key.length === 32) {
    return utf8Key;
  }

  throw new Error(
    "FILE_ENCRYPTION_KEY must be 32 bytes (64-char hex, base64-encoded 32 bytes, or 32-char raw string)."
  );
}

function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const rawKey = process.env.FILE_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error("FILE_ENCRYPTION_KEY is required for encrypted artifact storage.");
  }

  cachedKey = parseKey(rawKey);
  return cachedKey;
}

export function encryptBuffer(input: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

export function decryptBuffer(input: Buffer): Buffer {
  const hasEnvelope =
    input.length > MAGIC.length + IV_LENGTH + TAG_LENGTH &&
    input.subarray(0, MAGIC.length).equals(MAGIC);

  // Backward compatibility for artifacts written before encryption was enabled.
  if (!hasEnvelope) {
    return input;
  }

  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_LENGTH;
  const dataStart = tagStart + TAG_LENGTH;

  const iv = input.subarray(ivStart, tagStart);
  const tag = input.subarray(tagStart, dataStart);
  const ciphertext = input.subarray(dataStart);

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeEncryptedBuffer(filePath: string, content: Buffer): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, encryptBuffer(content));
}

export function writeEncryptedText(filePath: string, content: string): void {
  writeEncryptedBuffer(filePath, Buffer.from(content, "utf8"));
}

export function readEncryptedBuffer(filePath: string): Buffer {
  const raw = fs.readFileSync(filePath);
  return decryptBuffer(raw);
}

export function readEncryptedText(filePath: string): string {
  return readEncryptedBuffer(filePath).toString("utf8");
}

