// TASKS.csv #412 — local mine grid (Helmert similarity) and feet (run: npm test).
import test from "node:test";
import assert from "node:assert/strict";
import { fitSimilarity, applySimilarity, parseControlPoints, transformImportRows, FEET } from "../src/lib/localGrid.js";

// A local grid in FEET, rotated 23.5 deg, origin (10000, 5000) ft at UTM (463000, 6178000).
const rot = (23.5 * Math.PI) / 180, s = FEET;
const toWorld = (lx, ly) => ({ x: 463000 + s * (Math.cos(rot) * (lx - 10000) - Math.sin(rot) * (ly - 5000)), y: 6178000 + s * (Math.sin(rot) * (lx - 10000) + Math.cos(rot) * (ly - 5000)) });

test("#412 similarity fitted from control points recovers scale, rotation and position", () => {
  const pts = [[10000, 5000], [12500, 5200], [11000, 8000]].map(([lx, ly]) => { const w = toWorld(lx, ly); return { lx, ly, wx: w.x, wy: w.y }; });
  const t = fitSimilarity(pts);
  assert.ok(Math.abs(t.scale - FEET) < 1e-9 && Math.abs(t.rotationDeg - 23.5) < 1e-7 && t.rmsM < 1e-6);
  const w = applySimilarity(t, 11750, 6400), e = toWorld(11750, 6400);
  assert.ok(Math.hypot(w.x - e.x, w.y - e.y) < 1e-6);
  // two points are enough; a bad point shows up in the residuals
  assert.ok(fitSimilarity(pts.slice(0, 2)).rmsM < 1e-6);
  const bad = [...pts, { lx: 12000, ly: 7000, wx: toWorld(12000, 7000).x + 25, wy: toWorld(12000, 7000).y }];
  assert.ok(fitSimilarity(bad).rmsM > 5);
  assert.throws(() => fitSimilarity(pts.slice(0, 1)), /two control points/);
});

test("#412 control point text and import-row conversion (feet, grid, datum shift)", () => {
  assert.equal(parseControlPoints("# pins\n10000 5000 463000 6178000\n12500,5200,463600.1,6178402\n\nbad line").length, 2);
  const pts = [[10000, 5000], [12500, 5200]].map(([lx, ly]) => { const w = toWorld(lx, ly); return { lx, ly, wx: w.x, wy: w.y }; });
  const grid = fitSimilarity(pts);
  const rows = [{ HOLE: "H-67-1", E: 10000, N: 5000, RL: 3940, EOH: 500 }];
  const { rows: out, moved } = transformImportRows(rows, { hole_id: "HOLE", x: "E", y: "N", z: "RL", length: "EOH" }, { units: "ft", grid, zShift: -1000 * 0 });
  assert.equal(moved, 1);
  assert.ok(Math.abs(out[0].E - 463000) < 1e-6 && Math.abs(out[0].N - 6178000) < 1e-6);
  assert.ok(Math.abs(out[0].EOH - 152.4) < 1e-9 && Math.abs(out[0].RL - 3940 * FEET) < 1e-9);
  const iv = transformImportRows([{ from: "10", to: 20 }], { from: "from", to: "to" }, { units: "ft" }).rows[0];
  assert.ok(Math.abs(iv.from - 3.048) < 1e-12 && Math.abs(iv.to - 6.096) < 1e-12);
  assert.equal(transformImportRows([{ from: "" }], { from: "from" }, { units: "ft" }).rows[0].from, "");
});
