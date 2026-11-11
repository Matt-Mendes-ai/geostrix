// TASKS.csv #2545 — a fixed 25 m pad merged a regular 25 m grid into '951 drill sites ... typically 50 m from the next', and the variogram took
// its lag from that. The pad now follows the drilling: a tenth of the median nearest-collar distance, between 3 and 25 m.
import test from "node:test";
import assert from "node:assert/strict";
import { holeSpacingSummary } from "../src/lib/holeSpacing.js";

const grid = (n, step, x0 = 0, y0 = 0) => { const g = []; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) g.push({ hole_id: `G${x0}_${i}_${j}`, x: x0 + i * step, y: y0 + j * step }); return g; };

test("a 25 m grid is 25 m, a 10 m pit grid is 10 m", () => {
  const s = holeSpacingSummary(grid(20, 25));
  assert.equal(s.sites, 400); assert.equal(s.medianM, 25); assert.equal(s.padM, 3);
  const pit = holeSpacingSummary(grid(15, 10));
  assert.equal(pit.medianM, 10); assert.equal(pit.sites, 225);
});

test("fans from one collar still count once; a typed pad is still honoured", () => {
  const fans = [];
  for (let s = 0; s < 6; s++) for (let k = 0; k < 4; k++) fans.push({ hole_id: `S${s}_${k}`, x: s * 60 + k * 0.4, y: 0 });
  const f = holeSpacingSummary(fans);
  assert.equal(f.sites, 6); assert.ok(Math.abs(f.medianM - 60) < 1, JSON.stringify(f));
  assert.equal(holeSpacingSummary(grid(10, 25), 25).sites < 100, true, "padM 25 typed: the old behaviour, on request");
  assert.equal(holeSpacingSummary([{ x: 0, y: 0 }, { x: 40, y: 0 }]).padM, 25, "too few collars to measure: the old 25 m");
});
