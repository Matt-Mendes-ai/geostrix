// TASKS.csv #2534 — Vein: P in the pit took 225 of 254 intercepts that start at a collar or end at the end of the hole as walls, and said
// nothing: their thickness is a minimum. The run now counts them; the surface row no longer prints a volume to 0.1 m³.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openIntercepts } from "../src/lib/vein.js";

test("intercepts open at the collar, at the end, or both", () => {
  const len = { A: 30, B: 30, C: 30, D: 30 };
  const r = openIntercepts([
    { holeId: "A", from: 0, to: 12 }, // at the collar
    { holeId: "B", from: 18, to: 30 }, // at the end
    { holeId: "C", from: 0, to: 30 }, // the whole hole
    { holeId: "D", from: 10, to: 14 }, // both walls logged
    { holeId: "X", from: 5, to: 9 }, // no length known: not open at the end
  ], (h) => len[h]);
  assert.deepEqual(r, { atCollar: 2, atEnd: 2, whole: 1, open: 3, of: 5 });
  assert.equal(openIntercepts([{ holeId: "A", from: 0.04, to: 29.96 }], () => 30).whole, 1, "within 5 cm counts");
  assert.equal(openIntercepts([], () => 1).of, 0);
});

test("wired: the vein run says it; the surface row prints three significant figures", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const oi = openIntercepts\(used, lenOf\);/);
  assert.match(r, /oi\.open > oi\.of \/ 2 \? tr\(" Most intercepts are open/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{Number\(expandedSurfaceVolume\.volumeM3\.toPrecision\(3\)\)\.toLocaleString\(\)\} m³/);
  assert.equal(Number((736370.9).toPrecision(3)).toLocaleString("en"), "736,000");
});
