// TASKS.csv #1800 (review #1646, Kodiak) — with no collars, Classify and Calc. element no longer say 'Switch to 3D View to see it' /
// 'It can now be shown downhole': they say the result cannot be drawn until collars are loaded
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
const NO_COLLARS = [
  "Generated {rows} intervals from {n} samples → {v} layer (touching samples of one class are joined).{detail} No collars are loaded, so they cannot be drawn until collars with these hole ids are imported.",
  "Added calculated element {symbol} = {expr} on {computed} assay interval(s) (range {min}–{max}){v}. Every Geochem tool can use it now; it is drawn downhole once collars are loaded. It is not recalculated if assays are re-imported.",
];

test("both notices branch on the collars", () => {
  assert.match(g, /notice\(runs\.length \? \(collars\.length \? "Generated [^"]*Switch to 3D View to see it\." : "Generated [^"]*No collars are loaded/);
  assert.match(g, /notice\(collars\.length \? "Added calculated element [^"]*It can now be shown downhole[^"]*" : "Added calculated element [^"]*drawn downhole once collars are loaded/);
});

test("the no-collar wording is in every dictionary", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of NO_COLLARS) assert.ok(d[k], `${lang}: ${k.slice(0, 40)}`);
  }
});
