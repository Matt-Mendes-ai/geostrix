// TASKS.csv #2737 — Viewport 'Fit the holes' offers the turned (portrait) frame when the holes run the other way and it would fit them at
// a finer scale
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("the fit works out the turned frame's scale with width and height swapped", () => {
  assert.match(m, /const roundScaleFor = \(U0, U1, V0, V1, fw = frameWm, fh = frameHm\) => \{ const nd = Math\.max\(\(\(U1 - U0\) \* 1\.1\) \/ fw, \(\(V1 - V0\) \* 1\.1\) \/ fh, 1\);/);
  assert.match(m, /const turnedScale = roundScaleFor\(u0, u1, v0, v1, frameHm, frameWm\);/);
  assert.match(m, /\.\.\.\(turnedScale < scale \? \{ turnedScale \} : \{\}\)/);
});

test("the note under Fit says so and turns the frame on a click", () => {
  assert.match(m, /sel\.fitInfo\.turnedScale > 0 && sel\.w !== sel\.h && <> \{tr\("They run the other way: the frame turned \(\{w\} × \{h\} mm\) would show them at 1:\{s\}\."/);
  assert.match(m, /onClick=\{\(\) => updateSelected\(\{ w: sel\.h, h: sel\.w, fitInfo: null \}\)\}/);
});

test("the same arithmetic: N-S holes 1,000 m long in a 180 x 100 mm frame fit finer turned", () => {
  const steps = [1, 1.5, 2, 2.5, 5, 10];
  const round = (ext, fw, fh) => { const nd = Math.max((ext[0] * 1.1) / fw, (ext[1] * 1.1) / fh, 1); const mg = 10 ** Math.floor(Math.log10(nd)); return steps.map((s) => Math.round(s * mg)).find((n) => n >= nd); };
  const ext = [200, 1000]; // 200 m E-W, 1,000 m N-S
  assert.equal(round(ext, 0.18, 0.1), 15000);
  assert.equal(round(ext, 0.1, 0.18), 10000);
});
