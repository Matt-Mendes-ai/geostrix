// TASKS.csv #1638 — the collar table: first row, hole filter, continuation pages, a default that fits the sheet
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarTableSlice, collarRowsThatFit, continuationTables } from "../src/lib/collarTable.js";

const holes = Array.from({ length: 446 }, (_, i) => ({ hole_id: (i < 200 ? "21AGBDD" : "22AGBDD") + String(i + 1).padStart(3, "0") }));

test("a first row moves the window; the last table holds the rest", () => {
  const a = collarTableSlice(holes, { firstRow: 1, maxRows: 40 });
  assert.equal(a.rows[0].hole_id, "21AGBDD001"); assert.equal(a.after, 406);
  const b = collarTableSlice(holes, { firstRow: 41, maxRows: 40 });
  assert.equal(b.rows[0].hole_id, "21AGBDD041"); assert.equal(b.start, 40); assert.equal(b.end, 80);
  const z = collarTableSlice(holes, { firstRow: 441, maxRows: 40 });
  assert.equal(z.rows.length, 6); assert.equal(z.after, 0);
  assert.equal(collarTableSlice(holes, { firstRow: 9999 }).rows.length, 0);
});

test("the filter keeps holes whose id contains it", () => {
  const s = collarTableSlice(holes, { filter: "22agb", maxRows: 500 });
  assert.equal(s.total, 246); assert.ok(s.rows.every((c) => c.hole_id.startsWith("22")));
});

test("continuation tables cover every remaining row once", () => {
  const el = { id: "t", type: "table", source: "collars", firstRow: 1, maxRows: 40, holeFilter: "", x: 50, y: 100 };
  const ts = continuationTables(el, 446);
  assert.equal(ts.length, 11);
  assert.deepEqual(ts.map((t) => t.firstRow).slice(0, 3), [41, 81, 121]);
  assert.ok(ts.every((t) => t.y === 40 && t.maxRows === 40 && t.id !== "t"));
  const covered = [el, ...ts].flatMap((t) => collarTableSlice(holes, t).rows.map((c) => c.hole_id));
  assert.equal(new Set(covered).size, 446); assert.equal(covered.length, 446);
});

test("the default length fits an A4 landscape sheet (794 px) from y 100", () => {
  const n = collarRowsThatFit(794, 100, 7);
  assert.ok(n >= 30 && n < 40, String(n));
  assert.ok(collarRowsThatFit(1123, 100, 7) > n);
});

test("wired", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /base\.maxRows = collarRowsThatFit\(A4\.h, base\.y, 7\)/);
  assert.match(m, /const sl = collarTableSlice\(cs, \{ firstRow: el\.firstRow, maxRows: el\.maxRows, filter: el\.holeFilter \}\);/);
  assert.match(m, /addLayoutPages\(conts\.map/);
  assert.doesNotMatch(m, /or add a second table/);
});
