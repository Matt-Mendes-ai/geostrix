// TASKS.csv #2938 (review #2876, WA iron) — Identify listed an iron-ore sample's elements in a fixed metal order (Cu, Zn, Pb, As, Ni, Co, Sn,
// Mn before Si, Al, P and LOI). The project's lead commodity comes first now, and with a bulk lead (Fe, Mn, Al) the major elements follow it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { leadFirst } from "../src/lib/viewer/identify.js";
import { orderedElements } from "../src/lib/viewer/sampleTip.js";

const iron = Array.from({ length: 400 }, (_, i) => ({ hole_id: `H${i}`, from: 0, to: 2, values: { Al: 2.1, As: 0.001, Cu: 0.01, Fe: 58 + (i % 6), Mn: 0.05, Ni: 0.004, P: 0.08, Pb: 0.001, Si: 4.2, LOI: 6.1, Zn: 0.003 } }));
const copper = Array.from({ length: 400 }, (_, i) => ({ hole_id: `C${i}`, from: 0, to: 2, values: { Ag: 2, Au: 0.05, Cu: i % 3 ? 1500 : 300, Fe: 40000, Mo: 20, Zn: 90 } }));

test("an iron-ore table: Fe, then Si / Al / P / LOI / Mn before the trace metals", () => {
  const units = { Al: "%", As: "%", Cu: "%", Fe: "%", Mn: "%", Ni: "%", P: "%", Pb: "%", Si: "% SiO2", LOI: "%", Zn: "%" }; // as WA iron
  const first = leadFirst(iron, units);
  assert.equal(first[0], "Fe");
  assert.deepEqual(orderedElements(iron[0].values, first).slice(0, 6), ["Fe", "Mn", "Al", "Si", "P", "LOI"]);
  assert.ok(orderedElements(iron[0].values, first).indexOf("Cu") > orderedElements(iron[0].values, first).indexOf("LOI"));
  assert.equal(leadFirst(iron, units), first, "kept per assay table");
});

test("a copper table keeps its metals first: the lead alone, no majors pulled forward", () => {
  assert.deepEqual(leadFirst(copper), ["Cu"]);
  assert.deepEqual(orderedElements(copper[0].values, ["Cu"]).slice(0, 3), ["Cu", "Au", "Ag"]);
  assert.deepEqual(leadFirst([]), []);
  assert.deepEqual(leadFirst(null), []);
});

test("wiring: the element the bar shows first, then the lead; ViewerModule hands Identify the assays", () => {
  const s = fs.readFileSync(new URL("../src/lib/viewer/identify.js", import.meta.url), "utf8");
  assert.match(s, /orderedElements\(row\.values, \[\.\.\.\(shownSym \? \[shownSym\] : \[\]\), \.\.\.\(ctx\.leadFirst\?\.\(\) \|\| \[\]\)\]\)/);
  assert.match(s, /leadFirst: \(\) => leadFirst\(r\.assays, r\.units\), \/\/ #2938/);
  assert.match(fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /codeDictionary \/\* #2816 \*\/, assays \/\* #2938 \*\/, units:/);
});
