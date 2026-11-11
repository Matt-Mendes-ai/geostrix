// TASKS.csv #2118 / #2283 — a stope's tonnes include the rock of blocks the model never estimated inside it; the header counts levels with stopes
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stopeOutlines } from "../src/lib/stopeOutlines.js";

// a 2 x 7 column patch of 10 m blocks, two blocks high (a 20 m level), one block missing
const cells = [];
for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) if (!(i === 3 && j === 1 && k === 1)) cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 805 + k * 10, dx: 10, dy: 10, dz: 10, value: 5 });

test("28 block positions, 27 blocks: the stope is 28,000 m3 x 2.63 t, the missing block counted with no metal", () => {
  const r = stopeOutlines({ cells }, { cutoff: 1, levelH: 20, density: 2.63, zMin: 800, zMax: 820 });
  const s = r.levels[0].stopes[0];
  assert.ok(Math.abs(s.tonnes - 28000 * 2.63) < 1e-6, String(s.tonnes)); // 73,640 t, not 71,010
  assert.ok(Math.abs(s.unestimatedTonnes - 1000 * 2.63) < 1e-6);
  assert.ok(Math.abs(s.grade - (27 * 2630 * 5) / 73640) < 1e-9); // the missing rock dilutes
  assert.ok(Math.abs(r.totals.unestimatedTonnes - 2630) < 1e-6);
});

test("the pane: levels with stopes, and the unestimated rock said", () => {
  const p = fs.readFileSync("src/components/StopesPane.jsx", "utf8");
  assert.match(p, /const withStopes = res\.levels\.filter\(\(l\) => l\.stopes\.length\)\.length;/);
  assert.match(p, /res\.totals\.unestimatedTonnes > 0\.5 &&/);
});
