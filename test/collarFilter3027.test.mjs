// TASKS.csv #3027 (review #2876, WA iron) — the Layout collar table's 'Holes containing' read hole ids only: 'DrillholeType=DD' and
// 'hole type=Diamond (DD)' listed 0 holes. A filter with '=' is a collar-field pick taken whole, as the Atlas and the grade card read it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarTableSlice } from "../src/lib/collarTable.js";

const C = [
  { hole_id: "RHDM001", attrs: { "hole type": "Diamond (DD)", DrillholeType: "DD" } },
  { hole_id: "RHRC002", attrs: { "hole type": "Reverse circulation (RC)", DrillholeType: "RC" } },
  { hole_id: "RHDM003", attrs: { "hole type": "Diamond (DD)", DrillholeType: "DD" } },
];
const ids = (r) => r.rows.map((c) => c.hole_id);

test("field=value picks, with spaces and in any case; ids as before", () => {
  assert.deepEqual(ids(collarTableSlice(C, { filter: "DrillholeType=DD" })), ["RHDM001", "RHDM003"]);
  assert.deepEqual(ids(collarTableSlice(C, { filter: "hole type=Diamond (DD)" })), ["RHDM001", "RHDM003"]);
  assert.deepEqual(ids(collarTableSlice(C, { filter: "hole_type=reverse_circulation_(rc)" })), ["RHRC002"]);
  assert.deepEqual(ids(collarTableSlice(C, { filter: "RHDM" })), ["RHDM001", "RHDM003"]);
  assert.equal(collarTableSlice(C, { filter: "DrillholeType=AC" }).total, 0);
  assert.equal(collarTableSlice(C, {}).total, 3);
});

test("the empty table says a field pick matched no hole", () => {
  const L = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(L, /String\(el\.holeFilter\)\.includes\("="\) \? tr\("No hole has \{f\} in its collar fields\.", \{ f: el\.holeFilter \}\)/);
});
