// TASKS.csv #2627 part 2 — the surface-sample import keeps an oxide column as the oxide ('% Li2O') or stores it as the element, as chosen,
// with the drill import's rule (#2487); the dialog offers the choice
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convertUnit, importStoreUnit, keepsOxide, oxideOfHeader, oxideBasisUnit, oxideColumnUnit, valueIn } from "../src/lib/geochem.js";

const read = (value, e) => { const ox = oxideOfHeader(e.header); return convertUnit(value, ox ? oxideBasisUnit(oxideColumnUnit(e), ox.oxide) : e.unit, importStoreUnit(e)); };

test("kept as the oxide: the file's number, in '% Li2O'; stored as the element: divided by the factor, in %", () => {
  const keep = { symbol: "Li", header: "Li2O_pct", unit: "%", keepOxide: true };
  const asEl = { symbol: "Li", header: "Li2O_pct", unit: "%", keepOxide: false };
  assert.equal(importStoreUnit(keep), "% Li2O");
  assert.equal(read(1.5, keep), 1.5);
  assert.equal(importStoreUnit(asEl), "%");
  const f = oxideOfHeader("Li2O_pct").factor;
  assert.ok(Math.abs(read(1.5, asEl) - 1.5 / f) < 1e-12);
  // either way a reader gets the same element grade
  const sKeep = { values: { Li: read(1.5, keep) } }, sEl = { values: { Li: read(1.5, asEl) } };
  assert.ok(Math.abs(valueIn(sKeep, "Li", "%", { Li: "% Li2O" }) - valueIn(sEl, "Li", "%", { Li: "%" })) < 1e-12);
});

test("the default follows the drill import: a commodity oxide kept, a major oxide stored as the element", () => {
  assert.equal(keepsOxide({ symbol: "Li", header: "Li2O_pct" }), true);
  assert.equal(keepsOxide({ symbol: "Fe", header: "Fe2O3_pct" }), true); // #2888 — every oxide as reported by default
  assert.equal(keepsOxide({ symbol: "Fe", header: "Fe2O3_pct", keepOxide: false }), false);
});

test("wired: the surface commit reads through the chosen basis; the dialog offers it", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /let v = convertUnit\(c\.value, ox \? oxideBasisUnit\(oxideColumnUnit\(e\), ox\.oxide\) : e\.unit, existingUnit\[e\.symbol\] \|\| importStoreUnit\(e\)\);/);
  assert.match(g, /merged\.set\(e\.symbol, oxideOfHeader\(e\.header\) \? \{ \.\.\.e, unit: importStoreUnit\(e\) \} : e\)/);
  const m = readFileSync(new URL("../src/components/SurfaceImportModal.jsx", import.meta.url), "utf8");
  assert.match(m, /<select value=\{keepsOxide\(e\) \? "oxide" : "element"\} onChange=\{\(ev\) => setKeepOxide\(e\.symbol, ev\.target\.value === "oxide"\)\}/);
});
