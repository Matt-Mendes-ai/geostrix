// TASKS.csv #2487 (review #2486, WA lithium) — a grade reported as its oxide: the element stays the symbol, the unit carries the basis
// ("% Li2O") and the numbers are the oxide's; the import says and offers the basis per oxide column
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unitBasis, convertUnit, valueIn, keepsOxide, importStoreUnit, assayExportRows, oxideOfHeader, metalEquivalent, gradeUnitLabel } from "../src/lib/geochem.js";
import { metalOf, metalColumns, gradeTonnageTable } from "../src/lib/gradeTonnage.js";
import { pitMetalOf, metalAmountText } from "../src/lib/pitShell.js";
import { presetConversions } from "../src/lib/calcElement.js";
import { fillUnsampled } from "../src/lib/unsampledFill.js";
import { DIAGRAMS } from "../src/lib/geochemDiagrams.js";

const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test("the basis unit: '% Li2O' is Li2O wt%; reading it as % gives Li, in its own unit gives Li2O", () => {
  assert.deepEqual({ ...unitBasis("% Li2O") }, { base: "%", oxide: "Li2O", symbol: "Li", factor: 2.1527 });
  assert.equal(unitBasis("ppm Ta2O5").base, "ppm");
  assert.equal(unitBasis("%").oxide, null);
  assert.equal(unitBasis("% Xx9").oxide, null); // not an oxide the import knows
  const eu = { Li: "% Li2O", Ta: "ppm Ta2O5", Cu: "ppm" };
  const s = { values: { Li: 7.139, Ta: 4730, Cu: 120 } }; // the review's CLDD006 4-5 m: 7.139 % Li2O
  assert.equal(valueIn(s, "Li", "% Li2O", eu), 7.139); // the grade as reported
  assert.ok(near(valueIn(s, "Li", "%", eu), 7.139 / 2.1527)); // the element (3.3163 %), for a diagram or a ratio
  assert.ok(near(valueIn(s, "Ta", "ppm", eu), 4730 / 1.221));
  assert.ok(near(convertUnit(1, "% Li2O", "%"), 0.464533, 1e-5)); // a 1 % Li2O cut-off is 0.4645 % Li
  assert.ok(near(convertUnit(0.4645329, "%", "% Li2O"), 1, 1e-6));
  assert.ok(near(convertUnit(1, "% Li2O", "ppm Li2O"), 10000));
  assert.equal(valueIn(s, "Cu", "%", eu), 0.012); // an element unit is unchanged
  assert.equal(gradeUnitLabel("Li", "% Li2O"), "% Li2O");
});

test("the import: an oxide column is kept as the oxide by default (#2888: whole-rock oxides too); either can be switched", () => {
  assert.ok(keepsOxide({ header: "Li2O_pct" }));
  assert.ok(keepsOxide({ header: "Ta2O5_ppm" }));
  assert.ok(keepsOxide({ header: "SiO2" })); // #2888 — every oxide as reported by default
  assert.ok(!keepsOxide({ header: "SiO2", keepOxide: false }));
  assert.ok(!keepsOxide({ header: "Li2O_pct", keepOxide: false }));
  assert.ok(keepsOxide({ header: "Fe2O3", keepOxide: true })); // iron ore, chosen
  assert.ok(!keepsOxide({ header: "Li_ppm" }));
  assert.equal(importStoreUnit({ header: "Li2O_pct", unit: "%" }), "% Li2O");
  assert.equal(importStoreUnit({ header: "Ta2O5_ppm", unit: "ppm" }), "ppm Ta2O5");
  assert.equal(importStoreUnit({ header: "SiO2", unit: "%" }), "% SiO2"); // #2888
  assert.equal(importStoreUnit({ header: "SiO2", unit: "%", keepOxide: false }), "%");
  assert.equal(importStoreUnit({ header: "Li2O_pct", unit: "%", keepOxide: false }), "%");
  assert.equal(importStoreUnit({ header: "Cu_ppm", unit: "ppm" }), "ppm");
  // the commit reads each oxide column at its own basis into the stored unit
  const src = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const to = existingUnit\[sym\] \|\| importStoreUnit\(e\);/);
  assert.match(src, /merged\.set\(e\.symbol, oxideOfHeader\(e\.header\) \? \{ \.\.\.e, unit: importStoreUnit\(e\) \} : e\)/);
  const dlg = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(dlg, /Kept as the oxide: \{list\}/);
  assert.match(dlg, /aria-label=\{tr\("Basis of \{symbol\}"/);
});

test("exports, metal, pit and presets speak the oxide; the diagrams still get the element", () => {
  const eu = [{ symbol: "Li", unit: "% Li2O" }, { symbol: "Cu", unit: "ppm" }];
  const rows = assayExportRows([{ hole_id: "H", from: 0, to: 1, values: { Li: 7.139, Cu: 5 } }], eu);
  assert.equal(rows[0].Li2O_pct, 7.139); // re-imports as the oxide column it came from
  assert.equal(rows[0].Cu_ppm, 5);
  assert.equal(oxideOfHeader("Li2O_pct").oxide, "Li2O");
  // metal: counted as the element (the pit's products are per tonne of Li), shown as the oxide
  const m = metalOf("% Li2O");
  assert.equal(m.unit, "t"); assert.equal(m.oxide, "Li2O");
  const col = metalColumns(m, "Li")[0];
  assert.equal(col.label, "Metal (t Li2O)");
  const t = gradeTonnageTable([{ value: 1.5, dx: 10, dy: 10, dz: 10 }], { cutoffs: [0], density: 2.7, unit: "% Li2O" })[0];
  assert.ok(near(t.metal * col.factor, 2700 * 0.015)); // 2,700 t at 1.5 % Li2O = 40.5 t Li2O
  assert.ok(near(t.metal, 2700 * 0.015 / 2.1527)); // = 18.8 t Li, what the pit prices
  assert.equal(pitMetalOf("% Li2O", "Li").unit, "t");
  assert.match(metalAmountText(18.81, "t", "Li", (x) => x.toFixed(1)), /18\.8 t Li \(.*40\.5 t Li2O/);
  // a ratio preset converts an oxide basis through its element
  const conv = presetConversions([{ symbol: "Rb", unit: "% Rb2O" }, { symbol: "K", unit: "%" }], { K: "%", Rb: "ppm" });
  assert.ok(near(conv.find((c) => c.sym === "Rb").factor, 10000 / 1.0936));
  // a metal equivalent prices the element
  assert.ok(near(metalEquivalent({ Li: 2.1527 }, [{ symbol: "Li", unit: "% Li2O", price: 1, recovery: 1 }]), 2.1527));
  // TAS with Si kept as SiO2: the same point as Si stored as the element
  const a = DIAGRAMS.tas.project({ values: { Si: 65, Na: 3, K: 2 } }, { Si: "% SiO2", Na: "% Na2O", K: "% K2O" });
  const b = DIAGRAMS.tas.project({ values: { Si: 65 / 2.1392, Na: 3 / 1.348, K: 2 / 1.2046 } }, { Si: "%", Na: "%", K: "%" });
  assert.ok(near(a.x, b.x, 1e-3) && near(a.y, b.y, 1e-3));
  // barren fill typed in % Li2O on a % Li2O element: stored as typed
  const f = fillUnsampled([{ hole_id: "A", from: 2, to: 3, values: { Li: 2 } }], [{ hole_id: "A", max_depth: 5 }], "Li", "% Li2O", { Li: "% Li2O" }, 0.01);
  assert.ok(f.fills.every((r) => r.values.Li === 0.01));
});
