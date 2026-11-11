// TASKS.csv #2569 — 'Build intrusion bodies' on a terrain triangulated from the collars refused even the hull of those collars: its outline
// touched cells the triangulation left empty, inside the terrain's own box. Such gaps now take the nearest outline ground (counted); an
// outline beyond the terrain's box is still refused; the result stays in the pane.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intrusionBody } from "../src/lib/intrusionBody.js";

const E0 = 500000, N0 = 6000000;
const square = (s) => [[E0, N0], [E0 + s, N0], [E0 + s, N0 + s], [E0, N0 + s], [E0, N0]];
const box = [E0 - 100, N0 - 100, E0 + 1100, N0 + 1100];
const inBox = (x, y) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];

test("gaps inside the terrain's box are filled from the nearest outline ground and counted", () => {
  const gappy = (x) => (x > E0 + 600 ? NaN : 100); // the east part of the outline over empty cells
  const b = intrusionBody(square(1000), gappy, { depthM: 200, inTerrain: inBox });
  assert.ok(b.filledTop > 0 && b.filledTop < b.topPoints, `${b.filledTop} of ${b.topPoints}`);
  assert.deepEqual(b.topZ, [100, 100]);
});

test("beyond the box is refused as before; no ground at all is refused; no gaps: nothing filled", () => {
  assert.throws(() => intrusionBody(square(1000), (x) => (x > E0 + 500 ? NaN : 100), { inTerrain: (x) => x <= E0 + 500 }), /beyond the terrain/);
  assert.throws(() => intrusionBody(square(1000), () => NaN, { inTerrain: inBox }), /No part of this polygon has terrain under it/);
  assert.equal(intrusionBody(square(1000), () => 100, { depthM: 100, inTerrain: inBox }).filledTop, 0);
});

test("the run passes the box, reports the fill, and the pane keeps the result", () => {
  const r = readFileSync(new URL("../src/modules/viewer/intrusionRun.js", import.meta.url), "utf8");
  assert.match(r, /flare: p\.flare, inTerrain(, sheet: p\.sheet \|\| null)? \}\)/); // sheet: #2642
  assert.match(r, /return \{ added: added\.length, failed: \[\.\.\.new Set\(failed\)\], gapFilled:/);
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\.then\(\(r\) => r && setBodyMsg\(r\)\)/);
});
