// TASKS.csv #3441 — a two-moment TEM file joined into one decay, each channel's own gate times, and readings in the noise left out of the tau fit
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { readTemText, channelMatrix, joinMatrices, noiseGroupFor, maskNoisy, channelNumber, decayTau, gateTimesFromText } from "../src/lib/temLines.js";

// a SYNTHETIC two-moment SkyTEM-like export: low moment 8 gates 0.01-0.2 ms, high moment 8 gates 0.1-3 ms (written in seconds); both follow exp(-t/0.8)
const LM = [0.01, 0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2], HM = [0.1, 0.2, 0.4, 0.8, 1.2, 1.6, 2.2, 3];
const tau = 0.8, f = (t) => 500 * Math.exp(-t / tau);
function twoMoment({ noisyHm = false } = {}) {
  const cols = ["LINE_NO", "UTMX", "UTMY", ...LM.map((_, k) => `DBDT_CH1GT${k + 1}`), ...HM.map((_, k) => `DBDT_CH2GT${k + 1}`), ...LM.map((_, k) => `DBDT_STD_CH1GT${k + 1}`), ...HM.map((_, k) => `DBDT_STD_CH2GT${k + 1}`)];
  const out = ["/INFO", "/ SYNTHETIC two-moment layout (test data), Aarhus Workbench", "/DUMMY", "/9999", "/GATE TIMES CHANNEL 1", "/ " + LM.map((t) => (t / 1000).toExponential(3)).join(" "),
    "/GATE TIMES CHANNEL 2", "/ " + HM.map((t) => (t / 1000).toExponential(3)).join(" "), "/ " + cols.join(" ")];
  for (let i = 0; i < 6; i++) {
    const lm = LM.map(f), hm = HM.map((t, k) => (noisyHm && k >= 6 ? 1e-9 : f(t)));
    out.push([7, 1000 + i * 10, 2000, ...lm, ...hm, ...LM.map(() => 0.03), ...HM.map((_, k) => (noisyHm && k >= 6 ? 0.9 : 0.03))].join(" "));
  }
  return out.join("\n");
}

test("#3441 each channel group gets its own gate times from the header", () => {
  const d = readTemText(twoMoment(), "SYNTHETIC_2m_dat.xyz");
  const nonAux = d.groups.filter((g) => !g.aux);
  assert.deepEqual(nonAux.map((g) => g.prefix), ["DBDT_CH1GT", "DBDT_CH2GT"]);
  assert.deepEqual(d.gateTimes(nonAux[0]), LM); assert.deepEqual(d.gateTimes(nonAux[1]), HM);
  assert.equal(channelNumber("DBDT_CH2GT"), 2); assert.equal(channelNumber("Z_HM_ch05_"), 5); assert.equal(channelNumber("dBdt_Z"), null);
  // equal-length lists would both match the first key without the channel number
  assert.deepEqual(gateTimesFromText("", 3, { "GATE TIMES CHANNEL 1": "1e-5 2e-5 3e-5", "GATE TIMES CHANNEL 2": "1e-4 2e-4 3e-4" }, 2), [0.1, 0.2, 0.3]);
});

test("#3441 the two moments joined: gates sorted by time, the fit uses both", () => {
  const d = readTemText(twoMoment(), "x");
  const [ga, gb] = d.groups.filter((g) => !g.aux);
  const a = { mat: channelMatrix(d, ga), times: d.gateTimes(ga), cols: ga.cols }, b = { mat: channelMatrix(d, gb), times: d.gateTimes(gb), cols: gb.cols };
  const j = joinMatrices(a, b);
  assert.equal(j.mat.m, 16); assert.equal(j.mat.n, 6);
  assert.ok(j.times.every((t, i) => !i || t >= j.times[i - 1]));
  assert.equal(j.times.filter((t) => t === 0.1).length, 2); // the overlap at 0.1 ms: both moments' readings
  assert.deepEqual(j.from[0], [0, 0]); assert.equal(j.cols[0], "DBDT_CH1GT1"); assert.equal(j.cols[15], "DBDT_CH2GT8");
  const row0 = Array.from(j.mat.v.subarray(0, 16));
  assert.ok(Math.abs(decayTau(j.times, row0).tau - tau) < 1e-9);
  assert.equal(j.mat.v[3 * 16 + 5], f(0.1)); // station 4's 6th gate is the low moment's 0.1 ms
});

test("#3441 the STD group of a data group, and readings in the noise left out", () => {
  const d = readTemText(twoMoment({ noisyHm: true }), "x");
  const hm = d.groups.find((g) => g.prefix === "DBDT_CH2GT"), n = noiseGroupFor(d.groups, hm);
  assert.equal(n.prefix, "DBDT_STD_CH2GT"); assert.equal(noiseGroupFor(d.groups, n), null);
  const v = Array.from(channelMatrix(d, hm).v.subarray(0, 8)), sd = Array.from(channelMatrix(d, n).v.subarray(0, 8));
  // the last two gates are 1e-9 with 90 % uncertainty
  const m = maskNoisy(v, sd, { maxUnc: 0.33 });
  assert.equal(m.dropped, 2); assert.ok(Number.isNaN(m.values[6]) && Number.isNaN(m.values[7]) && Number.isFinite(m.values[5]));
  const noisyTau = decayTau(HM, v).tau, cleanTau = decayTau(HM, m.values).tau;
  assert.ok(Math.abs(cleanTau - tau) < 1e-9, String(cleanTau)); assert.ok(Math.abs(noisyTau - tau) > 0.01, "the noise bends the fit");
  // a floor in data units; absolute STD read against the reading
  assert.equal(maskNoisy(v, null, { floor: 1 }).dropped, 2);
  assert.equal(maskNoisy([100, 100], [10, 80], { maxUnc: 0.33, stdKind: "absolute" }).dropped, 1);
  assert.equal(maskNoisy([100, 100], [0.1, 0.8], { maxUnc: 0.33, stdKind: "relative" }).dropped, 1);
  assert.equal(maskNoisy([100], [0.5], {}).dropped, 0);
});

test("#3441 the pane offers the joined moments and the noise controls", () => {
  const p = readFileSync(new URL("../src/components/TemPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /\{joinable && <option value="join">/);
  assert.match(p, /const isJoin = st\?\.g === "join" && !!joinable;/);
  assert.match(p, /tauAll\(mat, times, noiseOpts \? \{ prepare \} : undefined\)/);
  assert.match(p, /noiseGroupFor\(data\.groups, joinable\.ga\)/);
});
