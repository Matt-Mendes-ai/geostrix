// TASKS.csv #1389 — every Geochem element list offered B, Hg, Pd and Pt on Silvertip, blank in all 1,339 assay rows. A column with no value
// in any row is left unticked at import (tagged 'no values'), and the Silvertip sample loader leaves such elements out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickElementColumns } from "../src/lib/geochem.js";
import { silvertipAssays } from "../src/lib/sampleSilvertip.js";

test("pickElementColumns reports the values in each chosen column", () => {
  const rows = [{ Au_ppm: "0.5", Cu_ppm: "", B_pct: "" }, { Au_ppm: "1.2", Cu_ppm: "40", B_pct: "" }];
  const by = Object.fromEntries(pickElementColumns(["Au_ppm", "Cu_ppm", "B_pct"], rows).map((e) => [e.symbol, e.n]));
  assert.deepEqual(by, { Au: 2, Cu: 1, B: 0 });
});

test("the bundled Silvertip assays no longer list B, Hg, Pd or Pt", () => {
  const text = readFileSync(new URL("../sample_data/silvertip/assays.csv", import.meta.url), "utf8");
  const { elements, rows } = silvertipAssays(text);
  const syms = elements.map((e) => e.symbol);
  for (const s of ["B", "Hg", "Pd", "Pt"]) assert.ok(!syms.includes(s), s);
  assert.ok(syms.includes("Zn") && syms.includes("Ag"));
  assert.ok(elements.every((e) => rows.some((r) => r.values[e.symbol] != null)));
});

test("Geochem's import dialogs start an empty column unticked and tag it", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/mainHeader: e\.header, checked: e\.n > 0 \}\)\)/g) || []).length, 3);
  for (const f of ["../src/components/AssayImportModal.jsx", "../src/components/SurfaceImportModal.jsx"]) {
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /\{e\.n === 0 && <span [^>]*>\{tr\("no values"\)\}<\/span>\}/, f);
  }
});
