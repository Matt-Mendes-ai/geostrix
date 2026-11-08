// TASKS.csv #1682 — the Geochem Simple ribbon follows the data in the project.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("surface-only tools wait in Advanced until there are surface samples", () => {
  assert.match(g, /const hasSurfaceData = !!\(surfaceSamples\.length \|\| surfaceElements\.length \|\| surfaceQc\?\.records\?\.length\);/);
  for (const label of ["Thresholds", "Plan map", "Domains", "Catchments", "Surface QAQC"]) {
    assert.match(g, new RegExp(`<RibbonButton advanced=\\{!hasSurfaceData\\} icon=\\{\\w+\\} label="${label}"`), label);
  }
});

test("QAQC, Correlation and Compositing join Simple once there are assays", () => {
  assert.match(g, /<RibbonButton advanced=\{!assayElements\.length\} icon=\{ShieldCheck\} label="QAQC"/);
  assert.match(g, /<RibbonButton advanced=\{!assayElements\.length\} icon=\{GRows\} label="Compositing"/);
  assert.match(g, /<RibbonButton advanced=\{!assayElements\.length && !surfaceElements\.length\} icon=\{Grid3x3\} label="Correlation"/);
  assert.match(g, /<RibbonButton icon=\{GMapPin\} label="Plan survey"/); // planning comes before any samples: always shown
});
