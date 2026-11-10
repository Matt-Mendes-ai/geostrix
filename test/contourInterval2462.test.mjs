// TASKS.csv #2462 (review #2325, WA uranium) — the contour interval from the terrain's relief, sub-metre steps, a repeat replaces its copy
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { niceContourInterval, terrainRange, MIN_CONTOUR_INTERVAL } from "../src/lib/contourInterval.js";

test("a 1-2-5 step near range / 12", () => {
  assert.equal(niceContourInterval(318.3, 346.5), 2); // the WA collar terrain: 28 m of relief -> 2 m, 14 levels
  assert.equal(niceContourInterval(900, 2100), 100);
  assert.equal(niceContourInterval(100, 104), 0.2); // a salt-lake plain: 4 m of relief, 20 levels
  assert.equal(niceContourInterval(100, 100.3), MIN_CONTOUR_INTERVAL);
  assert.equal(niceContourInterval(5, 5), 10); // no relief: a fallback, nothing to draw anyway
});

test("the terrain's range leaves out the no-data fill", () => {
  assert.deepEqual(terrainRange({ elevations: new Float64Array([320, 318.3, 346.5, NaN]) }), [318.3, 346.5]);
  assert.equal(terrainRange({ elevations: [] }), null);
});

test("the form: opens on the relief's step, takes decimals and says a raise, replaces a repeat", () => {
  const s = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(s, /if \(!contourOpen && !contourTyped\) \{ const r = terrainRange\(terrain\); if \(r\) setContourInterval\(niceContourInterval\(r\[0\], r\[1\]\)\);/);
  assert.match(s, /min=\{MIN_CONTOUR_INTERVAL\} step="any"/);
  assert.match(s, /was raised to \{min\} m, the smallest interval/);
  assert.match(s, /b\.contourInterval === contourInterval && b\.contourTerrain === terrain\.name/);
});
