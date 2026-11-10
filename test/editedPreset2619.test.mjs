// TASKS.csv #2619 (re-test of #2500) — an edited preset formula: a space keeps the preset's units; any other edit drops them, and the dialog
// says the formula reads the stored units instead of keeping the preset's promise on screen
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALC_PRESETS, presetUnitsFor, addCalculatedElement } from "../src/lib/calcElement.js";

const krb = CALC_PRESETS.find((p) => p.name === "KRb");
const els = [{ symbol: "K", unit: "%" }, { symbol: "Rb", unit: "%" }, { symbol: "Cs", unit: "%" }];
const rows = [{ values: { K: 2.6, Rb: 0.4, Cs: 0.1 } }];

test("a typed space is still the preset; Rb -> Cs is the user's own formula", () => {
  assert.deepEqual(presetUnitsFor(krb, "K*10000 / Rb"), { K: "%", Rb: "ppm" });
  const r = addCalculatedElement(rows, els, "KRbSp", "K*10000 / Rb", "index", { readUnits: presetUnitsFor(krb, "K*10000 / Rb") });
  assert.ok(Math.abs(r.assays[0].values.KRbSp - 6.5) < 1e-9); // the review's case gave 65,000
  assert.equal(presetUnitsFor(krb, "K*10000/Cs"), null);
  assert.equal(presetUnitsFor(null, "K/Rb"), null);
});

test("the dialog replaces the preset's line once the formula is no longer the preset", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /calc\.msg\.preset && calc\.preset && !presetUnitsFor\(calc\.preset, calc\.expr\)/);
  assert.match(g, /The formula was edited, so it is no longer the \{label\} preset: the elements are read in their stored units \(\{v\}\), with no conversion\./);
});
