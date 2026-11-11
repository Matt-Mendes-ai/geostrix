// TASKS.csv #2020 — 3850_all.dat stayed unplaced although its header says LINE:3850E and the GPS file names its stations; the message gave no
// hint of the line names the station file holds
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineTagOf } from "../src/lib/dcip.js";
import { linePlacement } from "../src/lib/dcipStations.js";

test("the header's line tag", () => {
  assert.equal(lineTagOf("DATATYPE:TDIP\nLINE:3850E\nUNITS:m\nC1 P1 P2 RHO MX"), "3850E");
  assert.equal(lineTagOf("Line = 4250N\n..."), "4250N");
  assert.equal(lineTagOf("A,B,M,N,RHO\n0,25,50,75,100"), null);
  assert.equal(lineTagOf("PIPELINE: 3\n"), null); // a word ending in 'line' is not the tag
});

test("a file name that matches no station line is placed by its tag", () => {
  const stations = Array.from({ length: 6 }, (_, i) => ({ s: i * 100, x: 613000 + i * 100, y: 5781400, z: 1000 }));
  const files = [{ name: "GreatPlainsGPS.txt", lines: { "3850E": stations }, epsg: null }];
  const to = (x, y) => [x, y];
  assert.equal(linePlacement("3850_all", files, to), null);
  const p = linePlacement("3850E", files, to);
  assert.ok(p && p.stations.line === "3850E", JSON.stringify(p));
});

test("the import tries the tag and lists the station file's lines when a line stays unplaced", () => {
  const src = readFileSync(new URL("../src/components/DcipPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /linePlacement\(name, files, to\) \|\| \(p\.lineTag \? linePlacement\(p\.lineTag, files, to\) : null\)/);
  assert.match(src, /tr\("The station file\(s\) name these lines: \{lines\}\."/);
});
