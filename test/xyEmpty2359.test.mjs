// TASKS.csv #2359 — an X-Y scatter that plots nothing says which axis has no value in the samples shown (V on pXRF readings), or that no
// sample has both
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wired under the plot, for the X-Y scatter only, with keys in every dictionary", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /const xyEmptyReason = \(axes, rows, units\) => \{/);
  assert.match(g, /const none = axes\.filter\(\(ax\) => !rows\.some\(\(r\) => Number\.isFinite\(ax\.value\(r, units\)\)\)\);/);
  assert.match(g, /plottedCount === 0 && sourceRows\.length && diagramId === "xy" && xyAxes\?\.\[0\] && xyAxes\?\.\[1\] \? " " \+ xyEmptyReason\(xyAxes, sourceRows, elementUnits\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["No sample in this set has a value for {axes}.", "No sample in this set has both {x} and {y}."]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
