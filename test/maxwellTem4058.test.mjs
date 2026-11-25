// TASKS.csv #4058 (found by side 2 reading a Queensland open-file ground EM survey) — an ordinary three-component ground TEM (Maxwell .tem: in-loop, slingram,
// moving loop) was refused as 'borehole EM' because it has a COMPONENT column and repeats each station for X, Y and Z. Only borehole evidence refuses now.
// Every file here is made up, with the Maxwell header's shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isMaxwellTem, parseMaxwellTem } from "../src/lib/maxwellTem.js";
import { readTemText, channelMatrix, linesOf, decayTau } from "../src/lib/temLines.js";
import { boreholeEmClues, groundEmConfig } from "../src/lib/boreholeEm.js";
import { tableRefusal } from "../src/lib/tableRefusal.js";
import { parseXYZ } from "../src/lib/geosoft.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NG = 12;
const times = Array.from({ length: NG }, (_, k) => +(0.1 * Math.pow(1.45, k)).toFixed(4));
const pad = (v, w = 13) => String(v).padStart(w);

// one Maxwell-shaped file. opts: config, order of the components, local grid, a moving-loop block, multi-line, missing gates
function maxwell({ config = "INLOOP", order = ["Z", "X", "Y"], east0 = 452000, north = 7544000, nSt = 6, loop = false, multi = false, localGrid = false, slingramNote = false, missingX = false, extraCols = "std" } = {}) {
  const L = [];
  L.push("TEM File Created by MAXWELL");
  L.push(`LINE:${multi ? "MULTI" : "60000"} DATATYPE:TEM CONFIG:${config} BFREQ:2.083 TXAREA:40000.000 LSIDE:200.000 LSIDEACROSS:200.000 OFFTIME:120.0 ONTIME:120.0 DUTYCYCLE:50.000 TURNON:0.000 &`);
  L.push("TURNOFF:0.400 RXAREAZ:-1.000 RXAREAX:-1.000 RXAREAY:-1.000 TXTURNS:1.000 BFIELD:YES RXDIPOLE:YES TXDIPOLE:NO TIMINGMARK:120.0 PROJECT: &");
  L.push("PROSPECT:Xx CLIENT: TENEMENT:Unknown_Tenement DATE: RECEIVER:SMARTem24 RXSENSOR: ATLANTISPROBENO: TRANSMITTER:Zonge COMMENT1: &");
  if (loop) { L.push("COMMENT2: GPS_ZONE:54 GPS_SYS:UTM_(WGS84) &"); L.push("LOOP:Moving_Loop &"); L.push("LV1X:0.00 LV1Y:0.00 LV1Z:0.00 &"); L.push("LV2X:0.00 LV2Y:100.00 LV2Z:0.00 &"); L.push("LV3X:100.00 LV3Y:100.00 LV3Z:0.00 &"); L.push("LV4X:100.00 LV4Y:0.00 LV4Z:0.00"); } else L.push("COMMENT2:");
  if (slingramNote) L.push("/Receiver sensor located 200m east of transmitter loop centre with station location already corrected");
  L.push("/TIMES(ms)=" + times.join(","));
  L.push("/TIMESWIDTH(ms)=" + times.map((t) => (t * 0.25).toFixed(4)).join(","));
  const cols = ["EAST", "NORTH", "LEVEL", "ELEV", "STATION", "COMPONENT", "UNITS", "NORMTXAREA", "CURRENT", "GAIN", "NSTACKS", "NOISE", ...times.map((_, k) => `CH${k + 1}`)];
  L.push(cols.map((c) => pad(c)).join(" "));
  const block = (e0, nth) => {
    for (let s = 0; s < nSt; s++) {
      const e = e0 + s * 100;
      order.forEach((c, ci) => {
        const amp = c === "Z" ? 4000 : c === "X" ? 600 : 300;
        const gates = times.map((t, k) => (missingX && c === "X" && s === 2 ? "*" : (amp * (1 + s * 0.05) * Math.exp(-t / 3.2) * (ci ? -1 : 1)).toFixed(2)));
        L.push([pad(e.toFixed(3), 13), pad(nth.toFixed(3), 13), pad("0.000"), pad("0.000"), pad(localGrid || extraCols === "chain" ? (10000 + s * 100).toFixed(3) : e.toFixed(3)), pad(c, 13), pad("pT/A"), pad("NO"), pad("42.000"), pad("1.000"), pad("256.000"), pad("3.66e+00"), ...gates.map((g) => pad(g, 14))].join(" "));
      });
    }
  };
  if (multi) { L.push("LINE:100"); block(east0, north); L.push("/ TEM File Created by MAXWELL"); L.push("/" + cols.map((c) => pad(c)).join(" ")); L.push("LINE:200"); block(east0, north + 100); } else block(east0, north);
  return L.join("\r\n") + "\r\n";
}

test("a Maxwell .tem is recognised, with its times, components and missing gates", () => {
  const t = maxwell({ missingX: true });
  assert.equal(isMaxwellTem(t), true);
  assert.equal(isMaxwellTem("X Y Z\n1 2 3\n"), false);
  const m = parseMaxwellTem(t);
  assert.equal(m.config, "INLOOP"); assert.equal(m.gates.length, NG); assert.deepEqual(m.times, times);
  assert.deepEqual(m.components, ["Z", "X", "Y"]); assert.equal(m.stations.length, 6); assert.equal(m.units, "pT/A");
  assert.ok(Number.isNaN(m.stations[2].comps.X[0]), "'*' is a missing gate");
  assert.ok(m.stations[2].comps.Z[0] > 0);
  assert.deepEqual(parseMaxwellTem(maxwell({ order: ["X", "Y", "Z"] })).components, ["Z", "X", "Y"], "Z first however the file orders them");
});

test("ground in-loop: read as a line survey, Z first, X and Y kept, the decay and tau work", () => {
  const d = readTemText(maxwell(), "OSB000_BField_groundem_mga54.tem");
  assert.equal(d.n, 6); assert.match(d.source, /^Maxwell \.tem \(inloop\)$/);
  assert.deepEqual(d.groups.map((g) => g.component), ["Z", "X", "Y"]);
  assert.equal(d.groups[0].cols.length, NG);
  assert.equal(d.x[0], 452000); assert.equal(d.y[0], 7544000); assert.equal(d.z, null, "ELEV 0.000 is no elevation");
  assert.equal(d.localGrid, null, "MGA coordinates are no local grid");
  const t = d.gateTimes(d.groups[0]); assert.deepEqual(t, times);
  const mat = channelMatrix(d, d.groups[0]);
  const fit = decayTau(t, Array.from(mat.v.subarray(0, mat.m)));
  assert.ok(Math.abs(fit.tau - 3.2) < 0.05, `tau ${fit.tau}`);
  const x = channelMatrix(d, d.groups[1]); assert.ok(Math.abs(x.v[0]) > 100 && Math.abs(x.v[0]) < 700, "the X component is kept as its own channel set");
});

test("moving loop and slingram files read the same way; the three components of one station are one row", () => {
  const ml = readTemText(maxwell({ order: ["X", "Y", "Z"], loop: true, extraCols: "chain" }), "moving.txt");
  assert.equal(ml.n, 6); assert.equal(ml.groups[0].component, "Z");
  const sl = readTemText(maxwell({ config: "SLINGRAM", slingramNote: true }), "line_sl.tem");
  assert.match(sl.source, /slingram/); assert.equal(sl.n, 6);
  assert.equal(readTemText(maxwell({ config: "INLOOP" }), "x_in.tem").n, 6);
});

test("a multi-line file: the LINE separator rows split the lines, the commented header mid-file is ignored", () => {
  const d = readTemText(maxwell({ multi: true }), "multi.tem");
  assert.equal(d.n, 12);
  const L = linesOf(d); assert.deepEqual(L.map((l) => l.key), ["100", "200"]); assert.equal(L[0].idx.length, 6);
});

test("a local-grid file (eastings 50,000 to 52,600) says so, so the pane can ask for its tie", () => {
  const d = readTemText(maxwell({ east0: 50000, north: 3000, localGrid: true }), "kite_in.tem");
  assert.ok(d.localGrid, "a local grid");
  assert.deepEqual(d.localGrid.y, [3000, 3000]); assert.ok(d.localGrid.x[0] >= 50000);
  assert.equal(readTemText(maxwell({ east0: 458000, north: 7550000 }), "mga.tem").localGrid, null);
});

test("borehole evidence still refuses: a hole or depth column, a borehole header, a downhole CONFIG, readings down one position", () => {
  const cols = ["X", "Y", "RL", "COMPONENT", "CH1"];
  const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const comps = ["X", "Y", "Z"];
  // the same file as a ground survey (station moves along) is NOT borehole: a component column and repeated stations alone are not evidence
  const ground = rep(18, (i) => ({ X: 452000 + Math.floor(i / 3) * 100, Y: 7544000, RL: 0, COMPONENT: comps[i % 3] }));
  assert.deepEqual(boreholeEmClues(cols, ground, ""), []);
  // the same positions down a hole
  const down = rep(18, (i) => ({ X: 531797.6, Y: 5531479.7, RL: 1245 - Math.floor(i / 3) * 20, COMPONENT: comps[i % 3] }));
  const c = boreholeEmClues(cols, down, "");
  assert.ok(c.some((x) => /several elevations at one position \(RL\)/.test(x)), c.join("|"));
  assert.ok(c.some((x) => /component column/.test(x)) && c.some((x) => /repeated for several components/.test(x)), "the supporting clues are still named");
  assert.equal(boreholeEmClues(["X", "Y", "HOLE", "COMPONENT"], ground, "").length > 0, true);
  assert.equal(boreholeEmClues(["X", "Y", "DEPTH"], [], "").length, 1);
  assert.ok(boreholeEmClues(cols, ground, "/ Borehole EM, fixed loop").some((x) => /header that says borehole/.test(x)));
  assert.ok(boreholeEmClues(cols, ground, "TEM File Created by MAXWELL\nLINE:1 DATATYPE:TEM CONFIG:DOWNHOLE BFREQ:1").some((x) => /downhole configuration \(CONFIG:DOWNHOLE\)/.test(x)));
  assert.equal(groundEmConfig("LINE:1 CONFIG:SLINGRAM"), "SLINGRAM"); assert.equal(groundEmConfig("CONFIG:BOREHOLE"), null); assert.equal(groundEmConfig("no config"), null);
  // a downhole Maxwell file, with a depth column, is still refused by the reader
  const bh = maxwell().replace("CONFIG:INLOOP", "CONFIG:DOWNHOLE");
  assert.throws(() => readTemText(bh, "bh.tem"), /is borehole EM \(.*a downhole configuration \(CONFIG:DOWNHOLE\)/);
});

test("'Import survey .xyz' still sends a ground Maxwell file to EM > TEM line data, not to 'borehole EM'", () => {
  const t = maxwell();
  const g = parseXYZ(t);
  const r = tableRefusal("line.tem", g.columns, g.rows, "point", t);
  assert.match(r || "", /multi-channel EM file/); assert.doesNotMatch(r || "", /borehole EM file/);
});

test("wired: the pane takes .tem, keeps the components out of the two-moment join, asks for a local grid's tie; keys in every language", () => {
  const p = read("../src/components/TemPane.jsx");
  assert.match(p, /accept="\.xyz,\.csv,\.txt,\.dat,\.tem,\.pem,\.stp"/);
  assert.match(p, /filter\(\(g\) => !g\.component && \(g\.role \?/);
  assert.match(p, /TemGridTie/);
  for (const k of ["a downhole configuration (CONFIG:{v})", "several elevations at one position ({col})"])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
