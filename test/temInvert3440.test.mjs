// TASKS.csv #3440 step 3 — TEM line data's 1D inversion, the pane's side: the time-zero and unit guesses with their reasons, the presets, the
// job request (gates shifted to the end of the turn-off, the unit to pV, every Nth station, relative uncertainties, heights), the finished
// stations gathered from the progress events, and the engine's layer thicknesses
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTemText } from "../src/lib/temLines.js";
import { WAVEFORM_PRESETS, waveformFrom, timeZeroGuess, unitGuess, heightColumn, buildTemRequest, mergePartials, partialResult, layerThicknesses } from "../src/lib/temInvert.js";
import { channelMatrix, noiseGroupFor } from "../src/lib/temLines.js";

// a SYNTHETIC CSV in the USGS layout (SI decays, absolute STD, gate times as columns from the start of the ramp-down, an altitude column)
const HM = [0.05, 0.08, 0.12, 0.2, 0.35, 0.6, 1.0];
const head = ["LINE_NO", "E_UTM12N", "N_UTM12N", "Ytopbathv2", "TX_ALTITUDE", ...HM.map((_, i) => `HM_Time[${i}]`), ...HM.map((_, i) => `HM_Data[${i}]`), ...HM.map((_, i) => `HM_DataSTD[${i}]`)];
const rows = [];
for (let l = 0; l < 2; l++) for (let i = 0; i < 10; i++) {
  const v = HM.map((t) => 2e-9 * Math.exp(-t / 0.4));
  rows.push([100 + l, 540000 + i * 30, 4930000 + l * 200, 2400 + i, 30 + i, ...HM.map((t) => t / 1000), ...v, ...v.map((x) => 0.05 * x)].join(","));
}
const data = readTemText([head.join(","), ...rows].join("\n"), "SYNTHETIC_usgs_layout.csv");
const hm = data.groups[0];

test("#3440 the guesses: gate times as columns start at the ramp-down; SI or pV from the earliest gate; the height column", () => {
  const tz = timeZeroGuess(data, hm);
  assert.equal(tz.zero, "rampStart"); assert.match(tz.reason, /start of the ramp-down/);
  assert.equal(timeZeroGuess({ groups: [hm], source: "Geosoft .xyz" }, hm).zero, "rampEnd");
  assert.equal(timeZeroGuess({ groups: [hm], source: "Aarhus Workbench / SkyTEM .xyz" }, hm).zero, "rampStart");
  const u = unitGuess(channelMatrix(data, hm));
  assert.equal(u.unit, "SI"); assert.ok(u.early < 1e-8); assert.match(u.reason, /\{v\}/);
  assert.equal(unitGuess({ m: 2, n: 3, v: [800, 40, 900, 50, 700, 30] }).unit, "pV");
  assert.equal(heightColumn(["ALT", "TX_ALTITUDE", "INVALT"]), "TX_ALTITUDE"); assert.equal(heightColumn(["X", "Y"]), null);
  assert.equal(data.zCol, "Ytopbathv2"); // the ground elevation, for the models in 3D
});

test("#3440 the presets and waveforms: approximate labels, a ramp-off ending at t = 0", () => {
  for (const [k, p] of Object.entries(WAVEFORM_PRESETS)) if (k !== "step") assert.match(p.label, /approximate/);
  assert.equal(waveformFrom(null, 0), null);
  const w = waveformFrom(4, 40);
  assert.deepEqual(w[w.length - 1], [0, 0]); assert.ok(Math.abs(w[2][0] + 40e-6) < 1e-12); assert.equal(w[2][1], 1);
  assert.ok(w.every((p, i) => !i || p[0] > w[i - 1][0]));
});

test("#3440 the request: gates shifted by the ramp, SI to pV, every Nth station, relative uncertainties, heights", () => {
  const nm = channelMatrix(data, noiseGroupFor(data.groups, hm));
  const b = buildTemRequest(data, { moments: [{ group: hm, times: data.gateTimes(hm), waveform: waveformFrom(4, 40), rampUs: 40 }], timeZero: "rampStart", unit: "SI", every: 2, heightsCol: "TX_ALTITUDE",
    noise: { use: true, kind: "absolute", mats: [nm] }, system: { geom: "vmd", r: 13, h: 30 }, layers: { n: 20, first: 3, bottom: 300 } });
  const r = b.request;
  assert.deepEqual(r.moments[0].gates.map((g) => +(g * 1000).toFixed(6)), HM.map((t) => +(t - 0.04).toFixed(6))); // 40 us earlier
  assert.equal(b.dropped, 0);
  assert.equal(b.pick.length, 10); assert.deepEqual(b.pick.slice(0, 3), [0, 2, 4]); // every 2nd station of each line
  assert.ok(Math.abs(r.data[0][0] - 2e-9 * Math.exp(-0.05 / 0.4) * 1e12) < 1e-3); // pV
  assert.ok(r.std[0].every((s) => Math.abs(s - 0.05) < 1e-9)); // absolute STD over the reading: relative
  assert.deepEqual(r.heights.slice(0, 3), [30, 32, 34]); assert.deepEqual(r.line.slice(0, 2), ["100", "100"]);
  // a ramp longer than the first gate: those gates are left out
  const late = buildTemRequest(data, { moments: [{ group: hm, times: data.gateTimes(hm), waveform: null, rampUs: 100 }], timeZero: "rampStart", unit: "pV", system: { geom: "vmd", r: 13, h: 30 }, layers: {} });
  assert.equal(late.dropped, 2); assert.equal(late.request.moments[0].gates.length, 5); assert.equal(late.request.data[0].length, 5);
  assert.equal(late.request.std, undefined); assert.equal(late.request.heights, undefined);
});

test("#3440 the finished stations from the progress events: each batch once, a later pass replacing an earlier one, a partial result", () => {
  let s = mergePartials(null, [{ idx: [0, 1], condMs: [[1, 2], [3, 4]], chi: [1, 1.1], doi: [50, 60], pred: [[9], [8]], pass: 0 }]);
  s = mergePartials(s, [{ idx: [0, 1], condMs: [[1, 2], [3, 4]], chi: [1, 1.1], doi: [50, 60], pred: [[9], [8]], pass: 0 }, { idx: [3], condMs: [[5, 6]], chi: [0.9], doi: [40], pred: [[7]], pass: 0 }]);
  assert.equal(s.condMs.size, 3);
  s = mergePartials(s, [{ idx: [1], condMs: [[30, 40]], chi: [0.8], doi: [61], pred: [[6]], pass: 1 }]);
  s = mergePartials(s, [{ idx: [1], condMs: [[3, 4]], chi: [1.1], doi: [60], pred: [[8]], pass: 0 }]); // a late copy of pass 0 does not undo pass 1
  assert.deepEqual(s.condMs.get(1), [30, 40]);
  const r = partialResult(s, 5, [10]);
  assert.equal(r.partial, true); assert.equal(r.finished, 3); assert.equal(r.condMs[2], null); assert.deepEqual(r.condMs[3], [5, 6]);
});

test("#3440 the layer thicknesses are the engine's (em1d.layer_thicknesses: 20 layers from 3 m to 300 m)", () => {
  const t = layerThicknesses(20, 3, 300);
  assert.equal(t.length, 19); assert.ok(Math.abs(t[1] - 3.483777) < 1e-5 && Math.abs(t[18] - 44.243132) < 1e-4);
  assert.ok(Math.abs(t.reduce((a, b) => a + b, 0) - 300) < 1e-6);
  assert.deepEqual(layerThicknesses(5, 30, 100), [25, 25, 25, 25]);
});

test("#3440 the pane runs the job with Cancel keeping the finished stations, and the panel shows for decays only", () => {
  const p = readFileSync(new URL("../src/components/TemInvertPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const res = await runTem1dJob\(b\.request, \{ signal: abort\.signal, onProgress:/);
  assert.match(p, /if \(ev\.partials\) gathered = mergePartials\(gathered, ev\.partials\);/);
  assert.match(p, /if \(res\.cancelled && gathered && gathered\.condMs\.size\) \{/);
  // the progress in the app's words, from the engine's counts (its message is English), and a word for the slow first batch
  assert.match(p, /setBusy\(\{ text: progressText\(ev\), eta: ev\.etaS,/);
  assert.match(p, /if \(ev\.iter === 0\) return tr\("Inverting the first stations: the first batch also prepares the engine, so it takes longer\."\);/);
  assert.match(p, /updateGeophysSurvey\(name, \{ method: "tem1d_cond", units: SURVEY_METHODS\.tem1d_cond\.units \}\)/);
  const t = readFileSync(new URL("../src/components/TemPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(t, /\{\(isJoin \|\| group\.role === "data" \|\| \(!group\.role && !group\.aux\)\) && \(/);
  const d = readFileSync(new URL("../src/lib/desktop.js", import.meta.url), "utf8");
  assert.match(d, /export const runTem1dJob = \(request, opts\) => runSidecarJobKind\("tem1d", request, opts\);/);
});
