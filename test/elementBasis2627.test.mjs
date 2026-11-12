// TASKS.csv #2627 (follow-up of #2487) — an element's reported-as basis changed in an existing project: every stored number of the element
// converted with its unit (values, per-method values, QC records, threshold rules), the base unit kept, the change undoable as one step.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { basisChoices, basisFactor, rebaseRows, changeElementBasis, rebaseThresholds } from "../src/lib/oxideBasisChange.js";
import { oxidesOfElement, convertUnit } from "../src/lib/geochem.js";

test("#2627 the bases an element can be reported in", () => {
  assert.deepEqual(basisChoices({ symbol: "Li", unit: "%" }).map((c) => c.unit), ["%", "% Li2O"]);
  assert.deepEqual(basisChoices({ symbol: "Li", unit: "% Li2O" }).map((c) => c.unit), ["%", "% Li2O"], "from the oxide back to the element");
  assert.deepEqual(basisChoices({ symbol: "Ta", unit: "ppm" }).map((c) => c.unit), ["ppm", "ppm Ta2O5"], "the base unit kept");
  assert.deepEqual(basisChoices({ symbol: "Fe", unit: "%" }).map((c) => c.unit), ["%", "% Fe2O3", "% FeO"]);
  assert.deepEqual(basisChoices({ symbol: "Au", unit: "ppm" }), [], "no oxide");
  assert.deepEqual(basisChoices({ symbol: "Li", unit: "g/t" }), [], "not % / ppm / ppb");
  assert.deepEqual(basisChoices({ symbol: "Li", unit: "%", calculated: { expr: "x" } }), [], "a calculated element");
  assert.deepEqual(oxidesOfElement("Li"), [{ oxide: "Li2O", factor: 2.1527 }]);
});

test("#2627 the factor: element -> oxide multiplies, oxide -> element divides, the base unit must match", () => {
  assert.equal(basisFactor("%", "% Li2O"), 2.1527);
  assert.equal(basisFactor("% Li2O", "%"), 1 / 2.1527);
  assert.ok(Math.abs(basisFactor("% Fe2O3", "% FeO") - 1.2865 / 1.4297) < 1e-12);
  assert.equal(basisFactor("ppm", "% Li2O"), null);
});

test("#2627 a change converts the element's values and per-method values, keeps the rest, and comes back exactly", () => {
  const els = [{ symbol: "Li", unit: "%", header: "Li_pct" }, { symbol: "Cu", unit: "ppm" }];
  const rows = [
    { hole_id: "A", from: 0, to: 1, values: { Li: 0.6, Cu: 50 }, methodValues: { Li: { Li_ICP: 0.61, Li_XRF: 0.58 } }, qualifiers: { Li: "<" } },
    { hole_id: "A", from: 1, to: 2, values: { Cu: 30 } },
    { hole_id: "A", from: 2, to: 3, values: { Li: null }, sample_type: "lab repeat" },
  ];
  const r = changeElementBasis(els, rows, "Li", "% Li2O");
  assert.equal(r.changed, 2);
  assert.equal(r.factor, 2.1527);
  assert.deepEqual(r.elements[0], { symbol: "Li", unit: "% Li2O", header: "Li_pct" });
  assert.equal(r.elements[1], els[1]);
  assert.equal(r.rows[0].values.Li, Number((0.6 * 2.1527).toPrecision(12)));
  assert.equal(r.rows[0].values.Cu, 50);
  assert.equal(r.rows[0].methodValues.Li.Li_XRF, Number((0.58 * 2.1527).toPrecision(12)));
  assert.equal(r.rows[0].qualifiers.Li, "<");
  assert.equal(r.rows[1], rows[1], "a row without the element keeps its identity (the undo history shares it)");
  assert.equal(r.rows[2].values.Li, null);
  assert.equal(rows[0].values.Li, 0.6, "the input is not changed");
  // the stored numbers read back in the element's % are what they were (convertUnit understands "% Li2O", #2487)
  assert.ok(Math.abs(convertUnit(r.rows[0].values.Li, "% Li2O", "%") - 0.6) < 1e-12);
  const back = changeElementBasis(r.elements, r.rows, "Li", "%");
  assert.equal(back.rows[0].values.Li, 0.6);
  assert.equal(back.rows[0].methodValues.Li.Li_ICP, 0.61);
});

test("#2627 refused changes", () => {
  const els = [{ symbol: "Li", unit: "%" }, { symbol: "Au", unit: "ppm" }];
  assert.equal(changeElementBasis(els, [], "Zn", "% ZnO").error, "unknown");
  assert.equal(changeElementBasis(els, [], "Li", "%").error, "same");
  assert.equal(changeElementBasis(els, [], "Li", "ppm Li2O").error, "not a basis of this element");
  assert.equal(changeElementBasis(els, [], "Au", "ppm").error, "not a basis of this element");
  assert.equal(rebaseRows([{ values: { Cu: 1 } }], "Li", 2).changed, 0);
});

test("#2627 the threshold rules of the element (drill or surface) follow", () => {
  const list = [
    { symbol: "Li", unit: "%", values: { all: 0.3, granite: 0.2 }, source: "drill" },
    { symbol: "Li", unit: "%", values: { all: 0.1 } },
    { symbol: "Cu", unit: "%", values: { all: 1 }, source: "drill" },
  ];
  const d = rebaseThresholds(list, "Li", "%", "% Li2O", 2.1527, true);
  assert.equal(d.changed, 1);
  assert.equal(d.list[0].unit, "% Li2O");
  assert.equal(d.list[0].values.granite, Number((0.2 * 2.1527).toPrecision(12)));
  assert.equal(d.list[1], list[1], "the surface rule is not the drill element's");
  const s = rebaseThresholds(list, "Li", "%", "% Li2O", 2.1527, false);
  assert.equal(s.changed, 1);
  assert.equal(s.list[1].unit, "% Li2O");
  assert.equal(rebaseThresholds(list, "Zn", "%", "% ZnO", 1.2, true).list, list);
});

test("#2627 wiring: the store setter (one step over the fields), the Geochem element chip", () => {
  const store = fs.readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(store, /const setElementBasis = useCallback\(\(symbol, toUnit, \{ surface = false \} = \{\}\) => \{/);
  assert.match(store, /setSurfaceElements\(r\.elements\); setSurfaceSamples\(r\.rows\);/);
  assert.match(store, /setAssayElements\(r\.elements\); setAssays\(r\.rows\);/);
  assert.match(store, /setElementBasis, \/\/ TASKS\.csv #2627/);
  const geo = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(geo, /<ElementBasisSelect element=\{e\} onNotice=/);
  const sel = fs.readFileSync(new URL("../src/components/ElementBasisSelect.jsx", import.meta.url), "utf8");
  assert.match(sel, /confirmDestructive\(q, \{ undoable: true \}\)/);
});
