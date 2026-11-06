// TASKS.csv #1526 — Calc. element presets were VMS (and, since #1678, porphyry) only; GeoStrix serves any deposit type (Matt, 2026-11-06):
// Ag/Au, Zn + Pb, Sr/Y, K/Rb, Ni/Cu and Th/U now
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CALC_PRESETS, addCalculatedElement } from "../src/lib/calcElement.js";

test("the two presets exist with what they need", () => {
  const by = Object.fromEntries(CALC_PRESETS.map((p) => [p.name, p]));
  assert.deepEqual([by.AgAu.expr, by.AgAu.needs], ["Ag/Au", ["Ag", "Au"]]);
  assert.deepEqual([by.ZnPb.expr, by.ZnPb.needs], ["Zn+Pb", ["Zn", "Pb"]]);
});

test("their labels and notes are translated", () => {
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const p of CALC_PRESETS.filter((x) => ["AgAu", "ZnPb", "SrY", "KRb", "NiCu", "ThU"].includes(x.name))) { assert.ok(j[p.label], `${l} ${p.label}`); assert.ok(j[p.unitNote], `${l} ${p.unitNote}`); }
  }
});

test("Ag/Au computes per interval", () => {
  const assays = [{ hole_id: "A", from: 0, to: 1, values: { Ag: 50, Au: 5 } }, { hole_id: "A", from: 1, to: 2, values: { Ag: 3 } }];
  const r = addCalculatedElement(assays, [{ symbol: "Ag", unit: "ppm" }, { symbol: "Au", unit: "ppm" }], "AgAu", "Ag/Au", "index");
  assert.equal(r.assays[0].values.AgAu, 10);
  assert.equal(r.assays[1].values.AgAu, undefined);
});

test("K/Rb converts K from % to ppm; the others are plain ratios", () => {
  const by = Object.fromEntries(CALC_PRESETS.map((p) => [p.name, p]));
  assert.equal(by.KRb.expr, "K*10000/Rb");
  assert.deepEqual(["SrY", "NiCu", "ThU"].map((k) => by[k].expr), ["Sr/Y", "Ni/Cu", "Th/U"]);
  const r = addCalculatedElement([{ hole_id: "P", from: 0, to: 1, values: { K: 3, Rb: 600 } }], [{ symbol: "K", unit: "%" }, { symbol: "Rb", unit: "ppm" }], "KRb", by.KRb.expr, "index");
  assert.equal(r.assays[0].values.KRb, 50);
});
