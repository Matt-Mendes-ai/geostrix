// TASKS.csv #3120 (#2910's remaining stalls, WA iron review) — the Geochem tab re-derived its samples, QC split, lead partner, hole colours,
// lithology per sample, X-Y statistics and fit, counts and the diagram's projection on every visit (2.2 s on 147,000 samples): keptMemo keeps
// them across mounts while the arrays they come from are the same objects and the settings are the same
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keptMemo } from "../src/lib/keptMemo.js";

test("the same roots and key: computed once; another key, another root or a changed array: computed again", () => {
  const a = [1, 2, 3], b = [4];
  let n = 0;
  const f = () => { n++; return { n }; };
  const r1 = keptMemo([a], "k", f), r2 = keptMemo([a], "k", f);
  assert.equal(r1, r2); assert.equal(n, 1);
  keptMemo([a], "other", f); assert.equal(n, 2);
  keptMemo([b], "k", f); assert.equal(n, 3);
  keptMemo([a.slice()], "k", f); assert.equal(n, 4, "a new array (the store's data changed) is a new root");
});

test("several roots, null roots, chains of different lengths kept apart, and a bounded number of results per root", () => {
  const a = [1], c = { x: 1 };
  let n = 0;
  const f = () => ++n;
  assert.equal(keptMemo([a, c], "k", f), keptMemo([a, c], "k", f));
  assert.equal(keptMemo([a, null], "k", f), keptMemo([a, undefined], "k", f), "null and undefined are the same empty root");
  const one = keptMemo([a], "k", f), two = keptMemo([a, c], "k", f);
  assert.notEqual(one, two);
  const big = [0];
  for (let i = 0; i < 30; i++) keptMemo([big], `s${i}`, f);
  const before = n;
  keptMemo([big], "s0", f);
  assert.equal(n, before + 1, "the oldest settings were dropped past 24");
  keptMemo([big], "s29", f);
  assert.equal(n, before + 1, "the newest are kept");
  assert.equal(keptMemo([], "k", () => "x"), "x");
});

test("wiring: the Geochem tab's derived samples and the plot's projection are kept", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  for (const re of [/keptMemo\(\[assays\], "kept"/, /keptMemo\(\[assaysKept\], `src\|\$\{plotSource\}\|\$\{hasPxrf\}`/, /keptMemo\(\[sourceAll\], `rows\|\$\{plotQc\}\|\$\{qcInSource\}`/,
    /keptMemo\(\[sourceRows, assayElements\], `pair\|\$\{xyLead\}`/, /keptMemo\(\[assays\], "holeColors"/, /keptMemo\(\[assays, layers\?\.litho\], "lith"/,
    /keptMemo\(\[sourceRows, sampleLith\], `plot\|/, /keptMemo\(\[plotted, assayElements, store\.layers, store\.customLayers\], `stat\|/, /keptMemo\(\[plotted, diagram\], `count\|\$\{unitsKey\}`/]) assert.match(g, re);
  const p = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");
  assert.match(p, /keptMemo\(\[samples, diagram\], `proj\|\$\{JSON\.stringify\(elementUnits \|\| \{\}\)\}`/);
});
