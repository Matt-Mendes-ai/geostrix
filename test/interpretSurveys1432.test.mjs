// TASKS.csv #1432 — the Interpretation lines pane listed a cleared survey (geophysSurveys keeps its settings after its points are gone)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the survey list is built from the points that exist, not the settings table", () => {
  const s = readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(!/Object\.keys\(geophysSurveys/.test(s));
  assert.match(s, /const keys = new Set\(\);\n\s*\(layers\.geophys_pts \|\| \[\]\)\.forEach\(\(r\) => keys\.add\(surveyKey\(r\)\)\);/);
});
