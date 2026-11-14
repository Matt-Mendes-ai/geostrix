// TASKS.csv #3320 (Galore Creek review: the contractor's DC / IP reading file was read by Point survey as points, its geometric factor k imported
// as 'Radiometrics: K' in per cent; Import CSV and DC / IP Import line opened a picker over one column; Load the line stations said nothing) —
// tableRefusal says what a parsed table is not and what the button reads.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tableRefusal, electrodeColumns } from "../src/lib/tableRefusal.js";

test("a DC / IP reading file (Tx / Rx electrode columns) is refused by Point survey, with the way to read it", () => {
  const cols = ["TxFile", "Tx1East", "Tx1North", "Tx1Elev", "Tx2East", "Tx2North", "Rx1East", "Rx1North", "Rx1Elev", "Rx2East", "Rx2North", "k", "Rho", "Mx"];
  assert.deepEqual(electrodeColumns(cols), ["Tx1East", "Tx1North", "Tx1Elev", "Tx2East", "Tx2North", "Rx1East", "Rx1North", "Rx1Elev", "Rx2East", "Rx2North"]);
  const r = tableRefusal("GaloreCreekExt2023_100mDP_dias_2D.DAT", cols, [], "point");
  assert.match(r, /^"GaloreCreekExt2023_100mDP_dias_2D\.DAT" is a DC \/ IP reading file \(electrode position columns: Tx1East, Tx1North, Tx1Elev, Tx2East, …\), not a table of points/);
  assert.match(r, /GeoStrix has no reader for this electrode layout yet\. Point survey reads CSV and Geosoft \.xyz tables/);
  assert.match(tableRefusal("a.csv", ["C1_E", "C1_N", "C1_Z", "P1_E", "P1_N", "V"], [], "point"), /Read it with DC \/ IP › Read a 3D array file\./);
  assert.match(tableRefusal("8575E.dat", ["T1X", "T2X", "R1X", "R2X", "RHO", "MX"], [], "point"), /Read it with DC \/ IP › Import line \(CSV \/ \.dat\)\./);
  assert.equal(tableRefusal("8575E.dat", ["T1X", "T2X", "R1X", "R2X", "RHO", "MX"], [], "dcipLine"), null, "DC / IP Import line reads it");
  assert.match(tableRefusal("Ext.DAT", cols, [], "dcipLine"), /^"Ext\.DAT" is a 3D DC \/ IP reading file \(electrode positions in east \/ north: Tx1East, Tx1North, Tx2East, Tx2North, …\), not a line along a profile\./);
});

test("one column: not a table this button can read, said with its first words; a real survey table passes", () => {
  const one = tableRefusal("x.DAT", ["Galore Creek 2023 DC/IP survey 100 m dipole-dipole"], [], "point");
  assert.match(one, /^"x\.DAT" does not split into columns here \(one column: "Galore Creek 2023 DC\/IP survey 100 m dipole-dipole…"\), so it is not a table this button can read\. Point survey reads/);
  assert.match(tableRefusal("x.DAT", ["junk"], [], "dcipLine"), /Import line reads a CSV, a contractor TDIP \.dat \/ \.ipg or a Res2DInv \.dat/);
  assert.equal(tableRefusal("IP.xyz", ["X", "Y", "Z", "AppMx"], [], "point"), null);
  assert.equal(tableRefusal("mag.csv", ["Easting", "Northing", "Elev", "TMI", "Line"], [], "point"), null);
  assert.equal(tableRefusal("grid.xyz", ["E", "N", "Z", "value"], [], "point"), null, "E / N / Z alone are not electrodes");
});

test("wired: the .xyz picker (streamed and whole), Import CSV, DC / IP Import line and Load the line stations", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((g.match(/tableRefusal\(file\.name, (columns|t\.headers), (sample|parsedRows|t\.rows), "point"\)/g) || []).length, 3);
  const d = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(d, /r = !\(g0\.a && g0\.m\) \? tableRefusal\(f\.name, t\.headers, t\.rows, "dcipLine"\) : null/);
  assert.match(d, /if \(!keys\.length\) \{ setMsg\(\{ ok: false, text: tr\("\\"\{name\}\\" has no line stations in it:/);
});
