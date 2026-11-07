// TASKS.csv #1446 / #1447 (review #1352, Silvertip) — the stereonet's 'Add as structural trend' keeps the user on their tab and names the
// Terzaghi-weighted mean as such; 'Model it' is disabled with a reason until a polygon map exists, and Model from map asks only for
// what is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1446 the trend: no tab switch, named with its weighting", () => {
  const v = read("src/modules/ViewerModule.jsx");
  const i = v.indexOf("onUseAsTrend={({ azimuth, dip, terzaghi }) => {"), j = v.indexOf("/>", i);
  assert.ok(i > 0);
  const body = v.slice(i, j);
  assert.ok(body.includes('`Stereonet mean${terzaghi ? " (Terzaghi-weighted)" : ""} (${dip.toFixed(0)}° → ${azimuth.toFixed(0)}°)`'));
  assert.ok(!body.includes('goToModule("modelling")'));
  assert.ok(read("src/components/StereonetModal.jsx").includes("onUseAsTrend({ azimuth: stats.meanDipDir, dip: stats.meanDip, terzaghi: !!terzaghiOn });"));
});

test("#1447 Model it disabled without a polygon map; the message names only what is missing", () => {
  const p = read("src/modules/viewer/ViewerParts.jsx");
  assert.ok(p.includes("disabled={!mapPolygons} disabledReason=\"Import a geology map (Geology map) or draw its units (Unit polygons) first"));
  assert.ok(read("src/modules/ViewerModule.jsx").includes('mapPolygons={(mapLayers || []).some((l) => l.geomType === "polygon")}'));
  assert.ok(read("src/components/MapModelPanel.jsx").includes("the {n} outcrop measurement(s) are already loaded."));
});
