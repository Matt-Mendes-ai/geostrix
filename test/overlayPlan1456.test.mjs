// TASKS.csv #1456 — the evidence overlay's best places with "Plan a hole to here", and "distance to drilling" as evidence.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { topCells, distanceEvidence } from "../src/lib/evidence.js";
import { drilledParts } from "../src/lib/evidenceSources.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

const grid = { nx: 20, ny: 10, x0: 1000, yTop: 5000, dx: 10, dy: 10 };

test("top places: best first, kept apart, at the grid's cell centres", () => {
  const s = new Float32Array(200).fill(0.1);
  s[3 * 20 + 4] = 0.9; s[3 * 20 + 5] = 0.88; // the best and its neighbour: one target
  s[8 * 20 + 17] = 0.7; s[0] = NaN;
  const top = topCells(s, grid, { n: 3 });
  assert.equal(top[0].score.toFixed(2), "0.90");
  assert.deepEqual([top[0].x, top[0].y], [1040, 4970]);
  assert.equal(top[1].i, 17, "the neighbour at 0.88 is skipped (closer than 5 cells)");
  assert.equal(top.length, 3);
  assert.ok(top.every((a, k) => top.every((b, m) => k === m || Math.hypot(a.x - b.x, a.y - b.y) >= 50)));
  assert.deepEqual(topCells(new Float32Array(200).fill(NaN), grid), []);
});

test("distance to drilling: 0 on a trace, growing away from it in plan", () => {
  const traces = new Map([["H1", [{ md: 0, x: 1050, y: 4950, z: 500 }, { md: 50, x: 1090, y: 4950, z: 470 }]]]);
  const parts = drilledParts(traces);
  assert.deepEqual(parts, [[[1050, 4950], [1090, 4950]]]);
  const d = distanceEvidence(grid, parts);
  const at = (x, y) => d[Math.round((grid.yTop - y) / grid.dy) * grid.nx + Math.round((x - grid.x0) / grid.dx)];
  assert.equal(at(1070, 4950), 0, "under the angled trace, between collar and toe");
  assert.ok(at(1190, 4950) > at(1120, 4950) && at(1120, 4950) > 0);
  assert.deepEqual(evidenceDeps({ kind: "drilled", ref: "traces" }, {}, { collars: 1, survey: 2, desurveyMethod: 3, rasters: 4 }), [1, 2, 3]);
});

test("wired: the source, its rising default, the lists and the plan hand-over with a blank elevation", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /key: "drilled", label: tr\("Distance to drilling \(hole traces, in plan\)"\), kind: "drilled"/);
  assert.match(p, /src\.kind === "drilled"\) return distanceEvidence\(grid, drilledParts\(traces\)\)/);
  assert.match(p, /if \(src\.kind === "drilled"\) \{[^\n]*shape: "increasing", low: 0/);
  assert.match(p, /<TopPlaces score=\{result\.fuzzy\}/);
  assert.match(p, /<TopPlaces score=\{result\.wofe\.post\.prob\}/);
  assert.match(p, /onPlanTo\(\{ x: c\.x, y: c\.y, z: null \}\)/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /<EvidenceOverlayPane onClose=\{\(\) => setToolPane\(null\)\} onPlanTo=/);
  const f = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(f, /Number\.isFinite\(v\) \? Math\.round\(v \* 10\) \/ 10 : ""/);
});
