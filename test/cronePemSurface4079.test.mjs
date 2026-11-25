// TASKS.csv #4079 — Crone SURFACE PEM profiles (<FMT> 210) and .STP step-response files (<FMT> 230) are read as ground EM lines (EM > TEM line data), with their loop and
// each station's own position; the borehole reader no longer calls them "not a hole" without saying where to read them. Synthetic files of the same shape as the real
// ones (the GEUS files are for internal use only: no real coordinates or readings here).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCronePemSurface, parseCronePemSurface, loopSpan } from "../src/lib/cronePem.js";
import { readTemText } from "../src/lib/temLines.js";
import { downholeEmKind, readDownholeEm } from "../src/lib/downholeEm.js";

const j = (...l) => l.join("\r\n") + "\r\n";
// a rectangle of eight loop corners, 100 m east-west and 200 m north-south, around a north-south profile at easting 1000
const LOOP = [[900, 0], [950, 0], [1000, 0], [1050, 0], [1100, 0], [1100, 200], [1000, 200], [900, 200]].map(([x, y], k) => `<L${String(k).padStart(2, "0")}> ${x}.0 ${y}.0 300.0 0 ~ loop coord.`);
function surface({ fmt = 210, units = 0, positions = true, instrument = "S-COIL Metric Crystal-Master 16.66 1500 20 54" } = {}) {
  const f = units === 1 ? 1 / 0.3048 : 1; // feet
  const L = [[900, 0], [950, 0], [1000, 0], [1050, 0], [1100, 0], [1100, 200], [1000, 200], [900, 200]].map(([x, y], k) => `<L${String(k).padStart(2, "0")}> ${(x * f).toFixed(1)} ${(y * f).toFixed(1)} ${(300 * f).toFixed(1)} ${units} ~ loop coord.`);
  const stns = [[100, 100], [50, 50], [0, 0], [-50, -50]]; // station number, northing
  const P = stns.map(([s, n], k) => `<P${String(k).padStart(2, "0")}> ${(1000 * f).toFixed(1)} ${(n * f).toFixed(1)} ${(310 * f).toFixed(1)} ${units} ${(s * f).toFixed(1)} ~ stn`);
  const label = (s) => (s < 0 ? `${-s}S` : `${s}N`);
  const flags = fmt === 230 ? "D4 6878.42 -347.197 -16687.4 18052.8" : "D7 0 0 0 0 0 0 0";
  const rec = (s, c, r, vals) => [`${label(s)} ${c}R${r} 0 A 1960.0 90 512 1 8`, flags, " " + vals.join("  "), ""];
  const tb = fmt === 230 ? ["0.000e+00  0.000e+00  1.0e-04  2.0e-04  4.0e-04  8.0e-04"] : ["-2.000e-04 -1.000e-04  1.0e-04  2.0e-04  4.0e-04  8.0e-04"];
  return j(`<FMT> ${fmt}                       ~ data format`, "<UNI> nanoTesla/sec             ~ data units", "<OPR> Someone               ~ operator's name", "<XYP> 0 0 0 0", "<CUR> 20.0", `<TXS> ${(100 * f).toFixed(1)} ${(200 * f).toFixed(1)} ${units}`,
    "~ Transmitter Loop Co-ordinates:", ...L, "~ Hole/Profile Co-ordinates:", ...(positions ? P : []), "<GEN> Water on grid",
    "Some Company", "Some Property", "1000E", "IQ-1", "July 16, 2013", instrument, "#137 8.12 Dec18,2012 L1000E N 1000 4000 +", "", ...tb, "$",
    ...rec(100, "X", 0, [1000, -100, -50, -20, -10]), ...rec(50, "X", 0, [800, -80, -40, -20, -8]), ...rec(50, "X", 1, [900, -90, -60, -30, -12]), ...rec(0, "X", 0, [600, -60, -30, -10, -5]), ...rec(-50, "X", 0, [400, -40, -20, -8, -4]),
    ...rec(100, "Z", 0, [2000, 200, 100, 40, 20]), ...rec(50, "Z", 0, [1800, 180, 90, 36, 18]), ...rec(0, "Z", 0, [1600, 160, 80, 32, 16]), ...rec(-50, "Z", 0, [1400, 140, 70, 28, 14]));
}

test("what is a surface Crone file: a profile's positions (x y z units stn) or a surface instrument line; a hole's path (segments) is not", () => {
  assert.equal(isCronePemSurface(surface()), true);
  assert.equal(isCronePemSurface(surface({ positions: false })), true, "no positions: the 'S-COIL' instrument line says it");
  assert.equal(isCronePemSurface(surface({ fmt: 230 })), true);
  assert.equal(isCronePemSurface(surface({ positions: false, instrument: "Borehole Metric Crystal-Master 50.00 1000 4 48" })), false);
  const hole = j("<FMT> 210", "<UNI> nanoTesla/sec", "<P00> 100.0 200.0 5.0 0 ~ collar", "<P01> 270.0 60.0 480.0 2 480.0 ~ segment", "Co", "Prop", "H1", "Borehole Metric Crystal-Master 50.00 1000 4 48", "", "1e-3 2e-3", "$");
  assert.equal(isCronePemSurface(hole), false, "units 2 on <P01>: a segment of a hole's path");
  assert.equal(isCronePemSurface("TEM File Created by MAXWELL\nCONFIG:INLOOP\n"), false);
});

test("a surface PEM: stations at their <Pnn> positions, W and S stations negative, repeated readings stacked, Z first, the gate times in ms, the loop", () => {
  const r = parseCronePemSurface(surface(), "1000EAv.pem");
  assert.equal(r.family, "Crone PEM"); assert.equal(r.units, "nT/s"); assert.equal(r.stepResponse, false);
  assert.equal(r.stations.length, 4); assert.deepEqual(r.components, ["Z", "X"]); assert.equal(r.gates.length, 4);
  assert.deepEqual(r.stations.map((s) => s.station), [100, 50, 0, -50]);
  assert.deepEqual(r.stations.map((s) => [s.x, s.y, s.elev]), [[1000, 100, 310], [1000, 50, 310], [1000, 0, 310], [1000, -50, 310]]);
  assert.equal(r.positions, "file");
  assert.deepEqual(r.times, [0.1, 0.2, 0.4, 0.8], "the block's last four values (seconds) in ms; the first two are not gates");
  assert.deepEqual(Array.from(r.stations[1].comps.X), [-85, -50, -25, -10], "two readings of a station, stacked (their mean); the primary field is not a gate");
  assert.equal(r.stations[1].reads.X, 2);
  assert.equal(r.stations[0].line, "1000E");
  assert.equal(r.loop.length, 8); assert.deepEqual(loopSpan(r.loop).map(Math.round), [200, 200]); assert.deepEqual(r.loopSize, [100, 200]);
});

test("feet: the loop and the positions are converted to metres; a file with no <Pnn> places its stations along their line, the loop deciding which way", () => {
  const ft = parseCronePemSurface(surface({ units: 1 }), "f.pem");
  assert.ok(Math.abs(ft.stations[0].x - 1000) < 0.2 && Math.abs(ft.stations[0].y - 100) < 0.2, "feet converted");
  assert.ok(Math.abs(ft.loopSize[0] - 100) < 0.2);
  const np = parseCronePemSurface(surface({ positions: false }), "g.pem");
  assert.equal(np.positions, "line"); assert.equal(np.positionNote.axes[0], "y", "the line 1000E runs north-south: the stations are northings");
  assert.deepEqual(np.stations.map((s) => [s.x, s.y]), [[1000, 100], [1000, 50], [1000, 0], [1000, -50]]);
});

test("a .STP (format 230) is the same survey in the step response: read, said, units nT", () => {
  const r = parseCronePemSurface(surface({ fmt: 230 }), "1000E.STP");
  assert.equal(r.family, "Crone STP"); assert.equal(r.stepResponse, true); assert.equal(r.units, "nT");
  assert.equal(r.stations.length, 4); assert.equal(r.gates.length, 4); assert.deepEqual(r.times, [0.1, 0.2, 0.4, 0.8]);
});

test("EM > TEM line data (readTemText) takes a surface PEM like a Maxwell .tem: one line, Z and X channel sets, gate times, positions, the loop and a note", () => {
  const d = readTemText(surface(), "1000EAv.pem");
  assert.equal(d.source, "Crone PEM (fixed loop)"); assert.equal(d.n, 4);
  assert.deepEqual(d.groups.map((g) => g.prefix), ["Z_CH", "X_CH"]); assert.deepEqual(d.groups.map((g) => g.component), ["Z", "X"]);
  assert.deepEqual(Array.from(d.x), [1000, 1000, 1000, 1000]); assert.deepEqual(Array.from(d.y), [100, 50, 0, -50]);
  assert.deepEqual(d.gateTimes(d.groups[0]), [0.1, 0.2, 0.4, 0.8]);
  assert.equal(d.loop.length, 8); assert.ok(d.notes.some((n) => /^Loop: 8 corners\.$/.test(n)), d.notes.join("|"));
  assert.equal(d.stepResponse, false);
  const s = readTemText(surface({ fmt: 230 }), "1000E.STP");
  assert.equal(s.source, "Crone STP (fixed loop)", "the source says STP; Help says it is a step response"); assert.equal(s.stepResponse, true);
});

test("a hole's PEM / STP is borehole EM: TEM line data says so, the borehole reader reads both formats; the surface profile says where to read it", () => {
  const hole = (fmt) => j(`<FMT> ${fmt}`, "<UNI> nanoTesla/sec", "<XYP> 0 92 5 501", "<CUR> 25.0", "<TXS> 400.0 400.0 0", "<L00> 100.0 200.0 0.0 0 ~ loop", "<L01> 100.0 0.0 0.0 0 ~ loop", "<L02> 300.0 0.0 0.0 0 ~ loop", "<L03> 300.0 200.0 0.0 0 ~ loop",
    "<P00> 200.0 100.0 5.0 0 ~ collar", "<P01> 270.0 60.0 480.0 2 ~ segments", "Some Mine", "Some Prospect", "PEM-010", "PE10", "Jul 16, 2007", "Borehole Metric Crystal-Master 50.00 1000 4 48", "", "-2.000e-04 -1.000e-04  4.800e-05  1.000e-04  2.000e-04  4.000e-04  8.000e-04", "$",
    "10 ZR0 0 A 1396.0 90 512 1 0", fmt === 230 ? "D4 1 2 3 4" : "D7 0 0 0 0 0 0 0", " 3.504e+04  4.211e+04  4.223e+04  4.221e+04  4.201e+04", "");
  assert.throws(() => readTemText(hole(210), "H1.pem"), /is borehole EM \(PEM hole path\): read it with EM › Borehole EM/);
  assert.throws(() => readTemText(hole(230), "H1.stp"), /is borehole EM \(PEM hole path\)/);
  assert.equal(downholeEmKind(hole(210)), "pem"); assert.equal(downholeEmKind(hole(230)), "pem");
  const r = readDownholeEm(hole(230), "H1.stp");
  assert.equal(r.format, "Crone STP"); assert.equal(r.units, "nT"); assert.equal(r.holes.length, 1);
  assert.equal(readDownholeEm(hole(210), "H1.pem").format, "Crone PEM");
  assert.equal(downholeEmKind(surface()), "pem-surface"); assert.equal(downholeEmKind(surface({ fmt: 230 })), "pem-surface");
  assert.throws(() => readDownholeEm(surface(), "S.pem"), /read it with EM › TEM line data/);
});

test("a step-response STP is never given dB/dt arithmetic: no decay constant, no tau map, no 1D inversion, one reason line where their buttons were; the plots stay", async () => {
  const { readFileSync } = await import("node:fs");
  const pane = readFileSync(new URL("../src/components/TemPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(pane, /const stepResp = !!data\?\.stepResponse;/);
  assert.match(pane, /const fit = useMemo\(\(\) => \(!stepResp && times && vals \? decayTau\(/, "no decay constant fitted to a step response");
  assert.match(pane, /\{times && !stepResp && <div style=\{\{ \.\.\.note, marginTop: 3 \}\}>\{fit \?/, "its sentence is not shown");
  assert.match(pane, /\{stepResp \? <div role="note" style=\{\{ \.\.\.note, marginTop: 8 \}\}>\{STEP_REASON\(\)\}<\/div> : <button[^\n]*onClick=\{mapTau\}/, "the tau map button gives way to the reason");
  assert.match(pane, /body: stepResp \? <div role="note" style=\{note\}>\{STEP_REASON\(\)\}<\/div> : \(<>\n\s*<TemInvertPanel/, "the inversion step says why instead of offering the inversion");
  assert.match(pane, /tr\("Step response \(nT\): tau and the 1D inversion need dB\/dt\."\)/);
  assert.match(pane, /<Decay times=\{times\} vals=\{vals\} fit=\{fit\} \/>/, "the decay plot stays");
  assert.match(pane, /<Profiles line=\{line\} mat=\{mat\}/, "the profile plot stays");
  assert.equal(readTemText(surface({ fmt: 230 }), "1000E.STP").stepResponse, true);
  assert.equal(readTemText(surface({ fmt: 210 }), "1000E.pem").stepResponse, false, "a PEM (dB/dt) keeps tau and the inversion");
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"))["Step response (nT): tau and the 1D inversion need dB/dt."], lang);
});

test("the file pickers offer .pem and .stp", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["../src/components/TemPane.jsx", "../src/components/BoreholeEmPane.jsx"]) assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /\.pem,\.stp/, f);
});
