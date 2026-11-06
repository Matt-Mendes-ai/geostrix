// TASKS.csv #1420 — a directional variogram reported a 215.9 m range on a 144 m lag axis, said 'read only out to 0 m' when the first
// bin was empty and the next held 39 pairs, and printed the cap as 2.7857037499998807
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { experimentalVariogram, fitVariogramModel } from "../src/lib/variogram.js";

// two lines of samples 20 m apart (east), 5 m along each (north): no pairs closer than 20 m east-west
const pts = [];
for (let k = 0; k < 2; k++) for (let i = 0; i < 40; i++) pts.push({ x: k * 20, y: i * 5, z: 0, value: Math.sin(i / 3) + k });

test("the reliable-lag run starts at the first bin that has pairs", () => {
  const vg = experimentalVariogram(pts, { lagDistance: 10, nLags: 4, direction: { azimuth: 90, dip: 0, angleTol: 10 } });
  assert.equal(vg.bins[0].nPairs, 0); // nothing 0-15 m east-west
  assert.ok(vg.bins[1].nPairs >= 30, String(vg.bins[1].nPairs));
  assert.equal(vg.maxReliableLag, vg.bins[1].lag);
});

test("a fitted range past the furthest lag is flagged, one inside is not", () => {
  // still rising at the last lag: the best range lies beyond the data
  const rising = [10, 20, 30, 40, 50].map((h, i) => ({ h, lag: h, gamma: 0.1 + i * 0.2, nPairs: 100 }));
  const f = fitVariogramModel(rising);
  assert.equal(f.maxLag, 50);
  assert.equal(f.beyondData, f.range > 50);
  assert.equal(f.beyondData, true);
  // flattening by 30 m: measured
  const flat = [10, 20, 30, 40, 50].map((h) => ({ h, lag: h, gamma: Math.min(1, h / 30), nPairs: 100 }));
  assert.equal(fitVariogramModel(flat).beyondData, false);
});

test("the panel says so, and rounds the cap", () => {
  const s = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(s, /result\.fit\.beyondData \? tr\("\{v\} m: past the furthest lag \(\{max\} m\), not measured"/);
  assert.match(s, /capValue: \+Number\(result\.capValue\)\.toPrecision\(4\)/);
});
