// TASKS.csv #4077 (found by the #4068 round-2 harvest inventory) — three IP files that were not read:
//   - Zonge TQIPdb "plot point" tables (Line PltPt Nlevel Res Mx): the electrodes are rebuilt from the plot point, the n-level and the dipole,
//   - TS2DIP .ipd (a CSV whose comment lines come after the header and name the IP unit),
//   - SMARTem24 TIP files, which have the STN / RDNG / CH1 ... columns of a TEM receiver file and were read as TEM.
// Every file here is made up, with the shape of the real ones (counts and formats only came from the harvest; nothing of it is in the repo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessDcipColumns, parseDcipRows, parseDcipWhitespaceText, lineTagOf } from "../src/lib/dcip.js";
import { electrodeFile } from "../src/lib/dcipElectrodes.js";
import { isTqipdbPlot, parseTqipdbPlot, isTs2dip, parseTs2dip, tqipdbLineName } from "../src/lib/tqipdbPlot.js";
import { isReceiverTem, isSmartemTipText } from "../src/lib/maxwellTem.js";
import { readTemText } from "../src/lib/temLines.js";

const pad = (v, n = 10) => String(v).padStart(n);
// a pole-dipole plot-point table: stations every `a`, n-levels 1..nMax, the pole at the LOW end of each array (plot = pole + n a / 2)
function plotTable({ x0 = 1000, a = 50, nSt = 6, nMax = 3, line = "10050N", head = true, cut = false, array = "PLDP" } = {}) {
  const L = [];
  if (!cut) L.push("IP DATA FROM : Example_IP.mdb (TQIPdb  V2.10) 17/05/2010 Mx start = 500 Mx end = 1100", `LINE: ${line} ARRAY:${array} DIPOLE:${a}.0  UNITS:M T=70,20,20,20,20,40,40,40,40,80,80,80,80,120`);
  else L.push("19/05/2010 Mx start = 500 Mx end = 1100", "=70,20,20,20,20,40,40,40,40,80,80,80,80,120,120");
  L.push("Line      PltPt      Nlevel        Res         Mx  ");
  for (let n = 1; n <= nMax; n++) for (let i = 0; i < nSt; i++) L.push([pad(String(parseInt(line, 10)), 7), pad((x0 + i * a + n * a / 2).toFixed(2), 10), pad(n.toFixed(1), 10), pad((10 + n + i).toFixed(2), 10), pad((2 + 0.1 * n).toFixed(2), 10)].join(" "));
  return L.join("\r\n") + "\r\n";
}

test("TQIPdb plot-point table: electrodes rebuilt from the plot point, the n-level and the dipole", () => {
  const text = plotTable();
  assert.equal(isTqipdbPlot(text), true);
  const r = parseDcipWhitespaceText(text); // the DC / IP pane's own entry point
  assert.deepEqual(r.headers, ["A", "B", "M", "N", "Res", "Mx"]);
  assert.equal(r.rows.length, 18);
  // plot 1025, n = 1, dipole 50: the pole at 1000, the potential dipole at 1050-1100 (the pole 1 x 50 from the near electrode)
  assert.deepEqual([r.rows[0].A, r.rows[0].B, r.rows[0].M, r.rows[0].N], [1000, "", 1050, 1100]);
  // n = 3: plot 1075 -> pole 1000, M 1150, N 1200
  const r3 = r.rows[12]; // n = 3, the first station: plot 1075
  assert.deepEqual([r3.A, r3.M, r3.N], [1000, 1150, 1200]);
  const m = guessDcipColumns(r.headers);
  assert.deepEqual(m, { a: "A", b: "B", m: "M", n: "N", rho: "Res", ip: "Mx" });
  const p = parseDcipRows(r.rows, m);
  assert.equal(p.array, "pole-dipole");
  assert.equal(p.ipKind, "chargeability");
  assert.equal(p.spacing, 50);
  assert.equal(p.readings.length, 18);
  assert.match(r.note, /pole-dipole with a 50 m dipole/);
  assert.match(r.note, /lower-coordinate/);
});

test("TQIPdb plot-point table: the pole at the high end mirrors the electrodes", () => {
  const r = parseTqipdbPlot(plotTable(), { poleSide: "high" });
  // plot 1025, n = 1: the pole at 1050, the potential dipole at 1000-950
  assert.deepEqual([r.rows[0].A, r.rows[0].M, r.rows[0].N], [1050, 1000, 950]);
  assert.match(r.note, /higher-coordinate/);
});

test("TQIPdb plot-point table: a header block cut short still reads (dipole from the n = 1 plot points, the line from the first row)", () => {
  const text = plotTable({ cut: true, a: 100, line: "6174400N" });
  assert.equal(isTqipdbPlot(text), true);
  const r = parseDcipWhitespaceText(text);
  assert.equal(r.rows.length, 18);
  assert.deepEqual([r.rows[0].A, r.rows[0].M, r.rows[0].N], [1000, 1100, 1200]);
  assert.match(r.note, /not stated: read as pole-dipole/);
  assert.equal(tqipdbLineName(text), "6174400");
  assert.equal(lineTagOf(text), "6174400"); // placed from the number (a northing: an east-west line)
});

test("TQIPdb plot-point table: map eastings are placed from the line's name", () => {
  const text = plotTable({ x0: 763000, line: "6173900N" });
  const r = parseDcipWhitespaceText(text), tag = lineTagOf(text);
  assert.equal(tag, "6173900N");
  const el = electrodeFile(text, "Line_6173900N.dat", r, { lineTag: tag });
  assert.equal(el.lines.length, 1);
  assert.equal(el.lines[0].pts.y1, 6173900);
  assert.ok(el.lines[0].pts.x2 > el.lines[0].pts.x1);
});

test("TQIPdb plot-point table: another array is said, not guessed", () => {
  const r = parseDcipWhitespaceText(plotTable({ array: "DPDP" }));
  assert.match(r.error, /DPDP survey/);
  assert.equal(r.rows.length, 0);
  // a table with the same columns is not mistaken for another file
  assert.equal(isTqipdbPlot("Line, Easting, Res, Mx\n1,2,3,4\n"), false);
});

// a TS2DIP .ipd: the header first, then two quoted comment lines
function ipd(unit = "mrad") {
  return ["Splt,Zplt,SRx1,SRx2,STx1,STx2,ARobs,ARerr,IPobs,IPerr,ARmod,IPmod", "\"//Data from TS2DIP v4.60e  Date:10/09/12  Time:11:15:28\"",
    `"//Array=Dipole-Dipole, DipoleLength=100, StnPerDipole=100, LengthUnits=m, IPUnits=${unit}"`,
    "56950,-100,57000,57100,56800,56900,1.5133E+1,0.1,-0.02,0.101,1.6139E+1,1.64", "57000,-150,57100,57200,56800,56900,2.2364E+1,0.1,1.72,0.101,2.3218E+1,1.97",
    "57025,-125,57100,57200,56850,56950,1.8686E+1,0.1,2.19,0.101,1.9285E+1,2.6", "57050,-100,57100,57200,56900,57000,1.7888E+1,0.1,2,0.101,1.7642E+1,2.75"].join("\r\n") + "\r\n";
}
test("TS2DIP .ipd: the observed columns, the IP unit from the comment line", () => {
  assert.equal(isTs2dip(ipd()), true);
  assert.equal(isTs2dip("Splt,Zplt\n1,2\n"), false);
  const e = electrodeFile(ipd(), "476250N.ipd", { headers: [], rows: [] }, {});
  assert.equal(e.lines.length, 1);
  const L = e.lines[0], m = guessDcipColumns(L.headers), p = parseDcipRows(L.rows, m);
  assert.equal(p.readings.length, 4);
  assert.deepEqual(p.readings[0], [56800, 56900, 57000, 57100]); // current STx1 STx2, potential SRx1 SRx2
  assert.equal(p.rho[0], 15.133);
  assert.equal(p.ip[1], 1.72);
  assert.equal(p.ipKind, "phase"); // mrad
  assert.equal(p.array, "dipole-dipole (or any 4-electrode array)");
  assert.match(L.note, /dipole-dipole/);
  // the same file in mV/V is a chargeability
  const q = parseDcipRows(...(() => { const x = parseTs2dip(ipd("mV/V")).lines[0]; return [x.rows, guessDcipColumns(x.headers)]; })());
  assert.equal(q.ipKind, "chargeability");
});

// a SMARTem24 TIP file (no 'EXPORTED' line): a pole-dipole survey on a local grid, its remote current electrode given as a map position
function tip() {
  const cols = ["STN", "RDNG", "C1E", "C1N", "C1Z", "C2E", "C2N", "C2Z", "P1E", "P1N", "P1Z", "P2E", "P2N", "P2Z", "ASPACE", "APPRES", "M", "MERR", "VP", "PHASE", "NCH", "CH1", "CH2", "CH3", "CH4", "CH5"];
  const L = ["SMARTem24 TIP data file SETTINGSFILENAME:Example Application Version: 6.3.2  First Written [Fri 07 Aug 2015 21:54:15]", "DATATYPE:TIP  RECEIVER:SMARTem24  LINE:MULTI  CONFIG:Pole_Dipole  LOCATIONMODE:Manual  POWFREQ:50",
    cols.join("      "), "/TIMESSTART(ms)=40,55,65,95,115", "/TIMESEND(ms)=60,75,105,135,195", "LINE:Tx1.00Rx1.00"];
  for (let i = 0; i < 6; i++) for (const n of [1, 2]) {
    const c1 = -150, p1 = i * 100 + (n - 1) * 50, p2 = p1 + 100;
    L.push([p1 - 50 + n, i + 1, c1, "1.00", "0.00", "489058.00", "7888792.00", "0.00", p1, "1.00", "0.00", p2, "1.00", "0.00", 100, (200 + 10 * i + n).toFixed(3), (3 + 0.1 * i).toFixed(3), "0.100", "5.0", "2.0", 5, 1, 2, 3, 4, 5].join("  "));
  }
  return L.join("\r\n") + "\r\n";
}
test("SMARTem24 TIP: not a TEM file, read as a pole-dipole IP line (the remote pole is left out, a local grid kept unplaced)", () => {
  const text = tip();
  assert.equal(isSmartemTipText(text), true);
  assert.equal(isReceiverTem(text), false, "the TEM sniffers must not take an IP file");
  assert.throws(() => readTemText(text, "NunnNE.ip"), /SMARTem IP \(TIP\) file/);
  const e = electrodeFile(text, "NunnNE.ip", { headers: [], rows: [] }, {});
  assert.equal(e.lines.length, 1);
  const L = e.lines[0], p = parseDcipRows(L.rows, guessDcipColumns(L.headers));
  assert.equal(p.array, "pole-dipole");
  assert.equal(p.readings.length, 12);
  assert.equal(p.ipKind, "chargeability");
  assert.deepEqual(p.span, [0, 800]); // the local grid, from the pole at -150 (shifted to 0) to the last potential electrode at 650
  assert.equal(L.pts, null, "a local grid cannot be placed on the map");
});

test("SMARTem24 TIP: a TEM receiver file with the same leading columns is still TEM", () => {
  const cols = ["STN", "RDNG", "EAST", "NORTH", "RL", "ADC", "C", "CH1", "CH2", "CH3", "CH4", "CH5"];
  const text = ["SMARTem24 TEM data file", "DATATYPE:TEM  RECEIVER:SMARTem24", cols.join(" "), "/TIMESSTART(ms)=1,2,3,4,5", "/TIMESEND(ms)=2,3,4,5,6"].join("\n") + "\n";
  assert.equal(isSmartemTipText(text), false);
});
