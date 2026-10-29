// TASKS.csv #1114 — the shared base64 helpers, and the typed-array pairs built on them
import { test } from "node:test";
import assert from "node:assert/strict";
import { bytesToB64, b64ToBytes } from "../src/lib/base64.js";
import { f32ToB64, b64ToF32 } from "../src/lib/inversion.js";

test("bytes round-trip, including more than one 32 KB chunk", () => {
  const b = new Uint8Array(100000).map((_, i) => (i * 37) & 255);
  assert.deepEqual(b64ToBytes(bytesToB64(b)), b);
  assert.equal(bytesToB64(new Uint8Array([104, 105])), "aGk=");
  assert.equal(b64ToBytes("").length, 0);
});

test("Float32 values survive the project-file encoding", () => {
  const v = [0.5, -1.25, 1e6, NaN];
  const back = b64ToF32(f32ToB64(v));
  assert.deepEqual(Array.from(back.slice(0, 3)), [0.5, -1.25, 1e6]);
  assert.ok(Number.isNaN(back[3]));
});
