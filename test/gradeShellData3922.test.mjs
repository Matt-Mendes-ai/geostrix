// TASKS.csv #3922 — the grade shell's settings read from the data again: the grid only round the grades (lib/viewer/shellBoxes.js gradeBoxes),
// cells about half the drill spacing and a search of about three spacings (lib/auto/autoGradeShell.js), GeoStrix's standard 50 m / 200 m only
// when the drilling gives no spacing, an over-budget refit said; the run (modellingRuns.js) and the guided Grade model use them. Synthetic data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drilledBoxes, gradeBoxes, boxesBlocks } from "../src/lib/viewer/shellBoxes.js";
import { autoGradeShell, cellStep } from "../src/lib/auto/autoGradeShell.js";
import { estimateDenseGrid } from "../src/lib/estimation.js";

// n x n vertical holes `spacing` apart from (x0, 0), 2 m samples to 100 m; a lens of higher grade 40-60 m down in the middle holes (seeded)
function cluster(x0, { n = 5, spacing = 40, tag = "A", seed = 3, lensAt = (i, j) => i >= 1 && i <= n - 2 && j >= 1 && j <= n - 2 } = {}) {
  let k = seed; const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
  const collars = [], samples = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const hole_id = `DH-${tag}${i}${j}`, x = x0 + i * spacing, y = j * spacing;
    collars.push({ hole_id, x, y, z: 0 });
    for (let d = 0; d < 100; d += 2) {
      const lens = d >= 40 && d < 60 && lensAt(i, j);
      samples.push({ hole_id, from: d, to: d + 2, x, y, z: -(d + 1), value: lens ? 1.5 + rnd() : 0.03 + 0.04 * rnd() });
    }
  }
  return { collars, samples };
}
const both = () => { const a = cluster(0), b = cluster(6000, { tag: "B", seed: 11 }); return { collars: [...a.collars, ...b.collars], samples: [...a.samples, ...b.samples] }; };
const boundsOf = (pts, pad) => {
  const r = (k) => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))];
  const [x0, x1] = r("x"), [y0, y1] = r("y"), [z0, z1] = r("z");
  return { xmin: x0 - pad, xmax: x1 + pad, ymin: y0 - pad, ymax: y1 + pad, zmin: z0 - pad, zmax: z1 + pad };
};

test("two drill clusters far apart do not coarsen the cell, nor stretch the search", () => {
  const one = autoGradeShell({ ...cluster(0), unit: "g/t" }), two = autoGradeShell({ ...both(), unit: "g/t" });
  assert.equal(one.ok, true); assert.equal(two.ok, true);
  assert.equal(one.values.fromData, true);
  assert.equal(one.values.spacing, 40);
  assert.equal(one.values.cellSize, 20); // half the 40 m spacing
  assert.equal(one.values.searchRadius, 120); // three spacings
  assert.deepEqual([two.values.cellSize, two.values.searchRadius, two.values.refit], [20, 120, false]); // 6 km apart: the same cell and search
  assert.equal(two.values.areas, 2); // a grid round each cluster's grades, not one over the 6 km between them
  assert.ok(two.values.blocks <= 2.2 * one.values.blocks, `${two.values.blocks} vs ${one.values.blocks}`);
  const why = Object.fromEntries(two.reasons.map((r) => [r.field, r.text]));
  assert.match(why.cellSize, /^Cells 20 x 20 m: about half your 40 m drill spacing/);
  assert.match(why.searchRadius, /^Search 120 m: about three drill spacings/);
});

test("the grid round the grades keeps every node of the shell, and fewer nodes", () => {
  const { samples } = cluster(0, { n: 9, lensAt: (i, j) => i >= 3 && i <= 5 && j >= 3 && j <= 5 }), cut = 0.5, R = 60, pad = 25, cell = 10; // the lens in the middle 3 x 3 holes
  const bounds = boundsOf(samples, pad), linkM = 2 * Math.max(R, pad);
  const drilled = drilledBoxes(samples, { bounds, padM: pad, linkM });
  const grade = gradeBoxes(samples, cut, { bounds, padM: pad, linkM, drilled, marginM: R + Math.max(pad, cell) });
  assert.ok(boxesBlocks(grade, cell) < 0.8 * boxesBlocks(drilled, cell), `${boxesBlocks(grade, cell)} vs ${boxesBlocks(drilled, cell)}`);
  for (const g of grade) for (const k of ["x", "y", "z"]) { // inside the drilled box
    assert.ok(g.bounds[`${k}min`] >= drilled[0].bounds[`${k}min`] && g.bounds[`${k}max`] <= drilled[0].bounds[`${k}max`]);
  }
  // every node of the drilled box's grid at or above the cut-off lies inside a grade box (the shell is the same)
  const pts = samples.map((p) => ({ ...p, length: 2 }));
  const full = estimateDenseGrid(pts, { bounds: drilled[0].bounds, cellSize: cell, method: "idw2", searchRadius: R, maxBlocks: 5e6 });
  const inAny = (x, y, z) => grade.some(({ bounds: b }) => x >= b.xmin && x <= b.xmax && y >= b.ymin && y <= b.ymax && z >= b.zmin && z <= b.zmax);
  let above = 0;
  for (let iz = 0; iz < full.nz; iz++) for (let iy = 0; iy < full.ny; iy++) for (let ix = 0; ix < full.nx; ix++) {
    const v = full.values[ix + full.nx * (iy + full.ny * iz)];
    if (!(v >= cut)) continue;
    above++;
    assert.ok(inAny(full.origin.x + ix * full.cellSize.dx, full.origin.y + iy * full.cellSize.dy, full.origin.z + iz * full.cellSize.dz));
  }
  assert.ok(above > 50, String(above));
  // a cluster with no composite at the cut-off gets no grid; none anywhere: the drilled boxes, as before
  assert.equal(gradeBoxes(samples, 99, { bounds, padM: pad, linkM, marginM: R + pad }).length, drilled.length);
});

test("no measurable spacing: GeoStrix's standard 50 m / 200 m, said so", () => {
  const { samples } = cluster(0, { n: 4 });
  const collars = [...new Set(samples.map((s) => s.hole_id))].map((hole_id, i) => ({ hole_id, x: (i % 3) * 0.5, y: 0, z: 0 })); // a fan from one pad: one site
  const r = autoGradeShell({ collars, samples, unit: "g/t" });
  assert.equal(r.ok, true);
  assert.deepEqual([r.values.cellSize, r.values.searchRadius, r.values.fromData], [50, 200, false]);
  assert.match(r.reasons.find((x) => x.field === "cells").text, /standard grade-shell settings, because your data didn't give a clear drill spacing/);
});

test("over the block budget the cells grow and the reason says so; the search stays tied to the spacing", () => {
  const r = autoGradeShell({ ...cluster(0, { n: 8 }), unit: "g/t", budget: 2000 });
  assert.equal(r.values.refit, true);
  assert.ok(r.values.cellSize > 20 && r.values.blocks <= 2000, JSON.stringify(r.values));
  assert.equal(r.values.searchRadius, 120);
  assert.match(r.reasons.find((x) => x.field === "cellSize").text, /^Cells \d+ x \d+ m: half your 40 m drill spacing \(20 m\) would need more blocks than the 2,000-block budget here/);
  assert.deepEqual([cellStep(23.5), cellStep(13.9), cellStep(4.4)], [20, 13, 4]); // rounded down to 5 m, 1 m, 0.5 m steps
});

test("the run boxes a Tight shell round the grades and refits at the data's cell; the guided Grade model passes it", () => {
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(runs, /const boxesAt = \(c\) => \(envelopeMode \? drilledBoxList : boxLib\.gradeBoxes\(gridPoints, numericCutoff,/);
  assert.match(runs, /numericCellSize === NUMERIC_CELL_DEFAULT \|\| numericCellSize === cellFromData\)/);
  assert.match(runs, /const runNumericModel = \(opts\) => \{\s+const cellFromData = Number\(opts\?\.cellFromData\) > 0/);
  assert.match(runs, /gradeAreas: \{ grids: gridBoxes\.length, nodes: boxTotal, drilledNodes:/);
  const guided = readFileSync(new URL("../src/modules/viewer/guided/guidedTools.js", import.meta.url), "utf8");
  assert.match(guided, /api\.runNumericModel\(values\?\.fromData \? \{ cellFromData: values\.list\[2\] \} : undefined\)/);
});
