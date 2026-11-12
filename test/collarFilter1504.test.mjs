// TASKS.csv #1504 — the collar file's year / drill type / prospect are kept on each hole (attrs) but nothing could pick holes by them
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarsMatching, collarAttrChoices } from "../src/lib/holeFilter.js";

const collars = [
  { hole_id: "21CCDD050", attrs: { year: "2021", drill_type: "DD", zone: "CC", core: "deep core" } },
  { hole_id: "21CCRC024", attrs: { year: "2021", drill_type: "RC", zone: "CC" } },
  { hole_id: "22AGBDD003", attrs: { year: "2022", drill_type: "DD", zone: "AGB" } },
  { hole_id: "22DRDD019", attrs: { year: "2022", drill_type: "DD", zone: "DR-PX" } },
];
const ids = (f) => collarsMatching(collars, f).map((c) => c.hole_id);

test("field=value terms pick by a collar attribute; several must all match; id parts still work", () => {
  assert.deepEqual(ids("drill_type=RC"), ["21CCRC024"]);
  assert.deepEqual(ids("YEAR=2022 Drill_Type=dd"), ["22AGBDD003", "22DRDD019"]);
  assert.deepEqual(ids("zone=dr-px"), ["22DRDD019"]); // the whole value
  assert.deepEqual(ids("core=deep_core"), ["21CCDD050"]); // '_' for a space, as the picker writes it
  assert.deepEqual(ids("21CC, 22DR"), ["21CCDD050", "21CCRC024", "22DRDD019"]);
  assert.deepEqual(ids("21 drill_type=DD"), ["21CCDD050"]);
  assert.deepEqual(ids("status=active"), []); // a field no hole has
  assert.equal(ids("").length, 4);
});

test("the picker offers fields with 2 to 30 values", () => {
  const ch = collarAttrChoices(collars);
  assert.deepEqual(ch.map((c) => c.key).sort(), ["drill_type", "year", "zone"]);
  assert.deepEqual(ch.find((c) => c.key === "zone").values, ["AGB", "CC", "DR-PX"]);
  const bar = readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8");
  // #1703 — through holesForFilter: collarsMatching first, then text in a collar field when no hole id matched
  assert.match(bar, /const found = holesForFilter\(collars, filter\);/);
  assert.match(bar, /const shown = found\.holes\.map\(\(c\) => c\.hole_id\);/);
  assert.match(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /const tickedShown = \(collars, f\) => holesForFilter\(collars, f\)\.holes;/);
});
