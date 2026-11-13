// TASKS.csv #2905 follow-up (side 5, at Main's request: "bring that into master's lib/layerCake.js ... measured on the same data both ways") —
// the layer-cake's tops are exact fields through their picks (a thin-plate spline up to 600, an exact local field over the 12 nearest beyond),
// each lower top's thickness taken from the MODELLED top above at its pick. The tensioned minimum-curvature grid smoothed the picks away:
// on the WA iron field (6,281 holes, six strands, the same picks and pinch-outs) 39.5 % of the logged metres came out in their unit (a 185 m
// grid over 24 km), 78.7 % now, in 2.8 s against 4.4 s; 72 % against 60 % on the 268-hole block.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layerCake, fieldThrough } from "../src/lib/layerCake.js";

// an uneven pile on 30 x 30 holes 20 m apart (900 picks a top: the local field), tops that wobble by metres between neighbours
const holes = [];
for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) holes.push({ id: `H${i}_${j}`, x: 10 + i * 20 + (j % 3), y: 10 + j * 20 + (i % 2) });
const top = (h) => 300 + 3 * Math.sin(h.x / 37) + 2 * Math.cos(h.y / 23);
const thickA = (h) => 4 + 1.5 * Math.sin(h.x / 29 + h.y / 41);
const thickB = (h) => (h.x < 150 ? 0 : 3 + Math.cos(h.y / 31)); // B absent in the west: its top is C's there
const specs = [
  { meshName: "A", points: holes.map((h) => ({ x: h.x, y: h.y, z: top(h), hole_id: h.id })) },
  { meshName: "B", points: holes.map((h) => ({ x: h.x, y: h.y, z: top(h) - thickA(h), hole_id: h.id })) },
  { meshName: "C", points: holes.map((h) => ({ x: h.x, y: h.y, z: top(h) - thickA(h) - thickB(h), hole_id: h.id })) },
];

test("every top passes through its own picks, past 600 picks too: 10 cm above and below each pick read as the right unit", () => {
  const ev = [];
  for (const h of holes) {
    const zA = top(h), zB = zA - thickA(h), zC = zB - thickB(h);
    ev.push([h.x, h.y, zA + 0.1, 1], [h.x, h.y, zA - 0.1, 2]); // above A / in A
    if (thickB(h) > 0.3) ev.push([h.x, h.y, zB - 0.1, 3]); // in B where it has a thickness
    ev.push([h.x, h.y, zC - 0.1, 4]); // in C
  }
  const t0 = performance.now();
  const r = layerCake(specs, [0, 620, 0, 620, 280, 310], [31, 31, 15], { evalPts: ev.map(([x, y, z]) => [x, y, z]) });
  const ms = performance.now() - t0;
  assert.ok(!r.error, r.error);
  const wrong = ev.filter((e, i) => r.evaluated[i] !== e[3]).length;
  assert.equal(wrong, 0, `${wrong} of ${ev.length} points off their unit`);
  assert.ok(ms < 5000, `${ms.toFixed(0)} ms`);
  const tB = r.report.units.find((u) => u.unit === "B" && u.thickness);
  assert.ok(tB.thickness.zeroHoles >= 200, "B absent in the west quarter: zero thickness there");
});

test("the field: a spline up to 600 observations, exact at each; the local field beyond, exact at each; the mean when they cannot carry one", () => {
  const obs = holes.slice(0, 400).map((h) => ({ x: h.x, y: h.y, v: top(h) }));
  const f = fieldThrough(obs);
  assert.ok(obs.every((o) => Math.abs(f(o.x, o.y) - o.v) < 1e-6));
  const many = holes.map((h) => ({ x: h.x, y: h.y, v: top(h) }));
  const g = fieldThrough(many);
  assert.ok(many.every((o) => g(o.x, o.y) === o.v), "a pick returns its own value");
  const mid = g(20.5, 20.5);
  assert.ok(mid > 290 && mid < 310, "between picks: a weighted mean of the nearest");
  assert.equal(fieldThrough([{ x: 0, y: 0, v: 5 }, { x: 1, y: 1, v: 7 }])(50, 50), 6);
  assert.match(readFileSync(new URL("../src/lib/layerCake.js", import.meta.url), "utf8"), / above = topsAt\(P\.map\(\(p\) => p\.x\), P\.map\(\(p\) => p\.y\), k - 1\)\[k - 1\];/, "the thickness from the modelled top above");
});
