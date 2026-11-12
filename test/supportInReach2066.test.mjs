// TASKS.csv #2066 (review #2013, Woodjam) — 'Estimate results and data-support percentages use the whole 14.7 M-block box as the
// denominator: 331 interpolated (0%), 1,714 extrapolated (0%), 14,732,059 unsupported (100%)' although the dialog says only the
// blocks within reach count. The shares are now of the blocks within reach; the rest is named once, apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel, estimateDenseGrid, summarizeSupport, supportInReach, supportBeyondReach } from "../src/lib/estimation.js";

let seed = 2066; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
// three pads ~1 km apart: most of the box lies out of reach
const pts = [];
for (const [px, py] of [[0, 0], [1000, 150], [500, 900]]) for (let h = 0; h < 4; h++) {
  const hx = px + (h % 2) * 30, hy = py + Math.floor(h / 2) * 30;
  for (let i = 0; i < 60; i++) pts.push({ x: hx + i * 0.6, y: hy, z: 500 - 3 * i, value: 1 + rnd() * 10, hole_id: `P${px}H${h}`, length: 3 });
}
const bounds = { xmin: -40, xmax: 1100, ymin: -40, ymax: 970, zmin: 280, zmax: 520 };
const base = { bounds, cellSize: { dx: 20, dy: 20, dz: 10 }, searchRadius: 60, minSamples: 1, maxSamples: 12, maxBlocks: 2000000, method: "idw2", support: true };

test("the support shares are of the blocks within reach", () => {
  const a = estimateBlockModel(pts, base);
  const total = a.grid.nx * a.grid.ny * a.grid.nz, beyond = supportBeyondReach(a);
  assert.equal(beyond, total - a.blocksInReach);
  assert.ok(beyond > total * 0.9, "most of the box is out of reach: " + beyond + " of " + total);
  const sc = a.supportCounts, inR = supportInReach(sc, beyond);
  assert.equal(inR.interpolated + inR.extrapolated + inR.unsupported, a.blocksInReach, "the shares add up to the blocks in reach");
  const old = summarizeSupport(sc), now = summarizeSupport(sc, { beyond });
  const pctOf = (s, k) => Number(new RegExp("([\\d,]+) " + k + " \\((\\d+)%\\)").exec(s)[2]);
  assert.ok(pctOf(old, "unsupported") >= 90, "before: the box as the denominator (" + old.slice(0, 120) + ")");
  const shareI = Math.round((100 * inR.interpolated) / a.blocksInReach);
  assert.equal(pctOf(now, "interpolated"), shareI);
  assert.ok(pctOf(now, "unsupported") < 90, now.slice(0, 160));
  assert.equal(supportInReach(sc, 0), sc, "nothing out of reach: unchanged");
  assert.equal(supportInReach({ interpolated: 1, extrapolated: 1, unsupported: 0 }, 50).unsupported, 0, "never below 0 (a volume trim drops them)");
});

test("the dense grid behind a shell carries its reach too", () => {
  const g = estimateDenseGrid(pts, base);
  const beyond = supportBeyondReach(g);
  assert.ok(beyond > 0 && Number.isFinite(g.blocksInReach));
  assert.equal(beyond, g.nx * g.ny * g.nz - g.blocksInReach);
  assert.equal(supportBeyondReach(estimateDenseGrid(pts, { ...base, noReach: true })), 0);
});

test("the dialog and the shell notice pass the reach", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /summarizeSupport\(result\.supportCounts, \{ beyond: supportBeyondReach\(result\) \}\)/);
  assert.match(m, /supportInReach\(result\.supportCounts, supportBeyondReach\(result\)\)\[k\]/);
  assert.match(m, /lie beyond every composite's reach: not estimated, and not counted here/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /summarizeSupport\(grid\.supportCounts, \{ tool: "shell", beyond: supportBeyondReach\(grid\)/);
});
