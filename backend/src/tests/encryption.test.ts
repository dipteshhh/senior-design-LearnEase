import test from "node:test";
import assert from "node:assert/strict";
import { decryptBuffer, encryptBuffer } from "../lib/encryption.js";

test("encryptBuffer and decryptBuffer round-trip plaintext", () => {
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  delete process.env.ALLOW_LEGACY_UNENCRYPTED_ARTIFACTS;

  const input = Buffer.from("LearnEase encryption roundtrip", "utf8");
  const encrypted = encryptBuffer(input);
  const decrypted = decryptBuffer(encrypted);

  assert.notDeepEqual(encrypted, input);
  assert.deepEqual(decrypted, input);
});

test("decryptBuffer rejects legacy plaintext buffers by default", () => {
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  delete process.env.ALLOW_LEGACY_UNENCRYPTED_ARTIFACTS;

  const legacyPlaintext = Buffer.from("legacy-unencrypted-artifact", "utf8");
  assert.throws(() => decryptBuffer(legacyPlaintext));
});

test("decryptBuffer preserves legacy plaintext buffers when migration flag is enabled", () => {
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  process.env.ALLOW_LEGACY_UNENCRYPTED_ARTIFACTS = "true";

  const legacyPlaintext = Buffer.from("legacy-unencrypted-artifact", "utf8");
  const output = decryptBuffer(legacyPlaintext);

  assert.deepEqual(output, legacyPlaintext);

  delete process.env.ALLOW_LEGACY_UNENCRYPTED_ARTIFACTS;
});
