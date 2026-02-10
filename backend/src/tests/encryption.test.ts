import test from "node:test";
import assert from "node:assert/strict";
import { decryptBuffer, encryptBuffer } from "../lib/encryption.js";

test("encryptBuffer and decryptBuffer round-trip plaintext", () => {
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

  const input = Buffer.from("LearnEase encryption roundtrip", "utf8");
  const encrypted = encryptBuffer(input);
  const decrypted = decryptBuffer(encrypted);

  assert.notDeepEqual(encrypted, input);
  assert.deepEqual(decrypted, input);
});

test("decryptBuffer preserves legacy plaintext buffers", () => {
  process.env.FILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";

  const legacyPlaintext = Buffer.from("legacy-unencrypted-artifact", "utf8");
  const output = decryptBuffer(legacyPlaintext);

  assert.deepEqual(output, legacyPlaintext);
});

