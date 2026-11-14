// TASKS.csv #3255 (Galore Creek review) — the default estimate (Min distinct holes 2, the 5 % box ticked) left the blocks the drillholes pass
// through empty (41 of 321 pierced blocks, six of 14 holes with no block) and did not say so; the record did not say whether the rule was on.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel, useMaterialRule } from "../src/lib/estimation.js";

test("the rule applies only beyond a cell of the nearest composite", () => {
  const used = (d) => [{ d2: d * d, hole_id: "A" }];
  assert.equal(useMaterialRule(2, true, 20, used(20)), false, "at a cell: every hole counts");
  assert.equal(useMaterialRule(2, true, 20, used(21)), true);
  assert.equal(useMaterialRule(1, true, 20, used(50)), false, "min holes 1: never");
  assert.equal(useMaterialRule(2, false, 20, used(50)), false, "the box unticked: never");
  assert.equal(useMaterialRule(2, true, undefined, used(5)), true, "no reach given: as #1573");
});

test("widely spaced holes: every block a hole passes through is estimated (a 200 m grid of holes, 20 m cells)", () => {
  const pts = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 30; k++) pts.push({ x: i * 200, y: j * 200, z: -2 * k - 1, value: 1 + ((i + j + k) % 5), hole_id: `H${i}${j}`, len: 2 });
  const r = estimateBlockModel(pts, { bounds: { xmin: -10, xmax: 410, ymin: -10, ymax: 410, zmin: -60, zmax: 0 }, cellSize: { dx: 20, dy: 20, dz: 20 }, method: "idw2", searchRadius: 300, minSamples: 1, maxSamples: 16, minHoles: 2, materialHoles: true });
  assert.equal(r.piercedBlocks.holes, 9);
  assert.equal(r.piercedBlocks.blocks, 27, "three 20 m blocks down each of nine holes");
  assert.equal(r.piercedBlocks.estimated, 27, "every pierced block estimated");
  assert.deepEqual(r.piercedBlocks.holesEmpty, []);
  // they rest on one hole: the dominant-hole share flags them (#1617)
  const pierced = r.cells.filter((c) => pts.some((p) => Math.abs(p.x - c.x) <= 10 && Math.abs(p.y - c.y) <= 10));
  assert.ok(pierced.length >= 27 && pierced.every((c) => c.holeShare >= 0.95), "flagged effectively one hole");
});

test("wiring: the result line, the recorded rule, the drilled-block counts; keys", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /secondHoleRule: materialHoles \? "a second hole counts when it carries at least 5 % of the inverse-distance weight, except for a block within a cell of its nearest composite/);
  assert.match(m, /if \(est\.piercedBlocks\) params\.drilledBlocks = \{/);
  assert.match(m, /\{result\.piercedBlocks\?\.blocks > 0 && result\.piercedBlocks\.estimated < result\.piercedBlocks\.blocks && \(/);
  const e = readFileSync(new URL("../src/lib/estimation.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((e.match(/nearHoleM: Math\.max\(dx, dy, dz\)(, \.\.\.\(opts\.holeBracket === false \? \{ holeBracket: false \} : \{\}\))? \}/g) || []).length, 2, "both entry points pass the reach"); // holeBracket: #3275
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["{e} of the {b} blocks a drillhole passes through were estimated.", "{k} of the {h} holes have no estimated block anywhere along them ({list}): Min distinct holes ({m}) or the search left them out."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
