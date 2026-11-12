// TASKS.csv #2548 — Grade-tonnage on a lithium estimate: 'Metal (t)' was tonnes of Li with no name, 'Mean grade' had no unit, and Li2O or LCE
// could not be had. The columns now name what they count, and an element usually reported as an oxide gets those columns too.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metalColumns, metalOf, gradeTonnageTable, gradeTonnageRows } from "../src/lib/gradeTonnage.js";

const near = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));

test("Li in %: Li, Li2O and LCE tonnes from one row (the review's 249,997 t Li = 538,000 t Li2O = 1.33 Mt LCE)", () => {
  const cols = metalColumns(metalOf("%"), "Li");
  assert.deepEqual(cols.map((c) => [c.key, c.label, c.args?.el]), [["metal_t", "{el} (t)", "Li"], ["metal_t_Li2O", "{el} (t)", "Li2O"], ["metal_t_LCE", "{el} (t)", "LCE"]]);
  const li = 249997;
  assert.ok(near(li * cols[1].factor, li * 2.1527)); assert.ok(Math.round(li * cols[1].factor / 1000) === 538);
  assert.ok(Math.abs(li * cols[2].factor / 1e6 - 1.33) < 0.01);
});

test("an oxide basis keeps its oxide column first and adds the element (and LCE for lithium)", () => {
  const cols = metalColumns(metalOf("% Li2O"), "Li");
  assert.deepEqual(cols.map((c) => c.key), ["metal_t_Li2O", "metal_t", "metal_t_LCE"]);
  assert.equal(cols[0].label, "Metal (t Li2O)");
  const t = gradeTonnageTable([{ value: 1.5, dx: 10, dy: 10, dz: 10 }], { cutoffs: [0], density: 2.7, unit: "% Li2O" })[0];
  assert.ok(near(t.metal * cols[1].factor, 2700 * 0.015 / 2.1527), "the Li column is the element");
  const csv = gradeTonnageRows([t], { vname: "Li", density: 2.7, metal: metalOf("% Li2O"), columns: cols })[0];
  assert.ok("metal_t" in csv && "metal_t_Li2O" in csv && "metal_t_LCE" in csv);
});

test("other elements: their name, U3O8 / Ta2O5 where usual, nothing invented elsewhere", () => {
  assert.deepEqual(metalColumns(metalOf("%"), "Zn").map((c) => [c.key, c.args?.el, c.factor]), [["metal_t", "Zn", 1], ["metal_mlb_Zn", "Zn", 2204.62262 / 1e6]]); // + Mlb Zn: #1747 (DECISION 2026-11-12, Matt)
  assert.deepEqual(metalColumns(metalOf("ppm"), "U").map((c) => c.key), ["metal_t", "metal_t_U3O8", "metal_mlb_U3O8"]); // + Mlb U3O8: #2404
  assert.deepEqual(metalColumns(metalOf("ppm"), "Au").map((c) => c.key), ["metal_kg", "metal_oz"]);
  assert.deepEqual(metalColumns(metalOf("%"), null).map((c) => c.label), ["Metal (t)"], "no element: as before");
});

test("the table's headers name the unit; a typed cut-off keeps four figures", () => {
  const s = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.match(s, /tr\(c\.label, c\.args\)/);
  assert.match(s, /unitL \? tr\("Mean grade \(\{unit\}\)", \{ unit: unitL \}\)/);
  assert.match(s, /unitL \? tr\("Cutoff \(\{unit\}\)", \{ unit: unitL \}\)/);
  assert.match(s, /<td style=\{td\}>\{sig4\(r\.cutoff\)\}\{cutoffPct\(r\.cutoff, element, unit\) != null \? /); // + the cut-off in % for a base metal in ppm: #1747
  assert.match(s, /Number\(v\.toPrecision\(4\)\)\.toLocaleString\(undefined, \{ maximumFractionDigits: 10 \}\)/, "toLocaleString would round to 3 decimals");
  assert.equal(Number((0.2323).toPrecision(4)).toLocaleString("en", { maximumFractionDigits: 10 }), "0.2323");
});
