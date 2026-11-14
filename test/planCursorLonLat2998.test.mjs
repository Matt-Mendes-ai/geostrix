// TASKS.csv #2998 / #2298 (WA iron, WA lode-gold reviews) — the Maps plan's cursor read E / N only, in no named frame: no longitude / latitude to find a zone
// edge or a point from a report in degrees
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointTransform } from "../src/lib/reproject.js";

test("the cursor's longitude / latitude is the project CRS's inverse, as the review's hand check", () => {
  const T = pointTransform(26909, 4326);
  const [lon, lat] = T(350500, 6333500);
  assert.ok(Math.abs(lat - 57.1) < 0.1 && Math.abs(lon + 131.5) < 0.1, `${lat} ${lon}`);
});

test("the plan appends it to the readout, and says 'local grid' when the project has no CRS", () => {
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /\$\{frameText\}\$\{lonLatText\(toLonLat, cursor\)\}\$\{cursorValueText\(rasters, cursor\)\}/);
  assert.match(p, /project\?\.crsSet === false \? tr\(" \(local grid\)"\) : ""/);
  assert.match(p, /!isGeographicCrs\(project\.epsg\) \? pointTransform\(project\.epsg, 4326\) : null/);
});
