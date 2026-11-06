// TASKS.csv #1969 — the mag / gravity inversion says what it expects and refuses what it cannot invert
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");

test("#1969 the magnetics confirm box no longer says the IGRF is already removed, and says GeoStrix does not remove it", () => {
  assert.doesNotMatch(src, /the IGRF\/regional field has already been removed/);
  assert.match(src, /GeoStrix does not remove the IGRF itself\./);
});

test("#1969 a ground survey's z plus a sensor height; a non-invertible method and the raw field with no base level are refused", () => {
  assert.ok(src.includes('zModeEff === "ground" ? r.z + num(sensorHeight)')); // zModeEff: #1710 (a planned grid is 'sensor')
  assert.ok(src.includes('tr("z column is the ground; add the sensor height")'));
  assert.ok(src.includes('if (zModeEff === "ground" && !(num(sensorHeight) > 0)) problems.push('));
  assert.ok(src.includes("!methodIsInvertible(geophysSurveys[activeSurvey].method)) problems.push("));
  assert.ok(src.includes('if (method === "mag" && baseLevel === "none" && rows.length)'));
  assert.doesNotMatch(src, /Point cloud \(CSV\) above/);
});
