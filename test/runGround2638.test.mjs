// TASKS.csv #2638 — the ground built from the stations' own elevations is the inversion's own ground (used for coverage, draping, the
// engine's topography and named in the run's record); the project's terrain is not replaced unless the user makes it so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");

test("#2638 the run's ground stands in for the project's terrain in the panel", () => {
  assert.match(p, /terrain: projectTerrain \/\* #2638/);
  assert.match(p, /const terrain = runGround && runGround\.survey === activeSurvey \? runGround\.t : projectTerrain;/);
  assert.match(p, /const topo = terrain \? terrainPoints\(terrain, box, 40000\) : null;/); // what the engine gets
});

test("#2638 the station ground no longer replaces the project's terrain", () => {
  const i = p.indexOf("const groundFromStations = () => {"), body = p.slice(i, p.indexOf("\n  };", i));
  assert.ok(i > 0 && !/addTerrain\(/.test(body) && !/confirmReplaceTerrain/.test(body));
  assert.match(body, /setRunGround\(\{ survey: activeSurvey, t: \{ name,/);
  assert.match(p, /const groundToProject = \(\) => \{[\s\S]*?if \(!confirmReplaceTerrain\(projectTerrain, t\.name\)\) return;/);
  assert.match(p, /ground: runGround && runGround\.survey === activeSurvey \? `this run's own: \$\{runGround\.stats\.stations\} station elevations/);
  assert.match(p, /tr\("Use the project's terrain instead"\)/);
});
