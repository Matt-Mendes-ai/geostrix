// TASKS.csv #2717 — the collar table takes collar fields as extra columns; a new table takes the hole type by default
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarTableFieldChoices, defaultCollarTableFields } from "../src/lib/collarTable.js";

const collars = [
  { hole_id: "A1", attrs: { hole_type: "AC", programme: "2019", note: "n1" } },
  { hole_id: "A2", attrs: { hole_type: "AC", programme: "2020", note: "n2" } },
  { hole_id: "D1", attrs: { hole_type: "DD", programme: "2020", note: "n3" } },
];

test("the categorical collar fields are offered; the hole type is the default", () => {
  assert.deepEqual(collarTableFieldChoices(collars), ["hole_type", "programme", "note"]);
  assert.deepEqual(defaultCollarTableFields(collars), ["hole_type"]);
  assert.deepEqual(defaultCollarTableFields([{ hole_id: "X", attrs: { programme: "a" } }, { hole_id: "Y", attrs: { programme: "b" } }]), []);
  assert.deepEqual(defaultCollarTableFields([{ hole_id: "X", attrs: { "Hole Type": "RC" } }, { hole_id: "Y", attrs: { "Hole Type": "DD" } }]), ["Hole Type"]);
});

test("wired: the columns, each row's values, the sidebar and the default on insert", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /tr\("Depth \(m\)"\), \.\.\.extra\];/);
  assert.match(m, /f\(c\.length, 1\), \.\.\.extra\.map\(\(k\) => String\(c\.attrs\?\.\[k\] \?\? ""\)\.trim\(\)\)\]\);/);
  assert.match(m, /const f = defaultCollarTableFields\(collars\); if \(f\.length\) base\.extraCols = f;/);
  assert.match(m, /updateSelected\(\{ extraCols: e\.target\.checked \?/);
});
