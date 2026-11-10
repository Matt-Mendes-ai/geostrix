// TASKS.csv #2553 (review #2486, WA lithium) — Euler solutions hang from the grid's own level when it has one, under the terrain otherwise
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterLevelM, filteredLevelM, placeEulerSolutions } from "../src/lib/eulerPlace.js";

const d = { x: [0, 1, 2], y: [0, 0, 0], depth: [224, 230, 228] };

test("a grid at 332 m: each solution at 332 minus its depth, with or without terrain", () => {
  const eqs = { levelM: 332, filter: { kind: "equivalent-sources", params: { elevationM: 332 } } };
  assert.equal(rasterLevelM(eqs), 332);
  const p = placeEulerSolutions(d, { levelM: rasterLevelM(eqs), groundAt: () => 250 });
  assert.deepEqual(p.z, [108, 102, 104]); // the terrain (250) is not used: it would put them at 26, 20, 22
  assert.equal(p.byLevel, 3); assert.equal(p.missing, 0);
});

test("filtered grids keep the level (upward continuation raises it); a draped grid hangs from the terrain", () => {
  const eqs = { levelM: 332 };
  assert.equal(filteredLevelM(eqs, "rtp", {}), 332);
  assert.equal(filteredLevelM(eqs, "upward", { height: 50 }), 382);
  const idw = { elevation: 310, provenance: { tool: "IDW gridding" } };
  assert.equal(rasterLevelM(idw), null);
  assert.equal(filteredLevelM(idw, "rtp", {}), null);
  const p = placeEulerSolutions(d, { levelM: null, groundAt: (x) => (x === 2 ? NaN : 300) });
  assert.deepEqual(p.z, [76, 70, null]);
  assert.equal(p.byTerrain, 2); assert.equal(p.missing, 1);
});

test("the Euler branch, the filters and the equivalent-sources grid are wired to it", () => {
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /const levelM = rasterLevelM\(r\), placed = placeEulerSolutions\(d,/);
  assert.match(r, /extra: \{ levelM: filteredLevelM\(r, filt\.kind, params\)/);
  assert.doesNotMatch(r, /z: Number\.isFinite\(ground\) \? \+\(ground - d\.depth\[i\]\)/);
  assert.match(readFileSync(new URL("../src/components/EqsGridBox.jsx", import.meta.url), "utf8"), /extra: \{ levelM: Number\.isFinite\(elevM\) \? elevM : null/);
});
