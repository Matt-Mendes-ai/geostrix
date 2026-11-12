// TASKS.csv #2756 (split from #2419) — Grade × thickness in plan estimated by inverse distance only. lib/planKriging.js adds ordinary kriging:
// a 2D variogram of each variable from the holes, then point kriging at the same nodes inverse distance estimates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planVariogram, planGridOK } from "../src/lib/planKriging.js";
import { planGrid, planSpacing } from "../src/lib/accumulation.js";

let seed = 2756; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const truth = (x, y) => 5 + 4 * Math.sin(x / 160) * Math.cos(y / 190);
const holes = [];
for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const x = i * 50 + rnd() * 20, y = j * 50 + rnd() * 20, gt = truth(x, y) + 0.2 * (rnd() - 0.5); holes.push({ hole_id: `H${i}_${j}`, x, y, gt, thicknessM: 2 + gt / 3 }); }

test("a smooth field has a structured variogram; a shuffled one is nugget", () => {
  const sp = planSpacing(holes);
  const v = planVariogram(holes, "gt", sp);
  assert.ok(v.fit && v.fit.rSquared > 0.8 && v.fit.nuggetRatio < 0.2 && v.fit.range > 2 * sp, JSON.stringify(v.fit));
  const vals = holes.map((h) => h.gt).sort(() => rnd() - 0.5);
  const noise = holes.map((h, k) => ({ ...h, gt: vals[k] }));
  const w = planVariogram(noise, "gt", sp);
  assert.ok(!w.fit || w.fit.nuggetRatio > 0.6 || w.fit.rSquared < 0.5, "shuffled values: no structure " + JSON.stringify(w.fit));
  assert.equal(planVariogram(holes.slice(0, 5), "gt", sp).why, "few");
  assert.equal(planVariogram(holes.map((h) => ({ ...h, gt: 3 })), "gt", sp).why, "flat");
});

test("kriging covers exactly inverse distance's nodes, honours the holes, and is closer to the truth here", () => {
  const sp = planSpacing(holes), cell = 10, radius = Math.round(sp * 2.5);
  const vgGT = planVariogram(holes, "gt", sp).fit, vgTh = planVariogram(holes, "thicknessM", sp).fit;
  const idw = planGrid(holes, { cell, radius, pad: radius / 2 });
  const t0 = performance.now();
  const ok = planGridOK(holes, { cell, radius, pad: radius / 2, vgGT, vgTh });
  const ms = performance.now() - t0;
  assert.equal(ok.nx * ok.ny, idw.nx * idw.ny);
  let same = 0, errI = 0, errK = 0, n = 0;
  for (let k = 0; k < ok.gt.length; k++) {
    if (Number.isFinite(ok.gt[k]) === Number.isFinite(idw.gt[k])) same++;
    const i = k % ok.nx, j = Math.floor(k / ok.nx), x = ok.x0 + i * ok.cell, y = ok.y0 + j * ok.cell;
    if (!Number.isFinite(ok.gt[k]) || x < 50 || x > 750 || y < 50 || y > 750) continue; // inside the drilling
    errI += (idw.gt[k] - truth(x, y)) ** 2; errK += (ok.gt[k] - truth(x, y)) ** 2; n++;
  }
  assert.equal(same, ok.gt.length, "the same footprint");
  assert.ok(n > 1000);
  const rI = Math.sqrt(errI / n), rK = Math.sqrt(errK / n);
  assert.ok(rK < rI, `kriging RMSE ${rK.toFixed(3)} vs inverse distance ${rI.toFixed(3)}`);
  assert.equal(ok.method, "ok"); assert.deepEqual(ok.kriged, { gt: true, thickness: true });
  assert.ok(ms < 4000, `${Math.round(ms)} ms for ${ok.estimated} nodes`);
  if (process.env.SHOW) console.log({ rmseIdw: rI.toFixed(3), rmseOk: rK.toFixed(3), ms: Math.round(ms), nodes: ok.estimated, vgGT });
});

test("a variable with no variogram keeps inverse distance; negative kriged values are set to 0", () => {
  const sp = planSpacing(holes), radius = Math.round(sp * 2.5);
  const idw = planGrid(holes, { cell: 25, radius, pad: radius / 2 });
  const ok = planGridOK(holes, { cell: 25, radius, pad: radius / 2, vgGT: planVariogram(holes, "gt", sp).fit, vgTh: null });
  assert.deepEqual([...ok.thickness], [...idw.thickness], "thickness unkriged");
  for (const v of ok.gt) if (Number.isFinite(v)) assert.ok(v >= 0);
});

test("the dialog offers the method and says what each variogram is", () => {
  const m = readFileSync(new URL("../src/components/GradeThicknessModal.jsx", import.meta.url), "utf8");
  assert.match(m, /<option value="ok">\{tr\("Ordinary kriging \(a 2D variogram of each\)"\)\}<\/option>/);
  assert.match(m, /import\("\.\.\/lib\/planKriging\.js"\)/, "loaded on demand");
  assert.match(m, /const grid = runMethod === "ok" \? ok\?\.grid \?\? null : idwGrid;/);
  assert.ok(m.includes('tr("A weak or nugget-dominated fit: kriging adds little over inverse distance here.")'));
});
