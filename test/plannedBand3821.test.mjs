// TASKS.csv #3821 (Scottie Gold review) — '45 m in the 3–12.7 band of "Au estimate (...)"' for a hole 2 m inside the 3 g/t shell: no unit, no word on how the blocks were informed,
// and a hole that missed the band printed no line at all. Synthetic estimate blocks.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { targetBandIndex, targetBandText, planChecks } from "../src/lib/plannedHoleChecks.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a 5 m block estimate of gold (ppm: shown as g/t), a column of blocks at 3-12.7 under x 0..5, y 0..5, z -100..0; the lower 20 m extrapolated, one block informed by one hole
const cells = [];
for (let k = 0; k < 20; k++) cells.push({ x: 2.5, y: 2.5, z: -2.5 - k * 5, dx: 5, dy: 5, dz: 5, value: k < 10 ? 8 : 4, ...(k >= 16 ? { support: "extrapolated" } : {}), ...(k === 3 ? { nHoles: 1 } : {}) });
for (let k = 0; k < 20; k++) cells.push({ x: 102.5, y: 2.5, z: -2.5 - k * 5, dx: 5, dy: 5, dz: 5, value: 0.2 }); // a column that is not in the band
const model = { id: "m1", name: "Au estimate (idw2, 5m, r186m, 3.4:1.8:1, in Au > 0.3 g/t shell ...)", cells, threshold: 3, rangeMax: 12.7, min: 0.2, max: 12.7, params: { element: "Au", unit: "ppm", tool: "idw2" } };

test("the band names its element and unit: 'Au 3–12.7 g/t', gold in ppm read as g/t; a model with a property keeps its words", () => {
  assert.equal(targetBandText(model), "Au 3–12.7 g/t");
  assert.equal(targetBandText({ property: "Chargeability (mV/V)", threshold: 10, rangeMax: 23.1 }), "chargeability 10–23.1 mV/V");
});

test("every band gets its line, 0 m included; an estimate says the metres rest on blocks, how many on one hole and extrapolated", () => {
  const t = targetBandIndex(model);
  assert.equal(t.estimate, true);
  const vertical = (x, y) => ({ id: "P", name: "P", x, y, z: 0, azimuth: 0, dip: -90, length: 100 });
  const trace = (h) => { const pts = []; for (let md = 0; md <= h.length; md += 1) pts.push({ md, x: h.x, y: h.y, z: h.z - md }); return pts; };
  const [hit, miss] = planChecks([vertical(2.5, 2.5), vertical(52.5, 2.5)], [], [t], (h) => trace(h));
  assert.equal(hit.targetHits.length, 1);
  assert.ok(Math.abs(hit.targetHits[0].metres - 100) < 1.5, `${hit.targetHits[0].metres}`);
  assert.ok(Math.abs(hit.targetHits[0].extrapM - 20) < 1.5, "the last 20 m: extrapolated blocks");
  assert.ok(Math.abs(hit.targetHits[0].oneHoleM - 5) < 1.5, "one block of one hole");
  assert.equal(miss.targetHits.length, 1, "a hole that misses the band still prints its line");
  assert.equal(miss.targetHits[0].metres, 0);
});

test("wiring: the line says it is blocks of an estimate and what they rest on", () => {
  const p = read("../src/components/PlannedHoleParts.jsx");
  assert.match(p, /\(blocks of an estimate, not an intercept: \{a\} m in blocks informed by one hole, \{b\} m extrapolated\)/);
  assert.match(p, /\(blocks of an estimate, not an intercept\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${l}.json`))["(blocks of an estimate, not an intercept)"], l);
});
