// TASKS.csv #2419 (review #2325, WA uranium; Matt's decision 2026-11-11) — grade x thickness per hole from Best intercepts' rules, a plan
// estimate of GT and thickness, a contour at a typed GT cut-off, area x GT x density = metal; Best intercepts' Total per hole.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { holeTotals, clipAssaysToUnit, planSpacing, planGrid, planSummary, contourSegments } from "../src/lib/accumulation.js";

test("#2419: per hole, thickness and GT over the sampled metres, from Best intercepts' own intercepts; top and base RL", () => {
  const assays = [
    { hole_id: "A", from: 30, to: 32, values: { U: 600 } }, { hole_id: "A", from: 32, to: 34, values: { U: 400 } },
    { hole_id: "A", from: 34, to: 40, values: { U: 10 } },
    { hole_id: "A", from: 40, to: 41, values: { U: 1000 } },
    { hole_id: "B", from: 10, to: 12, values: { U: 50 } },
  ];
  const ints = computeBestIntercepts(assays, "U", "ppm", { U: "ppm" }, { cutoff: 200, maxInternalDilution: 0, minLength: 0 });
  const pos = (h, md) => ({ x: h === "A" ? 100 : 200, y: 0, z: 300 - md }); // vertical holes from RL 300
  const t = holeTotals(ints, pos);
  assert.equal(t.length, 1);
  const a = t[0];
  assert.equal(a.hole_id, "A"); assert.equal(a.intercepts, 2);
  assert.equal(a.thicknessM, 5); // 30-34 and 40-41
  assert.equal(a.gt, 600 * 2 + 400 * 2 + 1000); // m·ppm
  assert.equal(a.meanGrade, 3000 / 5);
  assert.deepEqual([a.topRL, a.baseRL, a.x], [270, 259, 100]);
});

test("#2419: within one logged unit: the assays clipped to that unit's intervals", () => {
  const assays = [{ hole_id: "A", from: 0, to: 10, values: { U: 300 } }];
  const litho = [{ hole_id: "A", from: 4, to: 6, value: "LIG" }, { hole_id: "A", from: 6, to: 10, value: "SST" }];
  assert.deepEqual(clipAssaysToUnit(assays, litho, "LIG").map((r) => [r.from, r.to]), [[4, 6]]);
  assert.equal(clipAssaysToUnit(assays, litho, "CLAY").length, 0);
});

test("#2419: the plan estimate honours the holes, leaves far nodes unestimated, and sums area, tonnes and metal", () => {
  // a 3 x 3 grid of holes 100 m apart: the middle one GT 2000 m·ppm over 4 m, the others 0 (drilled, nothing at the cut-off)
  const pts = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push({ x: i * 100, y: j * 100, gt: i === 1 && j === 1 ? 2000 : 0, thicknessM: i === 1 && j === 1 ? 4 : 0 });
  assert.equal(planSpacing(pts), 100);
  const g = planGrid(pts, { cell: 25, radius: 250, pad: 0 });
  const at = (x, y) => g.gt[Math.round((x - g.x0) / g.cell) + g.nx * Math.round((y - g.y0) / g.cell)];
  assert.equal(at(100, 100), 2000, "a node on a hole takes its value");
  assert.equal(at(0, 0), 0);
  assert.ok(at(50, 100) > 0 && at(50, 100) < 2000);
  const far = planGrid([{ x: 0, y: 0, gt: 5, thicknessM: 1 }, { x: 1000, y: 0, gt: 5, thicknessM: 1 }], { cell: 100, radius: 150 });
  assert.ok(Number.isNaN(far.gt[5]), "500 m from both holes: not estimated, not barren");
  const s = planSummary(g, 1000, 2.5, "ppm");
  assert.ok(s.nodes > 0 && s.areaM2 === s.nodes * 625);
  // metal = sum(GT x area) x density x 1 g per t per ppm; tonnes = sum(thickness x area) x density
  let gtA = 0, vol = 0; for (let k = 0; k < g.gt.length; k++) if (g.gt[k] >= 1000) { gtA += g.gt[k] * 625; vol += g.thickness[k] * 625; }
  assert.ok(Math.abs(s.metal - gtA * 2.5) < 1e-6 && s.metalUnit === "g");
  assert.ok(Math.abs(s.tonnes - vol * 2.5) < 1e-6);
  assert.equal(planSummary(g, 1000, "", "ppm").metal, null, "no density typed: no metal");
  assert.equal(planSummary(g, 1000, 2.5, "%").metalUnit, "t");
  // the contour closes round the middle hole
  const segs = contourSegments(g, g.gt, 1000);
  assert.ok(segs.length >= 4);
  for (const [x1, y1, x2, y2] of segs) assert.ok([x1, x2].every((x) => x > 0 && x < 200) && [y1, y2].every((y) => y > 0 && y < 200));
});

test("#2419: the dialog offers the oxide (never by itself), types every cut-off, and Best intercepts has Total per hole", async () => {
  const { oxideOffer, gtUnitLabel } = await import("../src/lib/accumulation.js");
  const src = fs.readFileSync("src/components/GradeThicknessModal.jsx", "utf8");
  assert.match(src, /const \[cutoff, setCutoff\] = useState\(""\)/);
  assert.match(src, /\[gtCut, setGtCut\] = useState\(""\), \[density, setDensity\] = useState\(""\)/);
  assert.match(src, /const \[asOxide, setAsOxide\] = useState\(false\)/);
  {
    assert.deepEqual(oxideOffer("U", "ppm"), { oxide: "U3O8", factor: 1.1792 });
    assert.equal(oxideOffer("Li", "% Li2O"), null, "already reported as the oxide");
    assert.equal(gtUnitLabel("%", "Li2O"), "m% Li2O");
    assert.equal(gtUnitLabel("ppm"), "m·ppm");
  }
  const bi = fs.readFileSync("src/components/BestIntercepts.jsx", "utf8");
  assert.match(bi, /const hs = holeTotals\(results\)|holeTotals\(results\) : \[\]/); // #3160: kept in a memo (holeRows)
  assert.match(fs.readFileSync("src/modules/viewer/ModellingPanes.jsx", "utf8"), /<GradeThicknessModal assays=\{assays\}/);
});
