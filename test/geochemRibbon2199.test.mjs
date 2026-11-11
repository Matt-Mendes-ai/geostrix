// TASKS.csv #2199 — the Simple Geochem ribbon follows the data: Correlation needs two elements; Plan survey and Public data wait in
// Advanced on a drill-only project; #2031 — Catchments waits for terrain
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
const button = (label) => g.split(/\r?\n/).find((l) => l.includes(`label="${label}"`)) || "";

test("Correlation is Advanced with fewer than two elements", () => {
  assert.match(button("Correlation"), /advanced=\{assayElements\.length \+ surfaceElements\.length < 2\}/);
});

test("Plan survey and Public data are Advanced on a drill-only project (assays, no surface samples)", () => {
  assert.match(g, /const drillOnly = assays\.length > 0 && !hasSurfaceData;/);
  assert.match(button("Plan survey"), /advanced=\{drillOnly\}/);
  assert.match(button("Public data"), /advanced=\{drillOnly\}/);
});

test("Catchments is Advanced without surface data or terrain", () => {
  assert.match(button("Catchments"), /advanced=\{!hasSurfaceData \|\| !store\.terrain\}/);
});
