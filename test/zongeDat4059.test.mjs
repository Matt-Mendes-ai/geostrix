// TASKS.csv #4059 (found by side 2 reading a Queensland open-file IP survey) — a Zonge TQIPdb .dat (dipole-dipole, C1X C2X P1X P2X ... Res Phz SD Nstack) was not read:
// dcip.js knew no c1x / p1x columns. Its Phz is a FREQUENCY-domain IP phase in mrad, and must never be called chargeability. The line is placed from its
// header-less .utm.stn station file. Every file here is made up, with the shape of the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDcipWhitespaceText, guessDcipColumns, parseDcipRows, savedLineToFile, ipKindOfColumn, IP_KINDS, sectionTableRows, lineTagOf } from "../src/lib/dcip.js";
import { parseStationFile, fitStationLine, matchStationLine } from "../src/lib/dcipStations.js";
import { sectionModelsByMethod } from "../src/lib/sectionMerge.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const w = (v, n = 11) => String(v).padStart(n);

// a dipole-dipole line, 100 m dipoles, n = 1..4: the X columns are chainage along the line, Y holds the line's name, Z is 0
function zonge({ line = "44100N", x0 = 52600, nSt = 8, withMx = true, units = true } = {}) {
  const L = [];
  L.push(`IP DATA FROM : 130034-IP.mdb (TQIPdb  V2.10) 03/04/2013${withMx ? " Mx start = 590 Mx end = 1540" : ""}`);
  L.push(`LINE: ${line} ARRAY:DPDP DIPOLE:100.0  UNITS:${units ? "M" : "FT"}`);
  L.push(["C1X", "C2X", "P1X", "P2X", "C1Z", "C2Z", "P1Z", "P2Z", "C1Y", "C2Y", "P1Y", "P2Y", "RxDipole", "PltPt", "Nlevel", "SP", "I", "Vp", "Res", "Phz", "SD", "Nstack"].map((h) => w(h)).join(" "));
  const y = String(parseInt(line, 10));
  for (let n = 1; n <= 4; n++) for (let s = 0; s < nSt; s++) {
    const c2 = x0 + s * 100, c1 = c2 + 100, p1 = c1 + 100 * n, p2 = p1 + 100;
    L.push([c1, c2, p1, p2].map((v) => w(v.toFixed(1))).join(" ") + " " + ["0.00", "0.00", "0.00", "0.00"].map((v) => w(v)).join(" ") + " " + [y, y, y, y].map((v) => w(v)).join(" ")
      + " " + [w("100.0"), w(((c1 + p2) / 2).toFixed(2)), w(n.toFixed(1)), w("-47.100"), w("3.200"), w((11.286 / n).toFixed(4)), w((5.32 * n).toFixed(2)), w((1.36 + s * 0.2).toFixed(2)), w("0.0650"), w(4)].join(" "));
  }
  return L.join("\r\n") + "\r\n";
}

test("the Zonge columns are read: c1x / c2x / p1x / p2x as the electrodes, Res, Phz as IP PHASE, SD as the error", () => {
  const t = parseDcipWhitespaceText(zonge());
  assert.ok(t, "the header is found");
  assert.equal(t.rows.length, 32);
  const m = guessDcipColumns(t.headers);
  assert.deepEqual([m.a, m.b, m.m, m.n, m.rho, m.ip, m.err], ["C1X", "C2X", "P1X", "P2X", "Res", "Phz", "SD"]);
  assert.equal(m.phase, undefined, "the phase column is the IP column, not a second field");
  const p = parseDcipRows(t.rows, m);
  assert.equal(p.readings.length, 32); assert.equal(p.array, "dipole-dipole (or any 4-electrode array)");
  assert.equal(p.ipKind, "phase"); assert.equal(p.ip.length, 32); assert.ok(Math.abs(p.ip[0] - 1.36) < 1e-9);
  assert.equal(p.spacing, 100); assert.deepEqual(p.span, [52600, 53900]);
  assert.equal(lineTagOf(zonge()), "44100N");
  // the 2012 files have no 'Mx start / end' part on their first line
  assert.ok(parseDcipWhitespaceText(zonge({ withMx: false })));
});

test("a chargeability column stays a chargeability; the kind follows the column, also from a saved line", () => {
  assert.equal(ipKindOfColumn("Phz"), "phase"); assert.equal(ipKindOfColumn("Phase (mrad)"), "phase"); assert.equal(ipKindOfColumn("IP phase (mrad)"), "phase");
  assert.equal(ipKindOfColumn("MX"), "chargeability"); assert.equal(ipKindOfColumn("Chargeability"), "chargeability"); assert.equal(ipKindOfColumn(null), "chargeability");
  assert.deepEqual(guessDcipColumns(["T1X", "T2X", "R1X", "R2X", "RHO", "MX"]).ip, "MX");
  assert.equal(guessDcipColumns(["C1X", "C2X", "P1X", "P2X", "Res", "Phz", "MX"]).ip, "MX", "with both, the chargeability is the IP column");
  assert.equal(IP_KINDS.phase.unit, "mrad"); assert.equal(IP_KINDS.chargeability.unit, "mV/V");
  const t = parseDcipWhitespaceText(zonge()), p = parseDcipRows(t.rows, guessDcipColumns(t.headers));
  const saved = savedLineToFile({ name: "L", readings: p.readings, rho: p.rho, ip: p.ip, ipKind: "phase" });
  assert.deepEqual(saved.file.headers.slice(4), ["Apparent resistivity", "IP phase (mrad)"]);
  assert.equal(parseDcipRows(saved.file.rows, saved.mapping).ipKind, "phase", "the kind survives a save and reopen");
  const back = savedLineToFile({ name: "L", readings: p.readings, rho: p.rho, ip: p.ip });
  assert.equal(parseDcipRows(back.file.rows, back.mapping).ipKind, "chargeability");
  const geom = { at: (s) => [s, 0] };
  const cells = { s: [0, 100], z: [1, 2], ds: [100, 100], dz: [10, 10], resistivity: [50, 60], support: [1, 0.5], chargeability: [1.5, 2.5] };
  assert.ok("ip_phase_mrad" in sectionTableRows({ cells }, geom, null, "phase")[0]); assert.ok(!("chargeability_mVV" in sectionTableRows({ cells }, geom, null, "phase")[0]));
  assert.ok("chargeability_mVV" in sectionTableRows({ cells }, geom)[0]);
});

test("the .utm.stn station file has no header: station, map east, map north, elevation; the line is placed from it", () => {
  // an east-west line: east = station + 400000; a north-south line whose stations drift east
  const ew = Array.from({ length: 10 }, (_, i) => `${52600 + i * 100}\t${452600 + i * 100}\t7544100\t${(247 + i * 0.5).toFixed(2)}`).join("\r\n") + "\r\n";
  const r = parseStationFile(ew, "Line_44100N.utm.stn");
  assert.deepEqual(Object.keys(r.lines), ["44100N"]); assert.equal(r.lines["44100N"].length, 10);
  assert.equal(r.lines["44100N"][3].s, 52900); assert.equal(r.lines["44100N"][3].x, 452900); assert.equal(r.lines["44100N"][3].y, 7544100); assert.equal(r.lines["44100N"][3].z, 248.5);
  const fit = fitStationLine(r.lines["44100N"]);
  assert.ok(Math.abs(fit.azimuth - 90) < 1e-6 && Math.abs(fit.scale - 1) < 1e-9);
  assert.equal(matchStationLine(Object.keys(r.lines), "Line_44100N.dat"), "44100N");
  const ns = Array.from({ length: 10 }, (_, i) => `${9500 + i * 100}\t${459000 + i * 4 + (i % 2)}\t${7544000 + i * 100}\t250.00`).join("\n");
  const n = parseStationFile(ns, "Line_49000E.utm.stn");
  assert.equal(n.lines["49000E"].length, 10); assert.ok(Math.abs(fitStationLine(n.lines["49000E"]).azimuth - 2.3) < 1.2, "the stations are not on a straight N-S line: the fit follows the file, not an offset");
  // an elevation column of zeros is no elevation
  assert.equal(parseStationFile(ew.replace(/\t[\d.]+(\r\n)/g, "\t0$1"), "x.utm.stn").lines.x[0].z, null);
  // the plain .stn is on the local grid: refused, saying which file to use
  const local = Array.from({ length: 10 }, (_, i) => `${52600 + i * 100}\t${52600 + i * 100}\t44100\t0`).join("\n");
  assert.throws(() => parseStationFile(local, "Line_44100N.stn"), /on a local grid, not in map coordinates: use the station file that is in map coordinates \(Zonge's \.utm\.stn\)/);
  // the files that were readable before still are
  assert.ok(parseStationFile("STN,X,Y,Z\n0,100000,5000000,10\n100,100100,5000000,11\n", "a.csv").lines[""]);
  assert.throws(() => parseStationFile("not a station file\nat all\n", "b.txt"), /has no line stations GeoStrix can read/);
});

test("merging lines: a phase model and a chargeability model are never one group", () => {
  const cell = [{ x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 5, value: 1 }];
  const mk = (method, property) => ({ method, property, cells: cell, merged: false });
  const by = sectionModelsByMethod([mk("ip", "Chargeability (mV/V)"), mk("ip", "IP phase (mrad)"), mk("ip", "IP phase (mrad)"), mk("dc", "Resistivity (ohm·m)")]);
  assert.equal(by.ip.length, 1); assert.equal(by.ipp.length, 2); assert.equal(by.dc.length, 1);
  const d3 = read("../src/components/Dcip3dPanel.jsx");
  assert.match(d3, /phase \? tr\("IP phase"\) : tr\("chargeability"\)/); assert.match(d3, /cells: addedText\(made, cut, phaseIp\)/);
  assert.match(d3, /const withIp = linesHaveIp\(chosen\.map\(\(p\) => p\.l\)\) && !mixedIp;/);
  assert.match(read("../src/components/DcipMergePanel.jsx"), /ipp: \{ label: "IP phase", unit: "mrad"/);
});

test("the colour scale of a phase pseudosection carries mrad, a chargeability one mV/V", async () => {
  const { pseudoColourScale } = await import("../src/lib/pseudosectionPlot.js");
  assert.equal(pseudoColourScale([1, 2, 3], "chargeability", 24, "mrad").unit, "mrad");
  assert.equal(pseudoColourScale([1, 2, 3], "chargeability").unit, "mV/V");
  assert.equal(pseudoColourScale([1, 2, 3], "resistivity", 24, "mrad").unit, "ohm·m");
});

test("wired: the panel names the IP column for what it is, says so in its notice, keeps the kind with the line; keys in every language", () => {
  const p = read("../src/components/DcipPanel.jsx");
  assert.match(p, /ipKind/);
  assert.match(p, /IP phase/);
  for (const k of ["{name} gives the stations on a local grid, not in map coordinates: use the station file that is in map coordinates (Zonge's .utm.stn)."])
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
