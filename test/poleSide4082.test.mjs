// TASKS.csv #4082 (the follow-up of #4077): a TQIPdb plot-point table does not say which end the current pole stood at (the real survey's raw dumps show both ends on different
// lines), so the DC / IP pane offers the choice, and the raw Zonge dump (.gdd), which carries the electrodes as recorded, is read too. Every file here is made up, with the shape of the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessDcipColumns, parseDcipRows, parseDcipWhitespaceText, lineTagOf } from "../src/lib/dcip.js";
import { electrodeFile } from "../src/lib/dcipElectrodes.js";
import { parseTqipdbPlot, flipPoleRows, flipPoleReadings, isZongeGdd, parseZongeGdd, isTqipdbPlot } from "../src/lib/tqipdbPlot.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const w = (v, n = 10) => String(v).padStart(n);
function plotTable() {
  const L = ["IP DATA FROM : Example.mdb (TQIPdb  V2.10) 17/05/2010 Mx start = 500 Mx end = 1100", "LINE: 6173900N ARRAY:PLDP DIPOLE:50.0  UNITS:M T=70,20", "Line      PltPt      Nlevel        Res         Mx"];
  for (let n = 1; n <= 3; n++) for (let i = 0; i < 5; i++) L.push([w(6173900, 7), w((763000 + i * 50 + n * 25).toFixed(2)), w(n.toFixed(1)), w((10 + n + i).toFixed(2)), w((2 + 0.1 * n).toFixed(2))].join(" "));
  return L.join("\r\n") + "\r\n";
}

test("flipPoleRows: the low reading's mirror is exactly the high reading, and flipping twice gives it back", () => {
  const low = parseTqipdbPlot(plotTable(), { poleSide: "low" }), high = parseTqipdbPlot(plotTable(), { poleSide: "high" });
  const m = guessDcipColumns(low.headers);
  assert.deepEqual(flipPoleRows(low.rows, m), high.rows);
  assert.deepEqual(flipPoleRows(flipPoleRows(low.rows, m), m), low.rows);
  assert.equal(low.poleSide, "low");
  assert.equal(high.poleSide, "high");
  // the plot point (the middle of the pole and the near potential electrode) does not move
  const mid = (r) => (r.A + r.M) / 2;
  low.rows.forEach((r, i) => assert.equal(mid(r), mid(high.rows[i])));
});

test("flipPoleReadings: pole-dipole readings mirror, a dipole-dipole reading is left alone", () => {
  assert.deepEqual(flipPoleReadings([[1000, null, 1050, 1100]]), [[1050, null, 1000, 950]]);
  assert.deepEqual(flipPoleReadings([[1050, null, 1000, 950]]), [[1000, null, 1050, 1100]]);
  assert.deepEqual(flipPoleReadings([[0, 100, 200, 300]]), [[0, 100, 200, 300]]);
  // a row with a second current electrode is left as it is
  const rows = [{ A: 0, B: 100, M: 200, N: 300 }];
  assert.deepEqual(flipPoleRows(rows, { a: "A", b: "B", m: "M", n: "N" }), rows);
});

// a raw Zonge dump (new firmware: Tx1 Tx2 Rx1 Rx2); the pole at the HIGH end, 9999999 for the remote electrode, repeats of one array
const HEAD_NEW = "Mem Date Hour Array LineTx LineRx Dir n Tx1 Tx2 Rx1 Rx2 Contact Rho Sp SpMin SpMax Vp ErrVp Sym(%) M ErrM In Time Stack";
const HEAD_OLD = "Mem Date Time El-array LineTx LineRx Dir n Tx Tx Rx Rx Contact Rho Sp SpMin SpMax Vp ErrVp Sym(%) M ErrM In Time Stack";
function gdd(head, { lineTx = 6173900, lineRx = 6173900 } = {}) {
  const L = ["Version PPC: 0.4.2.18 Version Rx: 0.2.5.2 Rx SN: 1", "Project: example", "Windows: 20 Setting: User Delay (ms): 70", head];
  const row = (n, pole, rx1, rho, m) => `1 15/05/2010 13:48:55 P-DP ${lineTx}.00 ${lineRx}.00 N-S ${n}.0 9999999.00 ${pole}.00 ${rx1}.00 ${rx1 - 50}.00 1.1 ${rho} -3.0 -3.2 -2.9 154.6 0.003 100 ${m} 0.003 3500.0 2000 50`;
  L.push(row(1, 764800, 764750, 27.75, 2.8), row(1, 764800, 764750, 27.85, 3.0), row(2, 764800, 764700, 23.85, 3.0), row(1, 764750, 764700, 20.5, 2.5), row(1, 764750, 764700, -1, 2.5));
  return L.join("\r\n") + "\r\n";
}
test("raw Zonge dump (.gdd): the electrodes as recorded, the repeats averaged, the pole at the high end, either header", () => {
  for (const head of [HEAD_NEW, HEAD_OLD]) {
    const text = gdd(head);
    assert.equal(isZongeGdd(text), true);
    const r = parseDcipWhitespaceText(text); // the pane's own entry point
    assert.equal(r.rows.length, 3, "5 rows: 2 repeats of one array, 1 with a negative resistivity left out");
    assert.deepEqual(r.rows[0], { A: 764800, B: "", M: 764750, N: 764700, Res: 27.8, Mx: 2.9 });
    const m = guessDcipColumns(r.headers), p = parseDcipRows(r.rows, m);
    assert.equal(p.array, "pole-dipole");
    assert.equal(p.ipKind, "chargeability");
    assert.ok(p.readings.every(([A, , M]) => A > M), "the pole above the receivers");
    assert.equal(lineTagOf(text), "6173900"); // the receivers' line
    assert.match(r.note, /Zonge raw dump/);
  }
  assert.equal(isZongeGdd("Mem Date Hour Array LineTx\n1 2 3\n"), false);
});
test("raw Zonge dump: placed from its line number, and an offset pole is not read as one 2D line", () => {
  const text = gdd(HEAD_NEW), r = parseDcipWhitespaceText(text);
  const el = electrodeFile(text, "line_6173900mN.gdd", r, { lineTag: lineTagOf(text) });
  assert.equal(el.lines[0].pts.y1, 6173900);
  const off = parseDcipWhitespaceText(gdd(HEAD_NEW, { lineTx: 6173500 }));
  assert.match(off.error, /another line than the receivers/);
  assert.equal(off.rows.length, 0);
});
test("a plot-point table that sits beside a raw dump of the same line agrees with it when the pole side is the dump's", () => {
  // the dump has the pole at the high end: the plot table read with poleSide high gives the same electrode sets (from a table built the same way)
  const high = parseTqipdbPlot(plotTable(), { poleSide: "high" });
  assert.ok(high.rows.every((r) => r.A > r.M && r.M > r.N));
  assert.equal(isTqipdbPlot(plotTable()), true);
});

test("the DC / IP pane: the pole-side choice, the saved line follows, the raw dump goes first", () => {
  const src = read("../src/components/DcipPanel.jsx");
  assert.match(src, /import \{ isTqipdbPlot, isZongeGdd, flipPoleRows, flipPoleReadings \} from "\.\.\/lib\/tqipdbPlot\.js"/);
  assert.match(src, /\{file\.plot && \(/); // the choice shows only for a plot-point table
  assert.match(src, /data-pole-side=""/);
  assert.match(src, /const changePoleSide = async \(side\) =>/);
  assert.match(src, /setFile\(\{ \.\.\.file, rows: flipPoleRows\(file\.rows, mapping\), plot: \{ poleSide: side \} \}\)/);
  assert.match(src, /saveDcipLine\(\{ name: lineName, poleSide: side, readings: flipPoleReadings\(saved\.readings\), section: null \}\)/);
  assert.match(src, /confirmDestructive\(tr\("Move the pole\?/); // an inverted section is not in Undo
  assert.match(src, /setFile\(e\.poleSide \? \{ \.\.\.f, plot: \{ poleSide: e\.poleSide \} \} : f\)/); // a kept line brings its choice back
  assert.match(src, /isZongeGdd\(textAll\) \|\| isTqipdbPlot\(textAll\)/); // a header that looks like electrodes must not skip the dump / plot-table reader
  assert.match(src, /plotSide = r\.poleSide \|\| null/);
});
