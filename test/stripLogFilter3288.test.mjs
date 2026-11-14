// TASKS.csv #3288 (#3241) — the strip log's log tracks apply the log's valid range and despike, as Downhole logs / Estimation do (filterLogRows). SYNTHETIC log.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filterLogRows } from "../src/lib/numericSources.js";
const rows = [0, 1, 2, 3, 4, 5].map((d, i) => ({ hole_id: "H1", from: d, to: d + 1, value: [10, 11, 9999, 12, -821754, 11][i] }));
test("out-of-range readings are left out and counted; the despike takes a lone spike to its neighbours' level", () => {
  const a = filterLogRows(rows, { range: [0, 5000] });
  assert.equal(a.rows.length, 4); assert.equal(a.outOfRange, 2); assert.deepEqual(a.validRange, [0, 5000]);
  const b = filterLogRows(rows, { range: [0, 20000], despikeM: 3 });
  assert.equal(b.outOfRange, 1); assert.ok(b.rows.every((r) => r.value < 100), JSON.stringify(b.rows.map((r) => r.value)));
  assert.equal(rows[2].value, 9999, "the input rows are not edited");
});
test("no filter: the rows as they are; a missing value is kept as is", () => {
  const same = filterLogRows(rows, null);
  assert.equal(same.rows.length, 6); assert.equal(same.outOfRange, 0); assert.equal(same.validRange, undefined);
  assert.equal(filterLogRows([{ from: 0, to: 1, value: "" }], { range: [0, 1] }).rows.length, 1);
});
test("wired in the strip log: the built-in and the imported numeric tracks", () => {
  const s = fs.readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("filterLogRows((layers[k] || []).filter((r) => r.hole_id === holeId), stripProject?.logValidRange?.[k]).rows"));
  assert.ok(s.includes("c.numeric && c.field === \"value\" ? filterLogRows("));
});
