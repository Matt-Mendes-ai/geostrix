// TASKS.csv #2671 — Pit design weighs the rock above the shell's weathered base at the weathered density, ore and waste alike (#2597)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { benchedPit, shellFloors } from "../src/lib/pitDesign.js";
import { weatheredOf } from "../src/lib/pitShell.js";

const shell = () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1000);
  return shellFloors(Float64Array.from(pos), () => 1000);
};
const cells = () => {
  const out = [];
  for (let x = -65; x <= 65; x += 10) for (let y = -65; y <= 65; y += 10) for (let z = 945; z < 1000; z += 10) out.push({ x: 500000 + x, y: 5000000 + y, z, dx: 10, dy: 10, dz: 10, value: z < 970 ? 2 : 0 });
  return out;
};
const opts = { groundAt: () => 1000, cutoff: 1, benchH: 10, berm: 5, batterDeg: 60, density: 2.7, cells: cells() };

test("a weathered zone 20 m thick at 1.8: the top two benches lighter, the ore below unchanged, the tonnes said", () => {
  const plain = benchedPit(shell(), opts), w = benchedPit(shell(), { ...opts, weathered: weatheredOf({ density: 1.8, thicknessM: 20 }) });
  assert.equal(plain.totals.weatheredT, 0);
  const top = (r) => r.benches.reduce((a, b) => (b.rl > a.rl ? b : a));
  // the top bench lies wholly in the weathered zone: its tonnes at 1.8 instead of 2.7
  assert.ok(Math.abs(top(w).rockT - top(plain).rockT * 1.8 / 2.7) < 1e-6 * top(plain).rockT, `${top(w).rockT} vs ${top(plain).rockT}`);
  assert.ok(Math.abs(w.totals.oreT - plain.totals.oreT) < 1e-6 * plain.totals.oreT); // the ore lies under 970, below the 980 base
  assert.ok(w.totals.weatheredT > 0 && w.totals.weatheredDensity === 1.8);
  assert.ok(w.totals.rockT < plain.totals.rockT);
  // a weathered zone down into the ore: the ore above the base at 1.8, the grade unchanged
  const deep = benchedPit(shell(), { ...opts, weathered: weatheredOf({ density: 1.8, thicknessM: 45 }) });
  assert.ok(deep.totals.oreT < plain.totals.oreT);
  assert.ok(Math.abs(deep.totals.meanGrade - plain.totals.meanGrade) < 1e-9);
  assert.ok(!("rockWV" in deep.benches[0]) && !("oreWV" in deep.benches[0]));
});

test("the worker builds the zone from the descriptor; the pane passes the shell's (its log rebuilt) and says the tonnes", () => {
  assert.match(fs.readFileSync("src/lib/pitDesign.worker.js", "utf8"), /weathered: weatheredOf\(opts\.weathered\)/);
  const p = fs.readFileSync("src/components/PitDesignPane.jsx", "utf8");
  assert.match(p, /w\.freshCode \? \{ \.\.\.w, points: weatheredBasePoints\(layers\?\.weath \|\| \[\], holeTraces\(collars, survey, desurveyMethod\), w\.freshCode\)\.points \} : w/);
  assert.match(p, /res\.totals\?\.weatheredT > 0 && line\(tr\("Of the rock, weathered"\)/);
});
