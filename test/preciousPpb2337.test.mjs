// TASKS.csv #2337 (review #2325, WA uranium) — a gold / platinum / palladium column with no unit whose values run to the thousands is ppb
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { preciousReadsPpb, pickElementColumns } from "../src/lib/geochem.js";

const rows = (vals, h = "Au") => vals.map((v) => ({ [h]: v }));

test("WAMEX's Au: median 3, up to 4,010 -> ppb; a real gold assay column stays ppm", () => {
  const wamex = rows([1, 2, 3, 3, 4, 5, 2, 4010, 3, 6]);
  assert.deepEqual(preciousReadsPpb("Au", "Au", wamex, 4010), { median: 3, max: 4010 });
  assert.equal(preciousReadsPpb("Au", "Au", rows([0.01, 0.05, 0.2, 0.4, 1.8, 35]), 35), null); // max under 100
  assert.equal(preciousReadsPpb("Au", "Au", rows([0.01, 0.02, 0.05, 0.3, 120]), 120), null); // a bonanza sample, median under 1
  assert.equal(preciousReadsPpb("Au", "Au_ppm", wamex, 4010), null); // the header says its unit
  assert.equal(preciousReadsPpb("Cu", "Cu", rows([300, 900, 4000], "Cu"), 4000), null); // base metals untouched
  assert.ok(preciousReadsPpb("Pd", "Pd", rows([5, 9, 12, 400], "Pd"), 400));
});

test("pickElementColumns chooses ppb and says why; the dialog shows it in a line", () => {
  const data = [1, 2, 3, 3, 4, 5, 2, 4010, 3, 6].map((v, i) => ({ Au: v, Cu: 100 + i }));
  const els = pickElementColumns(["Au", "Cu"], data);
  const au = els.find((e) => e.symbol === "Au"), cu = els.find((e) => e.symbol === "Cu");
  assert.equal(au.unit, "ppb");
  assert.deepEqual(au.unitFromValues, { median: 3, max: 4010 });
  assert.equal(cu.unit, "ppm");
  assert.equal(cu.unitFromValues, undefined);
  const m = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /e\.unitFromValues && !e\.unitChosen/);
});
