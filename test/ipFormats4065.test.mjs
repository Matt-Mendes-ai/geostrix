// TASKS.csv #4065 (found by side 2's inventory of 28 Queensland open-file reports) — IP formats beyond Zonge's TQIPdb: MIMDAS IP in Geosoft text (electrodes as map
// coordinates), MIMDAS UBC-2D observation files (.dc, potentials per unit current), SMARTem24 TIP exports (electrode coordinates, several lines), the older IPBASE
// tables (F1 F2 M1 M2 Mx RES), a quoted header, and a TAB-delimited table with blank cells. Every file here is made up, with the shape of the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessDcipColumns, parseDcipRows, parseDcipWhitespaceText, apparentResistivity } from "../src/lib/dcip.js";
import { electrodeColumns, electrodeLines, electrodeFile, parseSmartemTip, isSmartemTip, parseUbc2dObs, isUbc2dObs } from "../src/lib/dcipElectrodes.js";
import { tableRefusal } from "../src/lib/tableRefusal.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const w = (v, n = 11) => String(v).padStart(n);

// MIMDAS IP, Geosoft text: map-coordinate electrodes, '*' for the pole's second electrode, a dipole-dipole-like set of pole-dipole readings. dir: unit vector of the line
function mimdas({ x0 = 437450, y0 = 7601450, dir = [1, 0], nSt = 6, yOff = (i) => 0 } = {}) {
  const L = ["MIMDAS IP Data Geosoft Format : Integration Time = 0.51 to 2.50 secs (3ptPhase2 = Hallof 3 point de-coupling)", "LINE:Line1 ARRAY:PLDP DIPOLE:200 UNITS:M TXFREQ:25/256",
    ["F1x", "F2x", "M1x", "M2x", "F1y", "F2y", "M1y", "M2y", "2DRho", "ARerr", "Vp", "I", "Sp", "IP", "IPerr", "QdErr", "Phase", "3PtPhase2"].map((h) => w(h)).join(" ")];
  const at = (s, off = 0) => [x0 + dir[0] * s - dir[1] * off, y0 + dir[1] * s + dir[0] * off];
  let k = 0;
  for (let n = 1; n <= 3; n++) for (let i = 0; i < nSt; i++) {
    const a = at(i * 200, yOff(k)), m1 = at(i * 200 + n * 200 + 200, yOff(k)), m2 = at(i * 200 + n * 200 + 400, yOff(k));
    L.push([a[0], "*", m1[0], m2[0], a[1], "*", m1[1], m2[1], (500 + 100 * n + i).toFixed(3), "0.001", "598.78", "1.000", "0.000", (9 + n + i * 0.1).toFixed(3), "0.001", "0.780", (12 + n).toFixed(3), "11.981"].map((v) => w(v)).join(" "));
    k++;
  }
  return L.join("\r\n") + "\r\n";
}
// SMARTem24 TIP export, two lines, the first read twice (RDNG 10 and 11)
function tip() {
  const cols = ["STN", "RDNG", "C1E", "C1N", "C1Z", "C2E", "C2N", "C2Z", "P1E", "P1N", "P1Z", "P2E", "P2N", "P2Z", "RX_GPS_ZONE", "UNITS", "ASPACE", "APPRES", "M", "MERR", "VP", "PHASE", "NCH", "CH1", "CH2", "CH3", "CH4"];
  const L = ["EXPORTED SMARTem24 TIP data file SETTINGSFILENAME:Example Application Version:10.0", "DATATYPE:TIP  RECEIVER:SMARTem24  LINE:MULTI  CONFIG:Dipole_Dipole  TX:GAP  PROSPECT:Example", cols.join(" "),
    "/TIMESSTART(ms)=50,70,110,150", "/TIMESEND(ms)=70,110,150,230"];
  for (const [line, n0] of [["Tx7614410.00Rx7614410.00", 7614410], ["Tx7614810.00Rx7614810.00", 7614810]]) {
    L.push(`LINE:${line}`);
    for (const rd of [10, 11]) for (let i = 0; i < 5; i++) {
      if (n0 === 7614810 && rd === 11) continue;
      const e = 440250 + i * 100, c2 = e - 100, p1 = e + 100, p2 = e + 200;
      L.push([e - 75, rd, e, n0, "0.00", c2, n0, "0.00", p1, n0, "0.00", p2, n0, "0.00", 54, "mV/V", 100, (50 + i + rd / 10).toFixed(3), (3 + i * 0.5 + rd / 100).toFixed(3), "0.001", "2235.9", "8.8", 4, "24.1", "20.7", "17.6", "14.8"].join(" "));
    }
  }
  return L.join("\r\n") + "\r\n";
}
// MIMDAS UBC-2D observation file, pole-dipole: A and B the same
const ubc = ["MIMDAS IP Data UBC 2D Format : Integration Time = 3.00 to 5.00 secs  LINE:Line10_7511200N ARRAY:PLDP DIPOLE:200 UNITS:M TXFREQ:25/512", "pole-dipole",
  ...[[495500, 495600, 495800, 0.0032496, 0.0001728], [495500, 495800, 496000, 0.0008113, 0.0000509], [495700, 495800, 496000, 0.0027123, 0.0001459], [495700, 496000, 496200, 0.0008402, 0.0000523]]
    .map(([a, m, n, v, e]) => [a, a, m, n, v.toFixed(7), e.toFixed(7)].map((x) => w(x, 12)).join(" "))].join("\r\n") + "\r\n";

test("MIMDAS Geosoft text: the electrode columns, then one line along its axis placed by its ends, the IP column read as a chargeability", () => {
  const text = mimdas();
  const t = parseDcipWhitespaceText(text);
  assert.ok(t && t.rows.length === 18, "the header is found through the F1x / M1x aliases");
  const m0 = guessDcipColumns(t.headers); assert.deepEqual([m0.a, m0.b, m0.m, m0.n, m0.rho, m0.ip], ["F1x", "F2x", "M1x", "M2x", "2DRho", "IP"]);
  assert.deepEqual(electrodeColumns(t.headers).A, { x: "F1x", y: "F1y" });
  const el = electrodeFile(text, "line1.dat", t);
  assert.equal(el.lines.length, 1);
  const L = el.lines[0];
  assert.deepEqual(L.headers, ["A", "B", "M", "N", "2DRho", "IP"]);
  assert.equal(L.rows.length, 18); assert.equal(L.rows[0].A, 0); assert.equal(L.rows[0].B, "", "'*' is a pole"); assert.equal(L.rows[0].M, 400);
  assert.deepEqual(L.pts, { s1: 0, x1: 437450, y1: 7601450, s2: 2000, x2: 439450, y2: 7601450 });
  const p = parseDcipRows(L.rows, guessDcipColumns(L.headers));
  assert.equal(p.readings.length, 18); assert.equal(p.ipKind, "chargeability"); assert.equal(p.array, "pole-dipole"); assert.equal(p.spacing, 200);
  assert.match(L.note, /Electrodes read as one line \(azimuth 90\.0°, 2,000 m\)/);
});

test("MIMDAS: an oblique line is projected on its axis (the azimuth is found), the ends are on the line", () => {
  const d = [Math.SQRT1_2, Math.SQRT1_2];
  const t = parseDcipWhitespaceText(mimdas({ dir: d }));
  const L = electrodeFile("", "x.dat", t).lines[0];
  assert.ok(Math.abs(L.pts.s2 - 2000) < 1, `length ${L.pts.s2}`); assert.ok(Math.abs(L.pts.x2 - L.pts.x1 - 2000 * d[0]) < 1 && Math.abs(L.pts.y2 - L.pts.y1 - 2000 * d[1]) < 1);
  assert.match(L.note, /azimuth 45\.0°/);
  assert.equal(L.rows[0].M, 400); // pole-dipole spacing kept along the axis, whatever the direction
});

test("MIMDAS: electrodes on several lines are a 3D survey, said (not one line); a local chainage (Zonge's own X / Y) is left to the along-line reader", () => {
  const t3 = parseDcipWhitespaceText(mimdas({ yOff: (i) => Math.floor(i / 6) * 1000 }));
  const e = electrodeFile("", "block.dat", t3);
  assert.match(e.error, /This is a 3D IP survey: electrodes on [2-9] lines/);
  // a Zonge TQIPdb line: X is a chainage, Y holds the line's name: no electrode coordinates in the map's sense
  const zonge = ["IP DATA FROM : x.mdb (TQIPdb  V2.10) 03/04/2013", "LINE: 44100N ARRAY:DPDP DIPOLE:100.0  UNITS:M", ["C1X", "C2X", "P1X", "P2X", "C1Y", "C2Y", "P1Y", "P2Y", "Res", "Phz"].join(" "),
    ...[0, 1, 2, 3].map((i) => [52800 + i * 100, 52600 + i * 100, 52900 + i * 100, 53000 + i * 100, 44100, 44100, 44100, 44100, 5.32, 1.36].join(" "))].join("\n");
  const tz = parseDcipWhitespaceText(zonge);
  assert.equal(electrodeFile(zonge, "z.dat", tz), null);
  assert.equal(electrodeLines(["a", "b"], []), null);
});

test("SMARTem24 TIP: several lines, each placed by its own electrodes; chargeability (mV/V), repeats stacked; M is the chargeability, never an electrode", () => {
  const text = tip();
  assert.equal(isSmartemTip(text), true); assert.equal(isSmartemTip("a b c\n1 2 3\n"), false);
  const tp = parseSmartemTip(text);
  assert.equal(tp.rows.length, 15); assert.ok(tp.headers.includes("Chargeability") && tp.headers.includes("Apparent resistivity"));
  const el = electrodeFile(text, "tip.dat", { headers: [], rows: [] });
  assert.equal(el.lines.length, 2); assert.deepEqual(el.lines.map((l) => l.name), ["tip 7614410.00", "tip 7614810.00"]);
  const a = el.lines[0], p = parseDcipRows(a.rows, guessDcipColumns(a.headers));
  assert.equal(p.readings.length, 5, "the two readings (RDNG 10, 11) of each array are stacked"); assert.equal(a.stacked, 5); assert.equal(p.ipKind, "chargeability");
  assert.ok(Math.abs(p.ip[0] - (3.1 + 3.11) / 2) < 1e-6, `stacked chargeability ${p.ip[0]}`);
  assert.deepEqual(a.pts, { s1: 0, x1: 440150, y1: 7614410, s2: 700, x2: 440850, y2: 7614410 });
  assert.equal(parseDcipRows(el.lines[1].rows, guessDcipColumns(el.lines[1].headers)).readings.length, 5);
});

test("MIMDAS UBC-2D observation file: potentials per unit current turned into apparent resistivity, the line placed from its name", () => {
  assert.equal(isUbc2dObs(ubc), true); assert.equal(isUbc2dObs("x y z"), false);
  const r = parseUbc2dObs(ubc, "line10");
  const L = r.lines[0];
  assert.deepEqual(L.headers, ["A", "B", "M", "N", "Apparent resistivity", "Error (% of reading)"]);
  assert.equal(L.rows[0].B, "", "a pole-dipole file gives A twice"); assert.equal(L.rows[0].A, 495500); assert.equal(L.rows[0].M, 495600);
  const K = apparentResistivity(495500, null, 495600, 495800, 1000, 1);
  assert.ok(Math.abs(L.rows[0]["Apparent resistivity"] - K * 0.0032496) / L.rows[0]["Apparent resistivity"] < 1e-4, `rho ${L.rows[0]["Apparent resistivity"]}`);
  assert.ok(Math.abs(L.rows[0]["Error (% of reading)"] - (0.0001728 / 0.0032496) * 100) < 0.01);
  assert.deepEqual(L.pts, { s1: 495500, x1: 495500, y1: 7511200, s2: 496200, x2: 496200, y2: 7511200 }); // 'Line10_7511200N': an east-west line at that northing
  assert.match(L.note, /V\/A values turned into apparent resistivity.*Placed from its name \(Line10_7511200N\)/);
  const p = parseDcipRows(L.rows, guessDcipColumns(L.headers));
  assert.equal(p.readings.length, 4); assert.equal(p.array, "pole-dipole");
});

test("the other shapes: IPBASE F1 F2 M1 M2 Mx RES, a quoted header, a TAB table with blank IP cells and ResMeas", () => {
  const g = guessDcipColumns(["F1", "F2", "M1", "M2", "Mx", "RES"]); assert.deepEqual([g.a, g.b, g.m, g.n, g.rho, g.ip], ["F1", "F2", "M1", "M2", "RES", "Mx"]);
  const q = guessDcipColumns(['"F1x"', "F2x", "M1x", "M2x", "Rho", "Mx"]); assert.equal(q.a, '"F1x"');
  const tab = ["Line\tT1X\tT2X\tR1X\tR2X\tVp\tI\tSp\tIP[0]\tIP[1]\tIP[2]\tMx\tResMeas", "L7784600\t55300\t55400\t55500\t55600\t347.55\t1.6\t0\t\t\t5.04\t1.16\t409", "L7784600\t55300\t55400\t55600\t55700\t97.3\t1.6\t-3\t\t\t5.52\t1.18\t458"].join("\r\n");
  const t = parseDcipWhitespaceText(tab);
  assert.equal(t.rows.length, 2, "the blank cells keep their columns"); const m = guessDcipColumns(t.headers);
  assert.deepEqual([m.a, m.b, m.m, m.n, m.rho, m.ip], ["T1X", "T2X", "R1X", "R2X", "ResMeas", "Mx"]);
  assert.equal(parseDcipRows(t.rows, m).readings.length, 2);
});

test("refusals in words: a downhole log, a table of positions with no electrodes", () => {
  const a = tableRefusal("log.txt", ["depth", "seg", "time", "mx", "my", "mz", "mt"], [], "dcipLine");
  assert.match(a, /is a downhole log \(depth, mx, my, mz\), not a DC \/ IP line/);
  const b = tableRefusal("t.csv", ["East", "North", "Vp", "I", "Rho", "Mx"], [], "dcipLine");
  assert.match(b, /has positions but no electrodes \(A, B, M, N\)/);
  assert.equal(tableRefusal("ok.csv", ["A", "B", "M", "N", "Rho"], [], "dcipLine"), null);
});

test("wired: the panel reads the electrode formats in both routes, keeps a file's lines, and says an SL3 index holds no readings; keys in every language", () => {
  const p = read("../src/components/DcipPanel.jsx");
  assert.match(p, /electrodeFile\(textAll, f\.name, t, \{ lineTag: lineTagOf\(textAll\) \}\)/); assert.match(p, /keepElectrodeLines\(f, el\.lines\)/);
  assert.match(p, /for \(const p of await readLineFile\(f\)\)/); assert.match(p, /an SL3 header with no readings/);
  for (const k of ["Electrodes read as one line (azimuth {az}°, {len} m){v}.", "; {n} repeats stacked",
    "UBC-2D file: V/A values turned into apparent resistivity.", "Placed from its name ({tag}).",
    "{name}: {kept} lines kept ({readings} readings). Pick one to invert.",
    "\"{name}\" is an SL3 header with no readings: open the data files it lists.",
    "\"{name}\" is a downhole log (depth, mx, my, mz), not a DC / IP line.",
    "\"{name}\" has positions but no electrodes (A, B, M, N), so it is not a DC / IP line."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});

test("MIMDAS 2D lines with x positions only (eastings): placed from the line's name; a local chainage is left alone", async () => {
  const { placedFromName } = await import("../src/lib/dcipElectrodes.js");
  const text = ["MIMDAS IP Data Geosoft Format : Integration Time = 3.00 to 5.00 secs", "LINE:Line10_7511200N ARRAY:PLDP DIPOLE:200 UNITS:M TXFREQ:25/512", ["F1x", "F2x", "M1x", "M2x", "Rho", "ARerr", "Vp", "I", "Sp", "IP"].map((h) => w(h)).join(" "),
    ...[0, 1, 2, 3].map((i) => [495500 + i * 200, "*", 495600 + i * 200, 495800 + i * 200, 3.063, 0.019, 3.25, 1.0, 0.0, 0.79].map((v) => w(v)).join(" "))].join("\r\n");
  const t = parseDcipWhitespaceText(text);
  const r = placedFromName(t, "line10", "Line10_7511200N").lines[0];
  assert.deepEqual(r.pts, { s1: 495500, x1: 495500, y1: 7511200, s2: 496400, x2: 496400, y2: 7511200 });
  assert.match(r.note, /Placed from its name \(Line10_7511200N\)/);
  assert.equal(electrodeFile(text, "line10.dat", t, { lineTag: "Line10_7511200N" }).lines[0].pts.y1, 7511200);
  assert.equal(placedFromName({ headers: ["F1", "F2", "M1", "M2", "RES", "Mx"], rows: [{ F1: 39900, F2: 40000, M1: 39500, M2: 39600, RES: 70, Mx: 5 }, { F1: 39800, F2: 39900, M1: 39500, M2: 39600, RES: 70, Mx: 5 }] }, "x", "37000N"), null, "a chainage under 100,000 is not a map position");
  assert.equal(placedFromName(t, "x", null), null); assert.equal(placedFromName(t, "x", "NoNumbers"), null);
});
