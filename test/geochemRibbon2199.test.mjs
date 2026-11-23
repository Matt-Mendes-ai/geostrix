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

test("Plan survey is in Basic tools (#4042); Public data is Advanced on a drill-only project (assays, no surface samples)", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent. TASKS.csv #4042: a user could not find the stream-site planner, so
  // Plan survey moved to Basic tools (no `advanced`); it is also reached from Maps > Terrain and the terrain's menu
  assert.match(button("Plan survey"), /<RibbonButton \/\* Basic tools: TASKS\.csv #4042 \(was Advanced: #3907, #2199\) \*\/ icon=\{GMapPin\} label="Plan survey"/);
  assert.doesNotMatch(button("Plan survey"), /<RibbonButton advanced/);
  assert.match(button("Public data"), /<RibbonButton advanced \/\* #3907/);
});

test("Catchments is Advanced without surface data or terrain", () => {
  // #3907 (redesign P3): the Basic tools list is fixed now, not data-dependent; this tool is in All tools whatever the data
  assert.match(button("Catchments"), /<RibbonButton advanced \/\* #3907/);
});
