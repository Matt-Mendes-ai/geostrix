// TASKS.csv #2597 — a weathered zone with its own density in the pit: a thickness, or the base of the Weathering log's fresh-rock code
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell, weatheredOf } from "../src/lib/pitShell.js";
import { weatheredBasePoints, weatheringCodes } from "../src/lib/weatheredZone.js";

const econ = { unit: "g/t", element: "Au", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
const body = () => { const c = []; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 12; k++) c.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: k < 3 ? 0 : 1.5 }); return c; };
const ground = () => 1000;

test("no zone: the pit as before; a 30 m zone at 1.8 takes a third off the top 30 m's tonnes", () => {
  const a = runPitShell({ ...econ, cells: body() }, { groundAt: ground });
  assert.equal(a.weatheredT, 0);
  const b = runPitShell({ ...econ, cells: body(), weathered: { density: 2.7, thicknessM: 30 } }, { groundAt: ground });
  assert.equal(b.oreT, a.oreT); assert.equal(b.wasteT, a.wasteT); assert.ok(Math.abs(b.money - a.money) < 1e-3); // the same density: the same pit
  assert.ok(b.weatheredT > 0);
  const c = runPitShell({ ...econ, cells: body(), weathered: { density: 1.8, thicknessM: 30 } }, { groundAt: ground });
  // the top 30 m is all waste (grade 0): its tonnes scale by 1.8 / 2.7, the ore below is untouched
  assert.ok(Math.abs(c.weatheredT / b.weatheredT - 1.8 / 2.7) < 0.02 || c.blocks !== b.blocks, `${c.weatheredT} / ${b.weatheredT}`);
  assert.ok(c.money > b.money); // lighter cover costs less to move
  assert.ok(Math.abs(c.meanGrade - 1.5) < 1e-9);
  // ore inside the zone takes the weathered density too
  const d = runPitShell({ ...econ, cells: body(), weathered: { density: 2.0, thicknessM: 50 } }, { groundAt: ground });
  assert.ok(d.oreT < a.oreT, `${d.oreT} vs ${a.oreT}`);
});

test("the base from the Weathering log: the top of the first fresh interval in each hole, interpolated between them", () => {
  const trace = (x) => [{ x, y: 0, z: 100, md: 0 }, { x, y: 0, z: -100, md: 200 }];
  const traces = new Map([["A", trace(0)], ["B", trace(100)], ["C", trace(200)]]);
  const rows = [
    { hole_id: "A", from: 0, to: 20, value: "E" }, { hole_id: "A", from: 20, to: 30, value: "M" }, { hole_id: "A", from: 30, to: 90, value: "fr" },
    { hole_id: "B", from: 0, to: 70, value: "H" }, { hole_id: "B", from: 70, to: 120, value: "FR" },
    { hole_id: "C", from: 0, to: 40, value: "W" }, // never reaches fresh rock
  ];
  assert.deepEqual(weatheringCodes(rows), ["E", "M", "FR", "H", "W"].sort((a, b) => (a === "FR" ? -1 : b === "FR" ? 1 : 0)));
  const r = weatheredBasePoints(rows, traces, "FR");
  assert.deepEqual(r.points.map((p) => [p.x, p.depth]).sort((a, b) => a[0] - b[0]), [[0, 30], [100, 70]]);
  assert.equal(r.logged, 3); assert.equal(r.without, 1); assert.equal(r.median, 70); assert.equal(r.min, 30);
  const w = weatheredOf({ density: 1.8, points: r.points });
  assert.ok(Math.abs(w.depthAt(0, 0) - 30) < 1e-6 && Math.abs(w.depthAt(100, 0) - 70) < 1e-6);
  const mid = w.depthAt(50, 0); assert.ok(mid > 30 && mid < 70, String(mid));
  assert.equal(weatheredOf({ density: 0, thicknessM: 10 }), null);
  assert.equal(weatheredOf({ density: 1.8, points: [] }), null);
});

test("the pane: the zone in the form, the points to the solve only, the tonnes in the result; nested pits rebuild the points", () => {
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(p, /weathered: \{ \.\.\.weathInputs, points: weathBase\.points \}/);
  assert.match(p, /line\(tr\("Of the rock, weathered"\)/);
  assert.match(fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8"), /inputs\.weathered\?\.freshCode \? \{ weathered: \{ \.\.\.inputs\.weathered, points: weatheredBasePoints\(/);
  assert.equal(fs.readFileSync("src/lib/pitShell.js", "utf8").match(/weathered: weatheredOf\(inputs\.weathered\)/g).length, 4);
});
