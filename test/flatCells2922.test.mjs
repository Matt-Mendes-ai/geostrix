// TASKS.csv #2922 (review #2876, WA bedded iron; Matt's DECISION 2026-11-12) — cells in the 3D Modelling tools on a bedded deposit:
// (a) the GemPy block keeps #2624's cubic cells, and the vertical cell is said against the units' thickness before every stack run;
// (b) Solid blocks from surfaces takes an optional typed block height, as Undrilled zones (#2966);
// (c) the closed body takes flat cells when its cube is larger than the median logged run (#2384's trigger widened; Matt's second decision
// the same day: twice the median, decided first, missed the review's TNAM case).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seamCells } from "../src/lib/viewer/geomath.js";
import { surfacesToBlock } from "../src/lib/surfaceSolids.js";
import { medianStackThickness } from "../src/lib/stackResolution.js";

test("(c) the cube larger than the median logged run takes flat cells: the review's TNAM case; within it the cube stands", () => {
  // runs of 4 m median (18 m at most) on holes 25 m apart, as WA iron's TNAM
  const autoB = { cell: 2, medianRunM: 4, maxRunM: 18, spacing: 25, fromRuns: true };
  const cellsAt = (c, cz) => Math.round(1000 / c) * Math.round(1300 / c) * Math.round(200 / cz);
  const s = seamCells(6.8, autoB, cellsAt, 1.5e6);
  assert.ok(s, "TNAM's 6.8 m cube: past its 4 m median run, though within the 18 m thickest run");
  assert.equal(s.why, "median");
  assert.equal(s.dz, 2, "half the median run: a run two cells thick");
  assert.ok(s.dxy >= 12.5, `plan ${s.dxy} m from half the 25 m spacing`);
  assert.equal(seamCells(4, autoB, cellsAt, 1.5e6), null, "exactly the median run is not past it: the cube stands");
  assert.equal(seamCells(3, autoB, cellsAt, 1.5e6), null);
  assert.equal(seamCells(20, autoB, cellsAt, 1.5e6).why, "max", "past the thickest run: #2384's own case");
});

test("(b) a typed block height gives flat blocks: the same plan, nz from the height", () => {
  const top = { name: "T", positions: new Float64Array([0, 0, 50, 100, 0, 50, 100, 100, 50, 0, 100, 50]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) };
  const cube = surfacesToBlock({ tops: [top], extent: [0, 100, 0, 100, 0, 60], cell: 10 });
  const flat = surfacesToBlock({ tops: [top], extent: [0, 100, 0, 100, 0, 60], cell: 10, cellZ: 2 });
  assert.deepEqual(cube.block.resolution, [10, 10, 6]);
  assert.deepEqual(flat.block.resolution, [10, 10, 30]);
  const p = readFileSync(new URL("../src/components/SurfaceSolidsPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const cellZ = Number\(cellZIn\) > 0 \? Number\(cellZIn\) : null, cz = cellZ \|\| cell;/);
  assert.match(p, /surfacesToBlock\(\{ tops: tops\.map\(toApi\), solids: solids\.map\(toApi\), extent, cell, cellZ, ground, extend \}\)/);
  assert.match(p, /\.\.\.\(cellZ \? \{ cellZ \} : \{\}\)/, "absent from the recipe when blank: the source key as before");
  assert.match(p, /aria-label=\{tr\("Block height \(m\)"\)\}/);
});

test("(a) the stack's vertical cell said against the units' thickness before every run; the cells stay cubic", () => {
  const specs = [{ points: [{ hole_id: "a", z: 100 }, { hole_id: "b", z: 100 }, { hole_id: "c", z: 100 }] }, { points: [{ hole_id: "a", z: 95 }, { hole_id: "b", z: 94 }, { hole_id: "c", z: 96 }] }];
  assert.equal(medianStackThickness(specs), 5);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const unitT = specs\.length > 1 && !cakeRun && !thin \? medianStackThickness\(specs\) : null;/);
  assert.match(r, /The vertical cell is \{dz\} m against the units' median thickness of \{t\} m/);
  assert.match(r, /notice\(seam\.why === "median" \?/, "the seam notice names the cause");
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["The vertical cell is {dz} m against the units' median thickness of {t} m (the median drop from one top to the next in a hole): about {n} cells across a unit."], l);
    assert.ok(Object.keys(d).some((k) => k.includes("so one cubic cell would be {cube} m, thicker than the median run.")), l);
  }
});
