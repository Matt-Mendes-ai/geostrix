// TASKS.csv #3200 (from #3075) — the surface-sample import kept a sample-date column as text, and a column of more than 100 different dates
// not at all (too many values to be an attribute). A column that reads as dates is kept however many days it holds and stored as ISO dates
// with a '<col> year' field, as the collar import does. SYNTHETIC samples.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { surfaceAttrColumns, surfaceDateReaders, surfaceAttrsDated, SURFACE_ATTR_MAX_DISTINCT } from "../src/lib/geochem.js";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rows = Array.from({ length: 150 }, (_, i) => ({ SAMPLE_ID: `R${i}`, X: 1000 + i, Y: 2000, Cu_ppm: 10 + i, SAMPLED: `${1 + (i % 28)}-${MON[Math.floor(i / 28) % 12]}-18`, LOGGER: i % 2 ? "AB" : "CD", AMBIG: `0${1 + (i % 9)}/0${1 + (i % 8)}/2021` }));
const mapping = { sample_id: "SAMPLE_ID", x: "X", y: "Y" }, elements = [{ symbol: "Cu", header: "Cu_ppm" }];

test("a date column with more than 100 different days is kept (it was left out as too many values)", () => {
  assert.ok(new Set(rows.map((r) => r.SAMPLED)).size > SURFACE_ATTR_MAX_DISTINCT);
  const cols = surfaceAttrColumns(Object.keys(rows[0]), rows, mapping, elements);
  assert.deepEqual(cols, ["SAMPLED", "LOGGER", "AMBIG"]);
  const many = rows.map((r, i) => ({ ...r, CODE: `c${i}` })); // other text with as many values: still left out
  assert.ok(!surfaceAttrColumns(Object.keys(many[0]), many, mapping, elements).includes("CODE"));
});

test("the dates are stored as ISO dates with a year field; day / month that cannot be told apart stay as written", () => {
  const cols = surfaceAttrColumns(Object.keys(rows[0]), rows, mapping, elements);
  const d = surfaceDateReaders(rows, cols);
  assert.deepEqual([...d.readers.keys()], ["SAMPLED"]);
  assert.deepEqual(d.ambiguous, ["AMBIG"]);
  const a = surfaceAttrsDated(rows[30], cols, d.readers).attrs;
  assert.equal(a.SAMPLED, "2018-02-03"); assert.equal(a["SAMPLED year"], "2018");
  assert.equal(a.LOGGER, "CD"); assert.equal(a.AMBIG, rows[30].AMBIG);
  // a date Papa read as a Date object (#1509)
  const papa = rows.map((r, i) => ({ ...r, SAMPLED: new Date(Date.UTC(2019, 0, 1 + i)) }));
  const pc = surfaceAttrColumns(Object.keys(papa[0]), papa, mapping, elements), pd = surfaceDateReaders(papa, pc);
  assert.equal(surfaceAttrsDated(papa[0], pc, pd.readers).attrs["SAMPLED year"], "2019");
});

test("the surface import uses them and says when it cannot read the order", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("const sampleDates = surfaceDateReaders(allRows, attrCols);"));
  assert.ok(g.includes("...surfaceAttrsDated(r, attrCols, sampleDates.readers),"));
  assert.ok(g.includes('if (sampleDates.ambiguous.length) setNotices((p) => [...p, tr("{fileName}: {cols} kept as written: every date there could be day/month or month/day."'));
});
