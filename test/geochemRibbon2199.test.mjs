// TASKS.csv #2199 — the Simple Geochem ribbon follows the data: Correlation needs two elements; Plan survey and Public data wait in
// Advanced on a drill-only project; #2031 — Catchments waits for terrain
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
const button = (label) => g.split(/\r?\n/).find((l) => l.includes(`label="${label}"`)) || "";

test("Correlation is Advanced with fewer than two elements", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent; this tool is in All tools whatever the data
  assert.match(button("Correlation"), /<RibbonButton advanced \/\* #3907/);
});

test("Plan survey and Public data are Advanced on a drill-only project (assays, no surface samples)", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent; this tool is in All tools whatever the data
  assert.match(button("Plan survey"), /<RibbonButton advanced \/\* #3907/);
  assert.match(button("Public data"), /<RibbonButton advanced \/\* #3907/);
});

test("Catchments is Advanced without surface data or terrain", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent; this tool is in All tools whatever the data
  assert.match(button("Catchments"), /<RibbonButton advanced \/\* #3907/);
});
