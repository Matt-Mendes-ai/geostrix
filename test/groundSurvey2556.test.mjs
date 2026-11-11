// TASKS.csv #2556 — a ground gravity survey ('z column is the ground; add the sensor height', 0.5 m) was refused: the sidecar's 1 m clearance
// rule, and a ground built from the stations that missed its own stations by up to 0.45 m (smooth) or 1.7 m (stepped elevations).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainFromSurveyElevations } from "../src/lib/terrainFromPoints.js";
import { terrainGroundAt } from "../src/lib/viewer/geomath.js";

const survey = (zOf) => { const pts = []; for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) pts.push({ x: 412000 + i * 100, y: 6500000 + j * 100, z: zOf(i, j) }); return pts; };

test("the ground from the stations passes through its own stations (smooth and stepped elevations)", () => {
  for (const zOf of [(i, j) => 250 + 30 * Math.sin(i / 5) + 20 * Math.cos(j / 4), (i, j) => 200 + 20 * Math.floor(i / 5) + 10 * Math.floor(j / 7)]) {
    const pts = survey(zOf), t = terrainFromSurveyElevations(pts);
    const worst = Math.max(...pts.map((p) => Math.abs(terrainGroundAt(t, p.x, p.y) - p.z)));
    assert.ok(worst < 0.05, String(worst));
    assert.ok(t.stats.misfitBeforeM > 0.3, "the plain inverse-distance grid missed them");
    assert.ok(t.stats.stationMisfitM < 0.05);
  }
});

test("the sensor height is taken off before the ground is built, and a flat survey needs no correction", () => {
  const t = terrainFromSurveyElevations(survey(() => 300.5), { sensorHeight: 0.5 });
  assert.ok(Math.abs(terrainGroundAt(t, 413000, 6501000) - 300) < 1e-6);
  assert.equal(t.stats.misfitBeforeM, 0);
});

test("the request tells the engine the stations are on the ground with the entered height; the engine's rule follows it", () => {
  const inv = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(inv, /\.\.\.\(zModeEff === "ground" \? \{ stationsOnGround: true, sensorHeight: num\(sensorHeight\) \} : \{\}\)/);
  const py = readFileSync(new URL("../python-sidecar/app/geophys/potential.py", import.meta.url), "utf8");
  assert.match(py, /min_clear = 0\.0 if \(req\.get\("stationsDraped"\) or on_ground or req\.get\("method"\) == "grav"\) else 1\.0/);
});
