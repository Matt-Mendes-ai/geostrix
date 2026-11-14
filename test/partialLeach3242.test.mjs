// TASKS.csv #3242 (from #3220, Galore Creek review) — Cu_AA05_pct and Cu_AA17_pct (soluble copper by their lab codes) were taken as other methods of
// total copper, joinable into it. A header with a partial-leach code is its own symbol (Cu_AA05), partialOf naming the element. SYNTHETIC columns.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { partialLeachCode, pickElementColumns } from "../src/lib/geochem.js";

test("the partial-leach codes and words are read; method codes of a total are not", () => {
  assert.equal(partialLeachCode("Cu_AA05_pct"), "AA05");
  assert.equal(partialLeachCode("Cu-AA17_pct"), "AA17");
  assert.equal(partialLeachCode("Cu_AA6"), "AA06");
  assert.equal(partialLeachCode("Cu_AA07b_pct"), "AA07B");
  assert.equal(partialLeachCode("Cu_SEQ_pct"), "SEQ");
  assert.equal(partialLeachCode("Cu_AS_SOL_pct"), "ASSOL");
  for (const h of ["Cu_ME-MS61_ppm", "Cu_OG62_pct", "Cu_pct", "Au_AA23_ppm", "Cu_AA62_pct"]) assert.equal(partialLeachCode(h), null, h);
});

test("the import offers them as their own symbols, not as methods of the total", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ Cu_pct: String(0.4 + i * 0.01), Cu_AA05_pct: "0.05", Cu_AA17_pct: "0.02", Cu_ME_ICP61_ppm: String(4000 + i * 100) }));
  const els = pickElementColumns(Object.keys(rows[0]), rows);
  const by = Object.fromEntries(els.map((e) => [e.symbol, e]));
  assert.deepEqual(Object.keys(by).sort(), ["Cu", "Cu_AA05", "Cu_AA17"]);
  assert.equal(by.Cu_AA05.partialOf, "Cu"); assert.equal(by.Cu_AA05.unit, "%"); assert.equal(by.Cu.partialOf, undefined);
  assert.ok(!(by.Cu.methodCols || []).some((c) => /AA05|AA17/.test(c.header)), "not methods of total copper");
  const dlg = fs.readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.ok(dlg.includes("modal.elements.some((e) => e.partialOf)"));
});
