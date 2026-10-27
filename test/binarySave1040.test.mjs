// TASKS.csv #1040 (review #1016) — binary exports go to the main process as bytes, not base64 strings.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(js|jsx)$/.test(f) ? [p] : []; });

test("#1040 no export base64-encodes bytes for saveFile any more (the encoders are gone)", () => {
  const offenders = files(join(root, "src")).filter((p) => /uint8ToBase64|arrayBufferToBase64|bytesToBase64/.test(readFileSync(p, "utf8")));
  assert.deepEqual(offenders, []);
});

test("#1040 the main process writes a Uint8Array / ArrayBuffer as it is, before the base64 and text branches", () => {
  const main = readFileSync(join(root, "electron/main.js"), "utf8");
  const fn = main.slice(main.indexOf("async function writeChosenFile"), main.indexOf('ipcMain.handle("save-file-to"'));
  const iView = fn.indexOf("ArrayBuffer.isView(content)"), iAB = fn.indexOf("content instanceof ArrayBuffer"), iB64 = fn.indexOf('encoding === "base64"');
  assert.ok(iView > 0 && iAB > iView && iB64 > iAB, "bytes are checked first");
  assert.match(fn, /Buffer\.from\(content\.buffer, content\.byteOffset, content\.byteLength\)/); // a view's own slice, not its whole buffer
});

test("#1040 a view's own bytes, not its whole underlying buffer", () => {
  const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
  const view = big.subarray(2, 5);
  assert.deepEqual([...Buffer.from(view.buffer, view.byteOffset, view.byteLength)], [1, 2, 3]);
});
