// TASKS.csv #1154 — evidence a drilling project holds: surveys, block models column by column, grades along the holes
// (where the interval is, not at the collar) and distance to logged structures
import test from "node:test";
import assert from "node:assert/strict";
import { evidenceGrid, cellXY, distanceEvidence, pointEvidence } from "../src/lib/evidence.js";
import { surveyNames, surveyPoints, reachFromSpacing, voxelColumnEvidence, holeTraces, holeGradePoints, structureCodes, structureParts } from "../src/lib/evidenceSources.js";

const grid = evidenceGrid({ extent: [0, 0, 1000, 1000], cellSize: 100 });
const cellAt = (x, y) => { for (let k = 0; k < grid.nx * grid.ny; k++) { const [a, b] = cellXY(grid, k); if (Math.abs(a - x) < 51 && Math.abs(b - y) < 51) return k; } return -1; };

test("#1154 surveys: named, kept apart, and the reach bridges the lines", () => {
  const rows = [{ _src: "mag.csv", x: 1, y: 2, value: 50 }, { _src: "mag.csv", x: 3, y: 4, value: NaN }, { _src: "grav.csv", x: 5, y: 6, value: 1 }, { _src: "empty.csv", x: 7, y: 8 }];
  assert.deepEqual(surveyNames(rows), ["mag.csv", "grav.csv"]);
  assert.deepEqual(surveyPoints(rows, "mag.csv"), [{ x: 1, y: 2, value: 50 }]);
  // lines 200 m apart with stations every 10 m: half the line spacing must be covered
  const pts = [];
  for (let l = 0; l <= 2000; l += 200) for (let s = 0; s <= 2000; s += 10) pts.push({ x: l, y: s });
  assert.ok(reachFromSpacing(pts, 4) >= 100, String(reachFromSpacing(pts, 4)));
  assert.equal(reachFromSpacing([{ x: 1, y: 1 }]), 500);
  // far more points than a spread into Math.max can take
  const many = Array.from({ length: 300000 }, (_, i) => ({ x: i, y: i }));
  assert.ok(reachFromSpacing(many) >= 50);
});

test("#1154 a block model from above: highest or lowest over depth, nothing outside, unsupported blocks left out", () => {
  const cell = (x, y, z, value, extra = {}) => ({ x, y, z, dx: 100, dy: 100, dz: 50, value, ...extra });
  const model = { cells: [cell(450, 550, 100, 5), cell(450, 550, 50, 9), cell(650, 550, 50, 1, { support: 0.01 }), cell(250, 250, 0, NaN)], supportCutoff: 0.1 };
  const hi = voxelColumnEvidence(grid, model), lo = voxelColumnEvidence(grid, model, "min");
  assert.equal(hi[cellAt(450, 550)], 9);
  assert.equal(lo[cellAt(450, 550)], 5);
  assert.ok(Number.isNaN(hi[cellAt(650, 550)]), "unsupported");
  assert.ok(Number.isNaN(hi[cellAt(250, 250)]), "no value");
  assert.ok(Number.isNaN(hi[cellAt(50, 50)]), "no block");
  // a block smaller than a grid cell still marks the cell it falls in
  const small = voxelColumnEvidence(grid, { cells: [{ x: 460, y: 540, z: 0, dx: 5, dy: 5, dz: 5, value: 3 }] });
  assert.equal(small.filter(Number.isFinite).length, 1);
});

const collars = [{ hole_id: "A", x: 500, y: 500, z: 1000, azimuth: 90, dip: 0, total_depth: 400 }, { hole_id: "B", x: 500, y: 500, z: 1000, azimuth: 270, dip: 0, total_depth: 400 }];
const survey = [{ hole_id: "A", depth: 0, azimuth: 90, dip: 0 }, { hole_id: "A", depth: 400, azimuth: 90, dip: 0 }, { hole_id: "B", depth: 0, azimuth: 270, dip: 0 }, { hole_id: "B", depth: 400, azimuth: 270, dip: 0 }];

test("#1154 grades sit where the interval is, so two holes fanned from one pad do not pile on one spot", () => {
  const traces = holeTraces(collars, survey, "minimumCurvature");
  assert.equal(traces.size, 2);
  const units = { Au: "ppm" };
  const assays = [
    { hole_id: "A", from: 290, to: 310, values: { Au: 5 } }, { hole_id: "A", from: 292, to: 312, values: { Au: 1 } },
    { hole_id: "B", from: 290, to: 310, values: { Au: 2 } }, { hole_id: "B", from: 10, to: 20, values: {} }, { hole_id: "lost", from: 0, to: 1, values: { Au: 9 } },
  ];
  const pts = holeGradePoints(assays, "Au", "ppm", units, traces);
  assert.equal(pts.length, 2, JSON.stringify(pts));
  const east = pts.find((p) => p.x > 500), west = pts.find((p) => p.x < 500);
  assert.equal(east.value, 5, "the bin keeps its highest interval");
  assert.equal(west.value, 2);
  assert.ok(Math.abs(east.x - 800) < 15 && Math.abs(west.x - 200) < 15, `${east.x} ${west.x}`);
  const ev = pointEvidence(grid, pts, { maxDistance: 150 });
  assert.ok(ev[cellAt(800, 500)] > ev[cellAt(200, 500)]);
  assert.ok(Number.isNaN(ev[cellAt(500, 500)]), "nothing at the collars");
});

test("#1154 distance to logged structures: one source per type, measured from the pick's place on the hole", () => {
  const traces = holeTraces(collars, survey, "minimumCurvature");
  const picks = [{ hole_id: "A", depth: 200, value: "FLT" }, { hole_id: "B", depth: 100, value: " FLT " }, { hole_id: "A", depth: 50, value: "VN" }, { hole_id: "lost", depth: 50, value: "SHZ" }, { hole_id: "A", value: "CON" }, { hole_id: "A", depth: 5, value: "" }];
  assert.deepEqual(structureCodes(picks, traces), ["FLT", "VN"]);
  const parts = structureParts(picks, "FLT", traces);
  assert.equal(parts.length, 2);
  const d = distanceEvidence(grid, parts);
  assert.ok(d[cellAt(700, 500)] <= 150, String(d[cellAt(700, 500)]));
  assert.ok(d[cellAt(50, 950)] > 400);
});
