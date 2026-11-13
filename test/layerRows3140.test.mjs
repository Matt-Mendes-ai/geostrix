// TASKS.csv #3140 step 1 — lib/layerRows.js: a custom layer's rows through one accessor, the same for a row layer and a layer kept as typed
// columns (layer.table). The table built from rows gives back the same rows (in hole, then depth order), the same fields and the same
// per-hole slices; rows that do not fit the table's shape give null (they stay rows).
import test from "node:test";
import assert from "node:assert/strict";
import { hasTable, layerLength, layerData, rowAt, rowsOf, forEachRow, fieldNames, fieldColumn, holeRanges, holeRows, tableFromRows } from "../src/lib/layerRows.js";

// a binned log, deliberately out of order (hole B first, depths shuffled), one bin without a max, a coded field with a gap
const rows = [
  { hole_id: "B", from: 1, to: 2, value: 3.5, min: 3, max: 4, n: 4, lith: "BIF" },
  { hole_id: "A", from: 2, to: 3, value: 1.25, min: 1, max: 1.5, n: 2, lith: "SHALE" },
  { hole_id: "B", from: 0, to: 1, value: 2.5, min: 2, n: 1 },
  { hole_id: "A", from: 0, to: 1, value: 0.5, min: 0.5, max: 0.5, n: 1, lith: "BIF" },
  { hole_id: "A", from: 1, to: 2, value: 0.75, min: 0.7, max: 0.8, n: 3, lith: "BIF" },
];
const sorted = [rows[2], rows[0], rows[3], rows[4], rows[1]]; // B (first seen) 0-1, 1-2, then A 0-1, 1-2, 2-3

test("a row layer: the accessor reads layer.rows as before", () => {
  const L = { id: "r", rows };
  assert.equal(hasTable(L), false); assert.equal(layerLength(L), 5); assert.equal(layerData(L), rows); assert.equal(rowsOf(L), rows);
  assert.equal(rowAt(L, 1), rows[1]);
  assert.deepEqual(fieldNames(L).sort(), ["lith", "max", "min", "n", "value"]);
  assert.deepEqual(fieldColumn(L, "value"), [3.5, 1.25, 2.5, 0.5, 0.75]);
  assert.deepEqual(holeRows(L, "A"), [rows[1], rows[3], rows[4]]);
  assert.equal(layerLength({ id: "x" }), 0); assert.deepEqual(rowsOf({ id: "x" }), []);
});

test("rows -> table -> rows: the same rows in hole and depth order, fields typed, a missing value left out as it was", () => {
  const t = tableFromRows(rows, { src: "log.csv" });
  assert.equal(t.n, 5); assert.deepEqual(t.holes, ["B", "A"]);
  assert.ok(t.from instanceof Float64Array && t.to instanceof Float64Array && !t.depth);
  assert.ok(t.fields.value instanceof Float64Array); assert.deepEqual(t.fields.lith.dict, ["BIF", "SHALE"]);
  const L = { id: "t", table: t };
  assert.equal(hasTable(L), true); assert.equal(layerLength(L), 5); assert.equal(layerData(L), t);
  const back = rowsOf(L);
  assert.deepEqual(back, sorted.map((r) => ({ ...r, _src: "log.csv" })));
  assert.equal(rowsOf(L), back, "built once per table");
  assert.equal("max" in back[0], false, "the bin without a max has no max key, as before");
  assert.equal("lith" in back[0], false);
  assert.deepEqual(fieldNames(L).sort(), ["lith", "max", "min", "n", "value"]);
  assert.deepEqual([...fieldColumn(L, "value")], [2.5, 3.5, 0.5, 0.75, 1.25]);
  assert.deepEqual(fieldColumn(L, "lith"), [undefined, "BIF", "BIF", "BIF", "SHALE"]);
  assert.deepEqual([...fieldColumn(L, "from")], [0, 1, 0, 1, 2]);
  assert.deepEqual([...holeRanges(t)], [["B", [0, 2]], ["A", [2, 5]]]);
  assert.deepEqual(holeRows(L, "A").map((r) => r.from), [0, 1, 2]); assert.deepEqual(holeRows(L, "Z"), []);
  assert.deepEqual(rowAt(L, 4), { ...rows[1], _src: "log.csv" });
  let k = 0; forEachRow(L, () => k++); assert.equal(k, 5);
});

test("point readings: a depth column, sorted by depth; numbers and codes mixed in one field go to a dictionary as they were", () => {
  const pts = [{ hole_id: "H1", depth: 5, value: 1 }, { hole_id: "H1", depth: 2.5, value: "BDL" }, { hole_id: 7, depth: 1, value: 3 }];
  const t = tableFromRows(pts);
  assert.ok(t.depth && !t.from); assert.deepEqual(t.holes, ["H1", "7"]);
  assert.deepEqual(rowsOf({ table: t }), [{ hole_id: "H1", depth: 2.5, value: "BDL" }, { hole_id: "H1", depth: 5, value: 1 }, { hole_id: "7", depth: 1, value: 3 }]);
});

test("rows that do not fit a table stay rows (null): no hole id, an object in a field, a text depth, none at all", () => {
  assert.equal(tableFromRows([{ from: 0, to: 1, value: 1 }]), null);
  assert.equal(tableFromRows([{ hole_id: "A", from: 0, to: 1, value: { a: 1 } }]), null);
  assert.equal(tableFromRows([{ hole_id: "A", depth: "3", value: 1 }]), null);
  assert.equal(tableFromRows([]), null); assert.equal(tableFromRows(null), null);
});

test("a 400,000-bin log: the table round-trips and is built in well under a few seconds", () => {
  const big = [];
  for (let h = 0; h < 2000; h++) for (let i = 0; i < 200; i++) big.push({ hole_id: `H${h}`, from: i * 0.5, to: i * 0.5 + 0.5, value: (h * 7 + i) % 97 / 10, n: 5 });
  const t0 = performance.now(), t = tableFromRows(big), ms = performance.now() - t0;
  assert.equal(t.n, 400000); assert.equal(t.holes.length, 2000);
  assert.ok(ms < 8000, `${Math.round(ms)} ms`);
  const L = { table: t };
  for (const i of [0, 199, 200, 123457, 399999]) assert.deepEqual(rowAt(L, i), big[i], `row ${i}`);
  assert.deepEqual(holeRanges(t).get("H1999"), [399800, 400000]);
});
