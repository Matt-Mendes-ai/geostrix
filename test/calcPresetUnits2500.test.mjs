// TASKS.csv #2500 (review #2486, WA lithium) — a calculated-element preset reads each element in its own unit, converted from the stored one
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addCalculatedElement, CALC_PRESETS, presetConversions } from "../src/lib/calcElement.js";

const krb = CALC_PRESETS.find((p) => p.name === "KRb");
const rows = [{ values: { K: 2.6, Rb: 0.4 } }, { values: { K: 3.1, Rb: 0.0023 } }]; // an XRF suite: K and Rb both in %

test("K/Rb on Rb stored in %: Rb is read in ppm, so the ratio is K/Rb, not 10,000 times it", () => {
  const els = [{ symbol: "K", unit: "%" }, { symbol: "Rb", unit: "%" }];
  const r = addCalculatedElement(rows, els, "KRb", krb.expr, "index", { readUnits: krb.units });
  assert.ok(Math.abs(r.assays[0].values.KRb - 6.5) < 1e-9, String(r.assays[0].values.KRb)); // 2.6 / 0.4
  assert.ok(Math.abs(r.assays[1].values.KRb - 3.1 / 0.0023) < 1e-6);
  assert.deepEqual(r.converted.map((c) => [c.sym, c.from, c.to, c.factor]), [["Rb", "%", "ppm", 10000]]);
  const raw = addCalculatedElement(rows, els, "KRb2", krb.expr); // no readUnits: the old behaviour, the stored numbers
  assert.ok(Math.abs(raw.assays[0].values.KRb2 - 65000) < 1e-6);
});

test("stored as the preset expects: nothing converted; an unconvertible unit is refused", () => {
  const els = [{ symbol: "K", unit: "%" }, { symbol: "Rb", unit: "ppm" }];
  assert.deepEqual(presetConversions(els, krb.units), []);
  assert.throws(() => presetConversions([{ symbol: "K", unit: "cps" }, { symbol: "Rb", unit: "ppm" }], krb.units), /cannot convert/);
  assert.ok(CALC_PRESETS.every((p) => p.units && p.needs.every((s) => p.units[s])), "every preset names a unit for each element it needs");
});

test("the dialog passes the preset's units only while its formula is unchanged", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.equal((g.match(/readUnits: presetUnitsFor\(calc\.preset, calc\.expr\)/g) || []).length, 2); // #2619: spaces ignored, any other edit drops it
});
