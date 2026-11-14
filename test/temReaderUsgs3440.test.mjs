// TASKS.csv #3440 — the TEM reader on the layout of the first real TEM file read (USGS Yellowstone 2016 SkyTEM, doi:10.5066/P9LVAU7W, an
// Aarhus-processed CSV): its X / Y are E_UTM12N / N_UTM12N (TILT_X / TILT_Y were taken), its decays LM_Data / HM_Data are offered before the
// model columns (RHO_I was), their gate times are columns (LM_Time), -9999 is no data, and LM_DataSTD is LM_Data's uncertainty in its own
// unit. The rows here are SYNTHETIC, in that layout: the real file is not in the repository.
import test from "node:test";
import assert from "node:assert/strict";
import { readTemText, channelMatrix, noiseGroupFor, stdKindGuess, isNoData, decayTau } from "../src/lib/temLines.js";

const LM = [0.01, 0.02, 0.04, 0.07, 0.11, 0.17], HM = [0.38, 0.52, 0.79, 1.23, 2.11, 3.86, 7.14];
const head = ["Block", "LINE_NO", "E_UTM12N", "N_UTM12N", "Ytopbathv2", "TILT_X", "TILT_Y", ...[0, 1, 2, 3].map((i) => `RHO_I[${i}]`), ...[0, 1, 2].map((i) => `THK[${i}]`),
  ...LM.map((_, i) => `LM_Time[${i}]`), ...LM.map((_, i) => `LM_Data[${i}]`), ...LM.map((_, i) => `LM_DataSTD[${i}]`), ...LM.map((_, i) => `FWD_LM_Data_dBdt[${i}]`),
  ...HM.map((_, i) => `HM_Time[${i}]`), ...HM.map((_, i) => `HM_Data[${i}]`), ...HM.map((_, i) => `HM_DataSTD[${i}]`)];
const tau = 0.9, v = (t) => 5000 * Math.exp(-t / tau);
const rows = [];
for (let i = 0; i < 6; i++) {
  const noLm = i === 0; // the real file's first station has no low-moment data (-9999 / -10000)
  rows.push(["MudPot", 100101, 540000 + i * 30, 4930000, 2400, 271.5, 0.4, 20, 50, 100, 300, 5, 10, 20,
    ...LM.map((t) => (noLm ? -9999 : t / 1000)), ...LM.map((t) => (noLm ? -10000 : v(t))), ...LM.map((t) => (noLm ? -9999 : 0.04 * v(t) + 2)), ...LM.map(() => -9999),
    ...HM.map((t) => t / 1000), ...HM.map((t) => v(t)), ...HM.map((t) => 0.05 * v(t) + 0.5)].join(","));
}
const csv = [head.join(","), ...rows].join("\n");

test("#3440 the USGS layout: map-grid X / Y, the decays first, their gate times from the time columns, -9999 as no data", () => {
  const d = readTemText(csv, "SYNTHETIC_usgs_layout.csv");
  assert.equal(d.xCol, "E_UTM12N"); assert.equal(d.yCol, "N_UTM12N");
  assert.deepEqual(d.groups.slice(0, 2).map((g) => [g.prefix, g.role]), [["HM_Data", "data"], ["LM_Data", "data"]]);
  assert.deepEqual(Object.fromEntries(d.groups.map((g) => [g.prefix, g.role])), { HM_Data: "data", LM_Data: "data", HM_DataSTD: "aux", LM_DataSTD: "aux", HM_Time: "time", LM_Time: "time", RHO_I: "model", FWD_LM_Data_dBdt: "model" });
  const hm = d.groups[0], lm = d.groups[1];
  assert.deepEqual(d.gateTimes(hm), HM); assert.deepEqual(d.gateTimes(lm), LM); // LM: the first station is -9999, the next one gives them
  const m = channelMatrix(d, lm);
  assert.ok(Array.from(m.v.subarray(0, 6)).every(Number.isNaN)); // -10000 at the first station
  assert.ok(Math.abs(decayTau(d.gateTimes(hm), Array.from(channelMatrix(d, hm).v.subarray(0, 7))).tau - tau) < 1e-6);
  assert.equal(noiseGroupFor(d.groups, lm).prefix, "LM_DataSTD"); assert.equal(noiseGroupFor(d.groups, hm).prefix, "HM_DataSTD");
});

test("#3440 the uncertainty columns' unit is guessed from their values; no-data values", () => {
  const d = readTemText(csv, "x");
  const n = channelMatrix(d, noiseGroupFor(d.groups, d.groups[0]));
  assert.equal(stdKindGuess(n), "absolute"); // values over 1.5
  assert.equal(stdKindGuess([0.03, 0.05, 0.2, NaN]), "relative");
  // the real USGS export: SI, every STD under 1, falling with the decay (8e-9 early to 6e-12 late at one station): absolute
  const si = { m: 6, n: 2, v: [8e-9, 2e-9, 4e-10, 7e-11, 2e-11, 6e-12, 5e-9, 1e-9, 3e-10, 5e-11, 1e-11, 4e-12] };
  assert.equal(stdKindGuess(si), "absolute");
  // relative fractions stay near a few per cent at every gate
  assert.equal(stdKindGuess({ m: 6, n: 2, v: [0.03, 0.03, 0.04, 0.05, 0.08, 0.12, 0.03, 0.03, 0.04, 0.06, 0.09, 0.15] }), "relative");
  for (const x of [-9999, -99999, -10000, 1e31]) assert.ok(isNoData(x), String(x));
  for (const x of [0, -1, 9998, 1e20]) assert.ok(!isNoData(x), String(x));
});
