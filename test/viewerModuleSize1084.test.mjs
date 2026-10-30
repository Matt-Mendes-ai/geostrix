// TASKS.csv #1084 — ViewerModule.jsx regrew ~10 kB a day after the #991 split, and the only check (the line budget in
// scripts/check-bundle-size.mjs) runs after a build and sat 700 lines above the file. This ceiling runs with the tests.
// Lower it whenever code moves out; raise it only deliberately, with a TASKS.csv note. A new feature belongs in
// src/modules/viewer/* or src/lib, where it can be imported and tested.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MAX_BYTES = 775000; // lowered from 780,000 when buildVectorFeatures moved to lib (#1083)
const MAX_LINES = 9350;

test("#1084 ViewerModule.jsx stays under its size ceiling", () => {
  // counted with LF line endings: a Windows checkout (CI's core.autocrlf) adds a CR per line, 9,240 bytes, which failed
  // the v0.1.79 release build at 778,605 against the 769,366 the file really is
  const text = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const buf = Buffer.from(text, "utf8");
  const lines = text.split("\n").length;
  assert.ok(buf.length <= MAX_BYTES, `ViewerModule.jsx is ${buf.length} bytes, over its ${MAX_BYTES} ceiling: move the new code into src/modules/viewer/ or src/lib`);
  assert.ok(lines <= MAX_LINES, `ViewerModule.jsx has ${lines} lines, over its ${MAX_LINES} ceiling: move the new code into src/modules/viewer/ or src/lib`);
});
