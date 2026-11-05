// TASKS.csv #1678 — porphyry presets, and the tools open on a commodity (or the last element used) instead of Ag
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALC_PRESETS, addCalculatedElement } from "../src/lib/calcElement.js";
import { preferredElement, correlationDefaults, rememberElement } from "../src/lib/preferredElement.js";

test("molar K/Al reproduces Copley's pXRF ratio column formula", () => {
  const k = CALC_PRESETS.find((p) => p.name === "KAl");
  const r = addCalculatedElement([{ values: { K: 3.9098, Al: 2.6982 } }, { values: { K: 1, Al: 8 } }], [{ symbol: "K", unit: "%" }, { symbol: "Al", unit: "%" }], "KAl", k.expr);
  assert.ok(Math.abs(r.assays[0].values.KAl - 1) < 1e-12);
  assert.ok(Math.abs(r.assays[1].values.KAl - (1 / 39.098) / (8 / 26.982)) < 1e-12);
  for (const name of ["NaAl", "CNKAl", "CuAu"]) assert.ok(CALC_PRESETS.some((p) => p.name === name), name);
  assert.ok(CALC_PRESETS.findIndex((p) => p.name === "AI") < CALC_PRESETS.findIndex((p) => p.name === "KAl"), "the VMS presets keep their place");
});

test("a commodity first, else the first element; the last used wins when it is there", () => {
  const els = ["Ag", "Al", "As", "Au", "Co", "Cu", "Fe", "K", "Mo", "Na", "S"];
  assert.equal(preferredElement(els), "Cu");
  assert.equal(preferredElement(["Ag", "Al"]), "Ag");
  assert.equal(preferredElement(["Al", "Ca"]), "Al");
  assert.equal(preferredElement([]), "");
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  rememberElement("gradestats", "Mo");
  assert.equal(preferredElement(els, "gradestats"), "Mo");
  assert.equal(preferredElement(["Cu", "Au"], "gradestats"), "Cu", "a remembered element not in this project is ignored");
  delete globalThis.localStorage;
});

test("correlation ticks the commodity / alteration suite, then fills up in file order", () => {
  const els = ["Ag", "Al", "As", "Au", "B", "Ba", "Be", "Bi", "Ca", "Cd", "Ce", "Co", "Cr", "Cu", "Fe", "K", "Mo", "Na", "S", "Te", "Zn"];
  const d = correlationDefaults(els);
  assert.equal(d.length, 12);
  for (const s of ["Cu", "Au", "Mo", "Ag", "S", "Fe", "K", "Na", "As", "Bi", "Te", "Zn"]) assert.ok(d.includes(s), s);
  assert.deepEqual(correlationDefaults(["Al", "Ca", "Cu"]), ["Cu", "Al", "Ca"]);
});

test("the four tools use it", () => {
  for (const f of ["BestIntercepts", "CompositingModal", "GradeStatistics"]) assert.ok(readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").includes("preferredElement("), f);
  assert.ok(readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8").includes("correlationDefaults(allSymbols)"));
});
