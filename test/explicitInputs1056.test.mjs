// TASKS.csv #1056 — an explicit surface's export header names every kind of input the fit used
import { test } from "node:test";
import assert from "node:assert/strict";
import { provenanceLines } from "../src/lib/meshExport.js";

test("#1056 image lines, DXF strings and the downhole dip guide are named in the export stamp", () => {
  const l = provenanceLines("Top", { tool: "explicit surface (thin-plate spline exactly through hand-picked contacts)", picks: 4, sectionLines: 0, points: 214,
    drawnLines: 2, importedLines: 1, downholeGuide: { lines: 8, picksMatched: 4, windowM: 3, reachM: 25, type: "contact", constructed: true } }).join("\n");
  assert.match(l, /2 line\(s\) digitized on section images/);
  assert.match(l, /1 string\(s\) imported from DXF/);
  assert.match(l, /8 downhole dip guide line\(s\) through 4 pick\(s\), from contact \/ bedding measurements within 3 m, 25 m along dip and strike \(CONSTRUCTED, not observed\)/);
  assert.ok(!/Other parameters/.test(l), l); // all three are construction keys, not dumped raw
});

test("#1056 a surface without them says nothing extra", () => {
  const l = provenanceLines("Top", { tool: "explicit surface (thin-plate spline exactly through hand-picked contacts)", picks: 4, sectionLines: 0, points: 4, drawnLines: 0, importedLines: 0, downholeGuide: null }).join("\n");
  assert.ok(!/digitized|imported from DXF|downhole/.test(l), l);
});
