// TASKS.csv #2231 / #2242 (review #2174, WA gold) — the core orientation calculator and the Geophysics panes never use or print the
// placeholder EPSG:3156 as the project's CRS while it is not chosen
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#2231 a true / magnetic field reference is not converted with the placeholder", () => {
  const c = read("src/components/CoreOrientationCalculator.jsx");
  const guard = c.indexOf('if (project?.crsSet === false) { setNewRefMsg(tr("The project\'s coordinate system is not chosen yet');
  assert.ok(guard > 0 && guard < c.indexOf("azimuthToGridOffset(newRefNorth.ref"), "the guard comes before the conversion");
});

test("#2242 Point survey's Source CRS, the DC-IP line text, its station reprojection and its result", () => {
  const g = read("src/modules/GeophysicsModule.jsx");
  assert.match(g, /defaultText=\{project\?\.crsSet === false \? tr\("The project CRS — not chosen yet"\)/);
  const d = read("src/components/DcipPanel.jsx");
  assert.match(d, /\{ v: project\?\.epsg && project\?\.crsSet !== false/);
  assert.match(d, /const dst = Number\(projectTargetEpsg\(project\)\);/);
  assert.match(d, /const dst = Number\(adopted \|\| projectTargetEpsg\(project\)\);/);
  assert.match(d, /crs: project\?\.crsSet === false \? "not set" : `EPSG:\$\{project\?\.epsg\}`/);
});
