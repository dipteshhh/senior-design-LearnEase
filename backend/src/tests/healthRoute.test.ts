import test from "node:test";
import assert from "node:assert/strict";
import { healthHandler } from "../routes/health.js";

type MockRes = {
  statusCode?: number;
  body?: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
};

function makeRes(): MockRes {
  const res: MockRes = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test("healthHandler returns 200 with status ok payload", () => {
  const res = makeRes();

  healthHandler({} as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

