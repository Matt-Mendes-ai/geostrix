// TASKS.csv #1682 — the Geochem Simple ribbon follows the data in the project.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("surface-only tools wait in Advanced until there are surface samples", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent; this tool is in All tools whatever the data
  for (const label of ["Thresholds", "Plan map", "Domains", "Surface QAQC"]) {
    assert.match(g, new RegExp(`<RibbonButton advanced icon=\\{\\w+\\} label="${label}"`), label);
  }
});

test("QAQC, Correlation and Compositing join Simple once there are assays", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent; this tool is in All tools whatever the data
  assert.match(g, /<RibbonButton advanced icon=\{ShieldCheck\} label="QAQC"/);
  assert.match(g, /<RibbonButton advanced icon=\{GRows\} label="Compositing"/);
  assert.match(g, /<RibbonButton advanced \/\* #3907[^*]*\*\/ icon=\{Grid3x3\} label="Correlation"/);
  assert.match(g, /<RibbonButton advanced \/\* #3907 \(#2199\) \*\/ icon=\{GMapPin\} label="Plan survey"/);
});
