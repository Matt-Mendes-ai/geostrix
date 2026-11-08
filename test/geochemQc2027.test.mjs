// TASKS.csv #2027 (review #2013, Woodjam) — Geochem leaves QC inserts (standards, blanks, duplicates) out of its diagrams, its
// classifications and the plot-data CSV, says how many, and has a tick to plot them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyQAQCRow, setKnownHoleIds } from "../src/lib/qaqc.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the rule the module uses: a certificate's standard / blank / duplicate is not regular; a drill sample is", () => {
  setKnownHoleIds(new Set(["DH24-119"]));
  assert.equal(classifyQAQCRow({ hole_id: "DH24-119", from: 72, to: 74 }), "regular");
  assert.notEqual(classifyQAQCRow({ hole_id: "DH24-119", from: 74, to: 74, sample_type: "STD" }), "regular");
  assert.notEqual(classifyQAQCRow({ hole_id: "DH24-119", from: 74, to: 74, sample_type: "Blank" }), "regular");
});

test("plots, classification, plot-data export and the footer all leave them out; the tick brings them back to the plots", () => {
  const g = read("src/modules/GeochemModule.jsx");
  assert.match(g, /const sourceRows = useMemo\(\(\) => \(plotQc \|\| !qcInSource \? sourceAll : sourceAll\.filter\(\(a\) => classifyQAQCRow\(a\) === "regular"\)\)/);
  assert.match(g, /const labRows = labAll\.filter\(\(a\) => classifyQAQCRow\(a\) === "regular"\), qcLeft = labAll\.length - labRows\.length;/);
  assert.match(g, /were left out of the classification: they are not rock samples\./);
  assert.match(g, /const rows = diagramExportRows\(plotted, diagram, elementUnits\);/);
  assert.match(g, /qcInSource && !plotQc \? " " \+ tr\("\{k\} QC insert\(s\) \(standards, blanks, duplicates\) left out\."/);
  assert.match(g, /<input type="checkbox" checked=\{!!plotQc\} onChange=\{\(e\) => setPlotQc\(e\.target\.checked\)\} \/>\{tr\("Plot the \{n\} QC insert\(s\)"/);
  // the pXRF counts are taken against the source rows BEFORE the QC filter (or the QC inserts would be counted as pXRF)
  assert.match(g, /tr\("\{k\} pXRF reading\(s\) left out: lab assays only\.", \{ k: \(assays\.length - sourceAll\.length\)/);
});
