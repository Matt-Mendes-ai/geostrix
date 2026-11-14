// TASKS.csv #3485 / #3488 — the TEM inversion's system from a survey report, the pane's side: a waveform table (time, current from the
// start of the ramp-down), the receiver's filters, the receiver's height column, and the request's gate-time shift (raw to calibrated),
// front gate, gate widths and base frequency. SYNTHETIC data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readTemText, channelMatrix } from "../src/lib/temLines.js";
import { parseWaveformTable, parseFilters, rxColumn, buildTemRequest } from "../src/lib/temInvert.js";

test("#3485 a waveform table: headings skipped, the current normalized to its peak, the end moved to t = 0, the ramp-off kept", () => {
  const txt = "Time [s]  Normalized current\n-8.0e-4 0\n-7.0e-4 2.0\n0 4.0\n1.0e-5 1.0\n1.5e-5 -0.08\n2.0e-5 0.0000E+000\n";
  const w = parseWaveformTable(txt);
  assert.equal(w.n, 6); assert.equal(w.rampUs, 20);
  assert.deepEqual(w.waveform[w.waveform.length - 1], [0, 0]);
  assert.ok(Math.abs(w.waveform[0][0] + 8.2e-4) < 1e-12); assert.equal(w.waveform[2][1], 1); assert.equal(w.waveform[1][1], 0.5);
  assert.ok(Math.abs(w.waveform[4][1] + 0.02) < 1e-12); // the undershoot stays
  assert.match(parseWaveformTable("0 1\n1e-5 0").error, /at least 3 lines/);
  assert.match(parseWaveformTable("0 0\n2e-5 1\n1e-5 0").error, /increasing/);
  assert.match(parseWaveformTable("-1e-3 0\n0 1\n2e-5 0.5").error, /current off/);
  assert.match(parseWaveformTable("-800 0\n0 1\n18 0").error, /seconds/);
});

test("#3485 the receiver's filters (kHz) and its height column", () => {
  assert.deepEqual(parseFilters("210, 300"), [210000, 300000]); assert.deepEqual(parseFilters(""), []);
  assert.equal(parseFilters("210 300 450 600"), null); assert.equal(parseFilters("abc"), null);
  assert.equal(rxColumn(["TX_ALTITUDE", "RX_ALTITUDE"]), "RX_ALTITUDE"); assert.equal(rxColumn(["ALT"]), null);
});

// a SYNTHETIC CSV in the USGS layout with a receiver height column
const G = [0.0147, 0.0182, 0.0227, 0.0352, 0.07, 0.14]; // ms, "raw" times
const head = ["LINE_NO", "E_UTM12N", "N_UTM12N", "TX_ALTITUDE", "RX_ALTITUDE", ...G.map((_, i) => `LM_Time[${i}]`), ...G.map((_, i) => `LM_Data[${i}]`)];
const rows = [];
for (let i = 0; i < 4; i++) rows.push([100, 540000 + i * 30, 4930000, 30 + i, 31.5 + i, ...G.map((t) => t / 1000), ...G.map((t) => 1e-9 * Math.exp(-t / 0.05))].join(","));
const data = readTemText([head.join(","), ...rows].join("\n"), "SYNTHETIC_rx.csv");
const lm = data.groups[0];

test("#3485 the request: the shift (raw to calibrated), the front gate, gates inside the turn-off, widths, base frequency, the receiver's height", () => {
  const wf = parseWaveformTable("-8e-4 0\n-7.9e-4 1\n0 1\n1.8e-5 0");
  const mo = { group: lm, times: data.gateTimes(lm), waveform: wf.waveform, rampUs: wf.rampUs, shiftUs: -2.15, frontUs: 12, baseFreq: 210, widthsUs: [2.57, 3.57, 4.57, 7.57, 15.6, 30.6] };
  const b = buildTemRequest(data, { moments: [mo], timeZero: "rampStart", unit: "SI", heightsCol: "TX_ALTITUDE", rxCol: "RX_ALTITUDE",
    system: { geom: "cloop", a: 10.36, r: 12.83, h: 30, rz: 0, filters: [210e3, 300e3] }, layers: {} });
  const m = b.request.moments[0];
  // calibrated = raw - 2.15 us; the gates measured from the ramp-down's start, less the 18 us turn-off: the first two inside it (negative)
  assert.deepEqual(m.gates.map((g) => +(g * 1e6).toFixed(3)), G.map((t) => +(t * 1000 - 2.15 - 18).toFixed(3)));
  assert.ok(m.gates[0] < 0 && m.gates[0] > wf.waveform[0][0]);
  assert.equal(b.dropped, 0); assert.equal(m.baseFreq, 210); assert.deepEqual(m.widths.map((w) => +(w * 1e6).toFixed(2)), [2.57, 3.57, 4.57, 7.57, 15.6, 30.6]);
  assert.deepEqual(b.request.rz, [1.5, 1.5, 1.5, 1.5]);
  // a front gate at 20 us (calibrated) leaves out the first two; blank keeps only those after the end of the turn-off (as before)
  assert.equal(buildTemRequest(data, { moments: [{ ...mo, frontUs: 20 }], timeZero: "rampStart", unit: "SI", system: {}, layers: {} }).dropped, 2);
  assert.equal(buildTemRequest(data, { moments: [{ ...mo, frontUs: "" }], timeZero: "rampStart", unit: "SI", system: {}, layers: {} }).dropped, 2);
  // widths that do not match the gates are not sent, and said
  const bw = buildTemRequest(data, { moments: [{ ...mo, widthsUs: [1, 2] }], timeZero: "rampStart", unit: "SI", system: {}, layers: {} });
  assert.equal(bw.request.moments[0].widths, undefined); assert.deepEqual(bw.widthsMismatch, [lm.prefix]);
  assert.equal(channelMatrix(data, lm).n, 4);
});

test("#3485 the pane offers the report's system: the loop of the frame's area, the receiver's height and filters, the table, the report's fields", () => {
  const p = readFileSync(new URL("../src/components/TemInvertPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /\{ geom: "cloop", a: Math\.sqrt\(\(Number\(st\.area\) \|\| 314\) \/ Math\.PI\) \}/);
  assert.match(p, /rz: Number\(st\.rz\) \|\| 0, filters: filters \|\| \[\]/);
  assert.match(p, /baseFreq: st\.wave\[k\]\.baseFreq, shiftUs: st\.wave\[k\]\.shiftUs, frontUs: st\.wave\[k\]\.frontUs,/);
  assert.match(p, /if \(sysErr\) \{ setMsg\(\{ text: tr\(sysErr\) \}\); return; \}/);
});
