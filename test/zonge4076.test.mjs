// TASKS.csv #4076 — Zonge's averaged files (lib/zonge.js): CR averages into the DC / IP line, CSAMT averages into MT soundings, TEM .amr into TEM lines,
// and the raw / parameter / database files refused in words. Every file here is MADE UP with the shape of the real ones (side 1's harvest stays local).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zongeParams, zongeKind, crAvgToTable, zongeRefusal, isZongeRaw } from "../src/lib/zonge.js";
import { guessDcipColumns, parseDcipRows } from "../src/lib/dcip.js";
import { parseStationFile } from "../src/lib/dcipStations.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const FREQS = [0, 0.125, 0.375, 0.625, 0.875, 1.125];
// a made-up dipole-dipole line, 100 m dipoles, n = 1..3 from 4 transmitter positions; the 0 Hz row holds rho and the 3-point phase
const readings = () => {
  const out = [];
  for (let s = 0; s < 4; s++) for (let n = 1; n <= 3; n++) {
    const tx = 1000 + 100 * s, rx = tx + 100 * (n + 1);
    out.push({ tx, rx, n, plt: (tx + rx) / 2 + 50, rho: 100 + 10 * s + n, phs: 5 + s + n / 10 });
  }
  return out;
};
// CRAVGW v1.x: "$" parameters, then a CSV table with Tx.X1 … IP.mag
function crV1() {
  const L = ["\\\\ CR data from CRAVGW v1.00h on 01/01/12", '$Job.Number="0001"', "$Survey.Type=TDIP", "$Survey.Array=D-D", '$Line.Name="500 N"', "$Line.Number=500", "$Stn.UnitScale=1 m/Stn#", "$Unit.IP=mrad", " ",
    "Tx.X1,Tx.X2,Rx.X1,Rx.X2,Tx.Y1,Tx.Y2,Rx.Y1,Rx.Y2,Plt.X,Plt.Y,Plt.Z,Plt.Nsp,Plt.East,Plt.North,Plt.Elev,Tx.Amp,Tx.Phz,Tx.NCycle,Tx.Freq,Rx.Freq,Rx.Cmp,Rx.CntRes,ARes.mag,ARes.%err,ARes.wgt,IP.mag,IP.err,IP.wgt"];
  for (const r of readings()) for (const f of FREQS) {
    const rho = f === 0 ? r.rho : r.rho / 1000, ip = f === 0 ? r.phs : r.phs + 10 * f;
    L.push([r.tx, r.tx + 100, r.rx, r.rx + 100, 500, 500, 500, 500, r.plt, 500, -50 * r.n, r.n, r.plt, 500, 0, 2.5, 0, 16, 0.125, f, "Ex", 200, rho, 0.1, 1, ip, 0.05, 1].join(", "));
  }
  return L.join("\r\n") + "\r\n";
}
// CRAVG 7.x: whitespace, Tx / Rx are the dipoles' first stations, ASPACE the dipole length
function cr7({ comma = false } = {}) {
  const sep = comma ? ", " : "   ";
  const L = ['\\ CRAVG 7.22: "L5.FLD", Dated   -01-01, Processed 1 Jan 03', "$ ASPACE= 100.0m", "\\ 0.Hz Mag= RhoA @  0.125 Hz, Phz= 3-Pt Phz @ .125,.375,.625 Hz",
    ["skp", "Tx", "Rx", "PltPt", "NSp", "Freq", "Cmp", "Amps", "Resistivity", "Phase", "Real", "Imag", "%Rho", "sPhz"].join(comma ? "," : "     "), "\\-----"];
  for (const r of readings()) for (const f of FREQS) L.push([2, r.tx.toFixed(2), r.rx.toFixed(2), r.plt.toFixed(2), r.n.toFixed(1), f.toFixed(3), "Ex", 16, (f === 0 ? r.rho : r.rho / 1000).toExponential(4), (f === 0 ? r.phs : r.phs + 10 * f).toFixed(1), "1.0e+0", "0.0e+0", "0.0", "0.1"].join(sep));
  return L.join("\r\n") + "\r\n";
}

test("the parameters: '$Key=value' and '$ Key = value', quotes dropped", () => {
  const p = zongeParams('$Job.Number="978"\n$ Line.Name = "1850 N"\n$ ASPACE= 200.0m \n$Rx.Center=1,2,3\n');
  assert.deepEqual(p, { "Job.Number": "978", "Line.Name": "1850 N", ASPACE: "200.0m", "Rx.Center": "1,2,3" });
});

test("a CR average, CRAVGW v1.x: each reading's 0 Hz row, electrodes from Tx.X / Rx.X, rho and the phase as an IP PHASE (mrad)", () => {
  const text = crV1();
  assert.equal(zongeKind(text), "cr");
  const t = crAvgToTable(text, "L500.avg");
  assert.equal(t.readings, 12); assert.equal(t.lineName, "500 N"); assert.deepEqual(t.warnings, []);
  const p = parseDcipRows(t.rows, guessDcipColumns(t.headers));
  assert.equal(p.readings.length, 12); assert.equal(p.ipKind, "phase");
  assert.deepEqual(p.readings[0].slice ? p.readings[0].slice(0, 4) : [p.readings[0].a, p.readings[0].b, p.readings[0].m, p.readings[0].n], [1000, 1100, 1200, 1300]);
  assert.equal(p.rho[0], 101); assert.ok(Math.abs(p.ip[0] - 5.1) < 1e-9, "the 0 Hz phase, not a harmonic's");
});

test("a CR average, CRAVG 7.x (and its comma twin): Tx / Rx the dipoles' first stations, ASPACE the length; the plot point checks them", () => {
  for (const comma of [false, true]) {
    const t = crAvgToTable(cr7({ comma }), "L5.AVG");
    assert.equal(t.readings, 12, comma ? "comma" : "spaces"); assert.deepEqual(t.warnings, []);
    const p = parseDcipRows(t.rows, guessDcipColumns(t.headers));
    const r0 = p.readings[0], el = r0.slice ? r0.slice(0, 4) : [r0.a, r0.b, r0.m, r0.n];
    assert.deepEqual(el, [1000, 1100, 1200, 1300]); assert.equal(p.rho[0], 101); assert.equal(p.ipKind, "phase");
  }
  // a plot point that is not the middle of the dipoles: the electrodes are not what the rule says, and it is said
  const off = cr7().replace(/(\s1000\.00\s+1200\.00\s+)1150\.00/, "$11125.00");
  assert.match(crAvgToTable(off, "x.AVG").warnings.join(" "), /1 reading\(s\) plot off their dipoles. middle/);
  assert.throws(() => crAvgToTable(cr7().replace("$ ASPACE= 100.0m", ""), "x.AVG"), /no dipole length/);
});

test("a header-less Zonge .stn (station, easting, northing, elevation) is a station file", () => {
  const stn = ["1000\t500000\t6000000\t120.5", "1100\t500000\t6000100\t121.0", "1200\t500000\t6000200\t119.8"].join("\r\n") + "\r\n";
  const s = parseStationFile(stn, "L500.utm.stn");
  const all = Object.values(s.lines).flat();
  assert.equal(all.length, 3);
});

test("raw, parameter and database files are refused in words, naming the file to open; a file for another pane names that pane", () => {
  const raw = "8210\r\nCR  0846 2001-01-01 10:00:00 12.1v D-D  56.8%  42.8 DegC\r\nOPER x TX ID y A-SP 100 M\r\n";
  assert.ok(isZongeRaw(raw, "L500.raw"));
  assert.match(zongeRefusal(raw, "L500.raw", "dcip"), /Zonge raw file: open the averaged \.avg of the same line/);
  assert.match(zongeRefusal("$ Job.Number = \"X\"\n$ Survey.Type = TEM\n$ Tx.Ramp = 500 usec\n", "T.mde", "tem"), /parameters only/);
  assert.match(zongeRefusal("Zonge GDP delay times w.r.t. end of Tx ramp (msec)\nNUMTIMES:3\n", "T.chn", "tem"), /a Zonge TEM \.amr's gate times: open the \.amr with it/);
  assert.equal(zongeRefusal(crV1(), "L500.avg", "dcip"), null);
  assert.match(zongeRefusal(crV1(), "L500.avg", "mt"), /CR \(IP\) average: open it in IP \/ Resistivity/);
  const p = read("../src/components/DcipPanel.jsx");
  assert.match(p, /\{ const no = zongeRefusal\(textAll, f\.name, "dcip"\); if \(no\) \{ setMsg\(\{ ok: false, text: no \}\); return; \} \}/);
  assert.match(p, /accept="[^"]*\.avg,\.stn"/);
  assert.match(p, /if \(\/\\\.\(gpx\|wpt\|stn\)\$\/i\.test\(f\.name\)\) \{ stationFiles\.push\(f\); continue; \}/);
});
