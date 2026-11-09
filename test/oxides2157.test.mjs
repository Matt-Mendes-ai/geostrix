// TASKS.csv #2157 (WA drillhole review) — the commodity / trace oxides (Li2O, Ta2O5, U3O8 ...), a zero-for-O typo (Al203), units glued to
// the symbol (AUPPB, PTPPB), 'percent' / 'pc' units, and lab repeats (Au-Rp1) never the main column beside a plain one.
import test from "node:test";
import assert from "node:assert/strict";
import { isElementColumn, oxideOfHeader, inferUnit, pickElementColumns, fromOxideHeader } from "../src/lib/geochem.js";

test("#2157 oxides: symbol, factor (oxide / element mass) and conversion", () => {
  const want = { Li2O: ["Li", 2.1527], Ta2O5: ["Ta", 1.221], Nb2O5: ["Nb", 1.4305], SnO2: ["Sn", 1.2695], NiO: ["Ni", 1.2726], U3O8: ["U", 1.1792], WO3: ["W", 1.2611], V2O5: ["V", 1.7852], SO3: ["S", 2.4971], Cs2O: ["Cs", 1.0602] };
  for (const [h, [sym, f]] of Object.entries(want)) { const o = oxideOfHeader(`${h}_pct`); assert.equal(o.symbol, sym, h); assert.equal(o.factor, f, h); }
  assert.ok(Math.abs(fromOxideHeader(1.5, "Li2O_pct") - 0.6968) < 1e-4); // 1.5 % Li2O = 0.697 % Li
  assert.equal(isElementColumn("Al203"), "Al"); assert.equal(oxideOfHeader("Al203").oxide, "Al2O3");
  assert.equal(inferUnit("Ta2O5_ppm", "Ta"), "ppm"); assert.equal(inferUnit("Li2O_pct", "Li"), "%"); assert.equal(inferUnit("SiO2", "Si"), "%");
  assert.equal(isElementColumn("LOI"), false); assert.equal(isElementColumn("LOI1000_XRF_pct"), false); // loss on ignition is not an element
});

test("#2157 units glued to the symbol and 'percent' / 'pc'", () => {
  assert.deepEqual(["AUPPB", "AUPPM", "PTPPB", "CUPCT", "NIPC"].map((h) => [isElementColumn(h), inferUnit(h, isElementColumn(h))]), [["Au", "ppb"], ["Au", "ppm"], ["Pt", "ppb"], ["Cu", "%"], ["Ni", "%"]]);
  assert.equal(isElementColumn("TOPPM"), false); // 'To' is no element
  assert.equal(inferUnit("Cu_percent", "Cu"), "%"); assert.equal(inferUnit("Ni_pc", "Ni"), "%"); assert.equal(inferUnit("Zn_wt_pc", "Zn"), "%");
  assert.equal(inferUnit("Cu_ppm", "Cu"), "ppm"); // unchanged
});

test("#2157 a lab repeat is never the main column beside a plain one", () => {
  const rows = [{ Au: "1.2", "Au-Rp1": "1.1" }, { Au: "", "Au-Rp1": "0.5" }, { Au: "", "Au-Rp1": "0.6" }];
  const [au] = pickElementColumns(["Au", "Au-Rp1"], rows);
  assert.equal(au.header, "Au"); assert.deepEqual(au.alts, ["Au-Rp1"]);
  // only repeats: the best of them, as before
  assert.equal(pickElementColumns(["AuRp1", "Au_Dup"], [{ AuRp1: "1", Au_Dup: "" }, { AuRp1: "2", Au_Dup: "3" }])[0].header, "AuRp1");
  // Au1 (the first assay, not a repeat) still competes on its count
  assert.equal(pickElementColumns(["Au", "Au1"], [{ Au: "", Au1: "1" }, { Au: "", Au1: "2" }, { Au: "3", Au1: "3" }])[0].header, "Au1");
});

test("#2157 an oxide column in ppm is read in ppm at the commit (Ta2O5_ppm), not as %", async () => {
  const { oxideUnit } = await import("../src/lib/geochem.js");
  assert.equal(oxideUnit("Ta2O5_ppm"), "ppm"); assert.equal(oxideUnit("Li2O_pct"), "%"); assert.equal(oxideUnit("SiO2"), "%"); assert.equal(oxideUnit("Au2O3_ppb"), "ppb");
  const src = (await import("node:fs")).readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((src.match(/ox \? oxideUnit\(/g) || []).length, 4);
  assert.doesNotMatch(src, /ox \? "%" : e\.unit/);
});
