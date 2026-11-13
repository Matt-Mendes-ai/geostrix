// TASKS.csv #2867 (GRS67 normal gravity, observed gravity not labelled Bouguer), #2870 (wording for gravity), #2871 (small things), #2878 (a
// point survey's legend in the Layout legend)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { grs67FreeAir, grs67Normal } from "../src/lib/gravityReduction.js";
import { guessSurveyMethod } from "../src/lib/geophysSurveys.js";
import { geophysLegendGroups } from "../src/lib/legendGroups.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("#2867 GRS67 with 0.3086 mGal/m reproduces the GSC's own free-air column", () => {
  // Matagami_DAP.csv station 10328 (GSC, public): lat 49.6881, ELEVATION 277.618 m, ADJG 980925.495 mGal, FREEAIR -30.46 (WGS84 gave -31.22)
  assert.ok(Math.abs(grs67FreeAir(980925.495, 49.6881, 277.618) - -30.46) < 0.01, String(grs67FreeAir(980925.495, 49.6881, 277.618)));
  // the formula: 978,031.846 mGal at the equator, 983,217.7 at the pole
  assert.ok(Math.abs(grs67Normal(0) - 978031.846) < 1e-6);
  assert.ok(Math.abs(grs67Normal(90) - 983217.7) < 0.1);
});

test("#2867 an observed-gravity column is not labelled a Bouguer anomaly", () => {
  for (const h of ["OBSERVED_GRAVITY", "ADJG", "Obs_Grav", "G_obs", "absolute_gravity"]) assert.equal(guessSurveyMethod(h), null, h);
  assert.equal(guessSurveyMethod("BOUGUER"), "grav");
  assert.equal(guessSurveyMethod("Gravity_mGal"), "grav");
  assert.equal(guessSurveyMethod("FREEAIR"), "grav_fa");
});

test("#2867 wiring: the reductions box offers GRS67 and computes its free-air anomaly before the engine", () => {
  const b = read("../src/components/GravityReductionBox.jsx");
  assert.match(b, /<option value="grs67">/);
  assert.match(b, /input: grs \? "freeair" : input/);
  assert.match(b, /g: grs \? withZ\.map\(\(r, i\) => grs67FreeAir\(r\.value, ll\[i\]\?\.y \?\? 0, r\.z\)\)/);
});

test("#2870 gravity wording: the spectrum's depths below the observation level, mGal among the unit examples", () => {
  const r = read("../src/modules/RasterModule.jsx");
  assert.match(r, /below the observation level: the ground for ground stations, the sensor for an airborne survey/);
  assert.doesNotMatch(r, /below the sensor\. Subtract the survey's sensor height/);
  assert.match(read("../src/components/RasterColourControls.jsx"), /the unit, e\.g\. nT, mGal, mV\/V/);
});

test("#2871 small things: the Source CRS kept, Clear clears the notices, no '-0 m', 'no data', no 'undefined', real buttons", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /useState\(\(\) => keptGeophysSourceEpsg\)/);
  assert.match(g, /keptGeophysSourceEpsg = v; setGeophysSourceEpsg\(v\);/);
  assert.match(g, /replaceLayer\("geophys_pts", \[\]\); setError\(null\); setXyzError\(null\);/);
  assert.match(g, /aria-label=\{tr\("Colour stretch of \\"\{name\}\\"", \{ name: model\.name \?\? tr\("Geophysics points"\) \}\)\}/);
  assert.match(g, /<button type="button" aria-label=\{tr\("Remove survey \\"\{key\}\\"", \{ key: sv\.key \}\)\}/);
  assert.match(read("../src/components/IdentifyPanel.jsx"), /z: \(Math\.round\(it\.world\.z\) \|\| 0\)\.toLocaleString\(\)/);
  assert.equal((Math.round(-0.3) || 0).toLocaleString(), "0");
  assert.match(read("../src/lib/viewer/identify.js"), /else fields\.push\(\[tr\("Value"\), tr\("No data at this point"\)\]\);/);
});

test("#2878 the point surveys' legend: one ramp per survey, the drawn points only, none when hidden; the Layout legend lists it", () => {
  const rows = [
    ...[1, 2, 3, 4].map((v) => ({ x: v, y: 0, z: 300, value: -60 + v, _src: "blake.csv · BOUGUER" })),
    ...[1, 2, 3].map((v) => ({ x: v, y: 0, z: 300, value: -30 + v, _src: "blake.csv · FREEAIR" })),
    { x: 9, y: 9, z: null, value: 500, _src: "nogeo.csv" }, // no elevation: not drawn, not listed
  ];
  const surveys = { "blake.csv · BOUGUER": { units: "mGal" }, "blake.csv · FREEAIR": { units: "mGal" } };
  const g = geophysLegendGroups({ rows, surveys });
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.label), ["blake.csv · BOUGUER (mGal)", "blake.csv · FREEAIR (mGal)"]);
  assert.deepEqual(geophysLegendGroups({ rows, surveys, visible: false }), []);
  assert.deepEqual(geophysLegendGroups({ rows: rows.slice(-1) }), []);
  const one = geophysLegendGroups({ rows: rows.slice(0, 4), surveys, label: "Geophysics points" });
  assert.equal(one.length, 1);
  assert.match(read("../src/modules/LayoutModule.jsx"), /\.\.\.geophysLegendGroups\(\{ rows: layers\?\.geophys_pts, visible: layerVisible\.geophys_pts !== false/);
});
