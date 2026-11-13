// TASKS.csv #3196 (#3195, Galore Creek) — -999 was read as 999 ppm over the upper limit in columns whose real maximum sits just under 999 (Mo 947,
// Ce 650, La 690, Ni 767): an all-nines code is a no-data sentinel, never an upper limit. And a corrected re-import now clears an earlier value
// where the new file says the element has none (a no-data code or 'NA'), so the false 999s do not survive it. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isOverLimitCode, readAssayCell, mergeAssayRows } from "../src/lib/geochem.js";
import { columnNegatives, negativeSummary } from "../src/lib/assayColumnScan.js";

test("an all-nines code is never over the upper limit; a round lab limit still is", () => {
  for (const [code, max] of [[-999, 947], [-999, 650], [-99, 95], [-9999, 9500], [-99.9, 60]]) assert.equal(isOverLimitCode(code, max), false, `${code} at max ${max}`);
  for (const [code, max] of [[-10, 9.8], [-100, 99.5], [-10000, 9200], [-1000, 1000]]) assert.equal(isOverLimitCode(code, max), true, `${code} at max ${max}`);
  assert.deepEqual(readAssayCell(-999, "bdl", 947, null, 947), { value: null, qualifier: null, kind: "neg_missing" });
  assert.deepEqual(readAssayCell("-999", "bdl", 650, null, 650), { value: null, qualifier: null, kind: "neg_missing" });
  assert.deepEqual(readAssayCell(-10, "bdl", 9.8, null, 9.8), { value: 10, qualifier: ">", kind: "neg_over" }, "the over-limit reading is kept for real limits");
});

test("the dialog counts -999 in a column topping out at 947 as not assayed, not over the limit", () => {
  // a Mo column: values to 947, and -999 in 172 rows; an Au column with a real '> 10' code
  const mo = { max: 947, negs: Array(172).fill(-999) }, au = { max: 9.8, negs: [-10, -10, -0.005] };
  assert.deepEqual([columnNegatives(mo).over, columnNegatives(mo).sentinels], [0, 172]);
  assert.deepEqual([columnNegatives(au).over, columnNegatives(au).codes], [2, 1]);
  const sum = negativeSummary(new Map([["Mo_ppm", mo], ["Au_ppm", au]]), ["Mo_ppm", "Au_ppm"]);
  assert.equal(sum.overAny, 2);
  assert.deepEqual(sum.overCols, ["Au_ppm -10 (×2)"]);
  assert.deepEqual(sum.sentinelCols, ["Mo_ppm: -999 ×172"]);
});

test("a re-import clears an element the new file says has no value; a blank cell clears nothing", () => {
  const prev = [{ hole_id: "H1", from: 0, to: 2, source: "assay", values: { Mo: 999, Cu: 1200 }, qualifiers: { Mo: ">" } }, { hole_id: "H1", from: 2, to: 4, source: "assay", values: { Mo: 999, Cu: 800 }, qualifiers: { Mo: ">" } }];
  const incoming = [
    { hole_id: "H1", from: 0, to: 2, source: "assay", values: { Cu: 1200 }, cleared: ["Mo"] }, // -999 in the corrected file: Mo has no value
    { hole_id: "H1", from: 2, to: 4, source: "assay", values: { Cu: 810 } }, // Mo blank in this file: the earlier Mo stays
    { hole_id: "H1", from: 4, to: 6, source: "assay", values: { Cu: 50 }, cleared: ["Mo"] }, // a new interval: stored without the marker
  ];
  const { rows } = mergeAssayRows(prev, incoming);
  assert.deepEqual(rows[0], { hole_id: "H1", from: 0, to: 2, source: "assay", values: { Cu: 1200 } });
  assert.deepEqual(rows[1].values, { Mo: 999, Cu: 810 });
  assert.deepEqual(rows[1].qualifiers, { Mo: ">" });
  assert.deepEqual(rows[2], { hole_id: "H1", from: 4, to: 6, source: "assay", values: { Cu: 50 } });
  assert.ok(rows.every((r) => !("cleared" in r)));
  // a value in the new file wins over the marker (an element read from another method column)
  const r2 = mergeAssayRows(prev, [{ hole_id: "H1", from: 0, to: 2, source: "assay", values: { Mo: 12 }, cleared: ["Mo"] }]).rows[0];
  assert.equal(r2.values.Mo, 12);
  // other method results of a cleared element go with it
  const r3 = mergeAssayRows([{ ...prev[0], methodValues: { Mo: { Mo_ICP: 999 } } }], [{ hole_id: "H1", from: 0, to: 2, source: "assay", values: {}, cleared: ["Mo"] }]).rows[0];
  assert.equal(r3.methodValues, undefined);
});

test("the assay import marks the elements a row reads as no-data or not assayed", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /\} else if \(kind === "neg_missing" \|\| kind === "na_text"\) cleared\.push\(e\.symbol\);/);
  assert.match(g, /if \(cleared\.length\) out\.cleared = cleared;/);
});
