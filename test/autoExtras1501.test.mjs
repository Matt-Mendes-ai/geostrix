// TASKS.csv #1501 — an auto-committed log keeps its other columns, and a Geotech table fills Recovery % too
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoExtraFields, companionLayer } from "../src/lib/viewer/autoExtras.js";
import { guessMapping } from "../src/lib/layers.js";

const geoHeaders = ["Hole ID", "From", "To", "Length", "Recovery (m)", "Recovery %", "RQD (m)", "RQD %"];
const geoRows = Array.from({ length: 50 }, (_, i) => ({ "Hole ID": "H1", From: String(i * 3), To: String(i * 3 + 3), Length: "3", "Recovery (m)": "2.7", "Recovery %": "90", "RQD (m)": "0.7", "RQD %": "22.5" }));

test("Geotech: RQD % is the layer's value, Recovery % fills its own layer, the rest travel as numbers", () => {
  const m = guessMapping("geotech", geoHeaders);
  assert.equal(m.value, "RQD %");
  const comp = companionLayer("geotech", geoHeaders);
  assert.deepEqual(comp, { target: "recovery", column: "Recovery %" });
  const extras = autoExtraFields(geoHeaders, geoRows, m, { exclude: [comp.column] });
  assert.deepEqual(extras.map((f) => [f.column, f.type]), [["Length", "number"], ["Recovery (m)", "number"], ["RQD (m)", "number"]]);
  assert.equal(companionLayer("litho", geoHeaders), null);
});

test("structures and veins: width as a number, descriptions as text of any length; a reserved name is renamed", () => {
  const headers = ["Hole ID", "Depth", "Alpha", "Beta", "Width (cm)", "Description", "Type"];
  const rows = Array.from({ length: 150 }, (_, i) => ({ "Hole ID": "H1", Depth: String(i), Alpha: "40", Beta: "120", "Width (cm)": String(i % 7), Description: `fracture ${i} with chlorite`, Type: "VN" }));
  const extras = autoExtraFields(headers, rows, { hole_id: "Hole ID", depth: "Depth", alpha: "Alpha", beta: "Beta" });
  assert.deepEqual(extras.map((f) => [f.column, f.name, f.type]), [["Width (cm)", "Width (cm)", "number"], ["Description", "Description", "category"], ["Type", "Type (file)", "category"]]);
});

test("wired: the unseen commit passes them, fills the companion layer and says so", () => {
  const p = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(p, /commitImportData\(\{ \.\.\.modalData, customFields: extras, unseen: true \}\)/);
  assert.match(p, /if \(comp\) commitImportData\(\{ \.\.\.modalData, target: comp\.target, mapping: \{ \.\.\.mapping, value: comp\.column \}/);
  assert.match(p, /kept \{n\} more column\(s\) with each row/);
});
