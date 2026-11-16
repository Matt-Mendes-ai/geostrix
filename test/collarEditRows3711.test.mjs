// TASKS.csv #3711 — the collar table has one column per collar field, never an attrs object, and a save puts the fields back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarFieldColumns, collarsToEditRows, editRowsToCollars } from "../src/lib/collarEditRows.js";

const collars = [
  { hole_id: "A1", x: 1, y: 2, z: 3, length: 100, azimuth: 90, dip: -60, attrs: { hole_type: "DDH", year: 2023, prospect: "Boundary South" } },
  { hole_id: "A2", x: 4, y: 5, z: 6, length: 80, attrs: { hole_type: "RC", year: 2019, length: "legacy" } },
  { hole_id: "A3", x: 7, y: 8, z: 9 },
];

test("one column per field, own columns first; a field named like an own column is told apart; no attrs", () => {
  const cols = collarFieldColumns(collars);
  assert.deepEqual(cols.map((c) => c.column), ["hole_type", "year", "prospect", "length (field)"]);
  const rows = collarsToEditRows(collars);
  assert.ok(rows.every((r) => !("attrs" in r)));
  assert.equal(rows[0].hole_type, "DDH");
  assert.equal(rows[0].year, 2023);
  assert.equal(rows[1]["length (field)"], "legacy");
  assert.equal(rows[1].length, 80, "the collar's own length stays");
  assert.equal(rows[2].hole_type, "", "a hole with none is blank");
  assert.equal(rows[2].hole_id, "A3");
  assert.ok(!JSON.stringify(rows).includes("[object Object]"));
});

test("a save: the columns go back into attrs, edits included; blanks are no field; own values untouched", () => {
  const rows = collarsToEditRows(collars);
  rows[0].year = 2024; rows[0].prospect = ""; rows[2].hole_type = "DD"; rows[1].length = 85;
  const out = editRowsToCollars(rows, collars);
  assert.deepEqual(out[0].attrs, { hole_type: "DDH", year: 2024 });
  assert.deepEqual(out[1].attrs, { hole_type: "RC", year: 2019, length: "legacy" });
  assert.deepEqual(out[2].attrs, { hole_type: "DD" });
  assert.equal(out[1].length, 85);
  assert.equal(out[0].x, 1);
  assert.ok(out.every((c) => !Object.keys(c).some((k) => k.endsWith("(field)"))));
  // nothing edited: the same collars (an absent attrs stays absent)
  assert.deepEqual(editRowsToCollars(collarsToEditRows(collars), collars), collars);
});

test("wiring: the table gets the rows and saves through the lib", () => {
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /collarsToEditRows\(collars\)\.map\(dipShown\)/);
  assert.match(vm, /setCollars\(editRowsToCollars\(newRows\.map\(dipStored\), collars\)\)/);
});
