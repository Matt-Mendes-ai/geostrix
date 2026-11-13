// TASKS.csv #2021 (a re-imported log keeps its layer, never an all-blank value), #2022 (a mineral list is one class however it is ordered),
// #2025 (a zip's other members named), #2215 (a description's passing word picks no pattern), #2311 (the atlas option names what it draws)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { skipBlankValue, mineralListValue, zipOthersNote } from "../src/lib/viewer/importHelpers.js";
import { leadOf, patternForUnit } from "../src/lib/lithoPatterns.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("#2021 a value column blank on every row is not preselected", () => {
  const rows = [{ hole: "A", from: 0, to: 1, style_value: "", unit: "BAS" }, { hole: "A", from: 1, to: 2, style_value: " ", unit: "AND" }];
  const m = skipBlankValue({ hole_id: "hole", from: "from", to: "to", value: "style_value" }, ["hole", "from", "to", "style_value", "unit"], rows);
  assert.equal(m.value, "unit");
  // a filled value stays; nothing else filled: unchanged
  assert.equal(skipBlankValue({ value: "unit" }, ["unit"], rows).value, "unit");
  assert.equal(skipBlankValue({ hole_id: "hole", value: "style_value" }, ["hole", "style_value"], rows).value, "style_value");
  const src = read("../src/modules/viewer/useImportPipeline.js");
  assert.match(src, /const m = skipBlankValue\(mapping, headers, rows\);\s*return ov \? \{ target, mapping: m, guessNote: ov \} : \{ target, mapping: m \};/);
});

test("#2022 a mineral list is sorted and de-duplicated; a single mineral is unchanged", () => {
  assert.equal(mineralListValue("Cpy; Py"), "Cpy; Py");
  assert.equal(mineralListValue("Py; Cpy"), "Cpy; Py");
  assert.equal(mineralListValue("Py; Py"), "Py");
  assert.equal(mineralListValue("Py; Cpy; Py"), "Cpy; Py");
  assert.equal(mineralListValue("py, Cpy ,PY"), "Cpy; py");
  assert.equal(mineralListValue("Py"), "Py");
  assert.equal(mineralListValue(""), "");
  assert.match(read("../src/modules/viewer/useImportPipeline.js"), /if \(target === "mnlgy" && !numeric\) \{ const l = mineralListValue\(r\.value\); if \(l !== r\.value\) \{ r\.as_logged = r\.value; r\.value = l; \} \}/);
});

test("#2025 a zip's members other than the shapefile are named", () => {
  const n = zipOthersNote("2024 EZ Gamma Surveyed Drillholes.zip", "Drillholes", ["Drillholes.shp", "Drillholes.dbf", "Drillholes.shx", "Drillholes.prj", "Drillholes.cpg", "Drillholes.qmd", "2024 Surveyed Drillholes.csv", "__MACOSX/._x", "sub/"]);
  assert.match(n, /Read the shapefile "Drillholes" from inside 2024 EZ Gamma Surveyed Drillholes\.zip\. Not read from it: 2024 Surveyed Drillholes\.csv\./);
  assert.doesNotMatch(n, /qmd|MACOSX/);
  assert.doesNotMatch(zipOthersNote("a.zip", "A", ["A.shp", "A.dbf"]), /Not read/);
  assert.match(read("../src/lib/viewer/importHelpers.js"), /if \(parsed\.zipMembers\) note \+= zipOthersNote\(file\.name, parsed\.layerName, parsed\.zipMembers\);/);
});

test("#2215 only the description's lead (its rock name) picks a pattern", () => {
  assert.equal(leadOf("Schist with minor quartz veining"), "Schist");
  assert.equal(patternForUnit("SCP", "", "Schist with minor quartz veining"), 705); // was 732 Quartz
  assert.equal(patternForUnit("ISY", "", "Intermediate intrusive, dyke-like"), null); // was 721
  assert.equal(patternForUnit("X", "", "Basalt. Quartz veins common"), 717);
  assert.equal(patternForUnit("VANSS", "", "Fg And V-clast, mod perv propy alt"), 711); // 'And' is andesite, not a split
  assert.equal(patternForUnit("VANAB", "", "polymictic and. breccia wt/ varying degrees of alt"), 715); // an abbreviation's full stop
  assert.equal(patternForUnit("QV", "", "anything"), 732); // a recognised code still wins
});

test("#2311 the atlas option names what it draws", () => {
  assert.match(read("../src/components/GenerateAtlasModal.jsx"), /Add a strip log image to each page \(the logs that hole has: lithology, alteration, veins, RQD …\)/);
});
