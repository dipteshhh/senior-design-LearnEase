import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth } from "../routes/health.js";

test("evaluateHealth returns ok status when database check passes", () => {
  const result = evaluateHealth(() => true);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.payload, { status: "ok" });
});

test("evaluateHealth returns degraded status when database check fails", () => {
  const result = evaluateHealth(() => false);
  assert.equal(result.statusCode, 503);
  assert.deepEqual(result.payload, { status: "degraded" });
});
