// TASKS.csv #2399 (review #2325, WA uranium) — the gamma log's per-hole calibration table (probe, K factors, dead time, casing and water corrections,
// date logged; one row per hole, no coordinates) could only be left out. Imported as Collars it now joins onto the existing holes' attributes
// (Identify shows them), -999 and blanks left out, no hole added. SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { perHoleJoinOf, perHoleAttrs } from "../src/lib/perHoleJoin.js";
import { isNullSentinel } from "../src/lib/layers.js";

const collars = [{ hole_id: "NNA5269", x: 1, y: 2 }, { hole_id: "NNA5270", x: 3, y: 4 }];
const rows = [
  { Hole_ID: "NNA5269", Instrument: "T128", KA: 5.12, Dead_Time: 4.6, "Water Level": -999, Casing_Attenuation_A: "", Date_Logged: "2009-07-02" },
  { Hole_ID: "NNA5270", Instrument: "T125", KA: 5.3, Dead_Time: 4.4, "Water Level": 12.5, Casing_Attenuation_A: 0.82, Date_Logged: "2009-07-03" },
];

test("a no-coordinate table of existing holes, one row each, is a per-hole join", () => {
  const j = perHoleJoinOf(rows, { hole_id: "Hole_ID" }, collars);
  assert.deepEqual([j.n, j.noXY, j.columns.length], [2, true, 6]);
  assert.equal(perHoleJoinOf([...rows, { Hole_ID: "NEW1", KA: 1 }], { hole_id: "Hole_ID" }, collars), null, "a hole not in the project");
  assert.equal(perHoleJoinOf([...rows, rows[0]], { hole_id: "Hole_ID" }, collars), null, "a hole twice: not one row per hole");
  assert.equal(perHoleJoinOf(rows, { hole_id: "Hole_ID" }, []), null, "no collars");
});

test("the attributes it adds: -999 and blanks left out, text as written", () => {
  const a = perHoleAttrs(rows, "Hole_ID", isNullSentinel);
  assert.deepEqual(a.get("NNA5269"), { Instrument: "T128", KA: "5.12", Dead_Time: "4.6", Date_Logged: "2009-07-02" });
  assert.equal(a.get("NNA5270")["Water Level"], "12.5");
  assert.equal(a.get("NNA5270").Casing_Attenuation_A, "0.82");
});

test("the dialog lets it import without coordinates, and the commit merges, adding no hole", () => {
  const m = fs.readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.ok(m.includes('!(perHole?.noXY && ["x", "y", "z"].includes(f.key)) /* #2399 */'));
  const p = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /if \(noXYJoin\?\.noXY\) \{\n\s*const add = perHoleAttrs\(allRows, mapping\.hole_id, isNullSentinel\);\n\s*setCollars\(\(prev\) => prev\.map\(/);
});

test("the join runs before the required-field check (x / y are not mapped for such a table)", () => {
  const p = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.ok(p.indexOf("if (noXYJoin?.noXY) {") > 0 && p.indexOf("if (noXYJoin?.noXY) {") < p.indexOf("const missing = schema.fields.filter("));
});
