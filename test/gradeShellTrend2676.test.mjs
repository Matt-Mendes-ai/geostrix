// TASKS.csv #2676 (split from #2423, review #2325 WA uranium; also #2551 WA lithium) — a grade shell run under a structural trend:
// (1) the Grade shell pane prints the trend's search ellipsoid next to 'Search (m)', as Estimation does; (2) the 'doubling the search
// radius roughly multiplies the volume by eight' sentence is not so for a flat body or a flat search, and is now worded as a bound;
// (3) the Solid blocks rows and Estimation's 'Restrict to a modelled volume' list read the shell's own (trend-aware, #2423) name.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchEllipsoidAxes, trendScales } from "../src/lib/trend.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8");

test("#2676: searchEllipsoidAxes gives the semi-axes the run searches with", () => {
  // the reviewer's runs: a flat 10 : 10 : 1 trend at 200 m -> 200 x 200 x 20 m; a 5 : 3 : 1 trend at 50 m -> params.searchEllipsoidM [50, 30, 10]
  assert.deepEqual(searchEllipsoidAxes({ name: "Trend 1", dip: 0, dipAzimuth: 0, pitch: 0, ratios: { max: 10, int: 10, min: 1 } }, 200), [200, 200, 20]);
  assert.deepEqual(searchEllipsoidAxes({ name: "Trend 1", dip: 49, dipAzimuth: 258, pitch: 152, ratios: { max: 5, int: 3, min: 1 } }, 50), [50, 30, 10]);
  // ratios given in any order are sorted, as cleanTrend does everywhere else
  assert.deepEqual(searchEllipsoidAxes({ ratios: { max: 1, int: 4, min: 2 } }, 100), [100, 50, 25]);
  assert.deepEqual(searchEllipsoidAxes({ ratios: { max: 3, int: 2, min: 1 } }, 0), [0, 0, 0]);
});

test("#2676: the same numbers as the shell run's searchEllipsoidM (modellingRuns: [1, major/semiMajor, major/minor] x R)", () => {
  const t = { dip: 30, dipAzimuth: 120, pitch: 45, ratios: { max: 7, int: 3, min: 1.5 } };
  const s = trendScales(t), R = 137;
  const run = [1, s.major / s.semiMajor, s.major / s.minor].map((f) => Math.round(R * f * 10) / 10);
  assert.deepEqual(searchEllipsoidAxes(t, R), run);
  assert.match(read("src", "modules", "viewer", "modellingRuns.js"), /\[1, gsScl\.major \/ gsScl\.semiMajor, gsScl\.major \/ gsScl\.minor\]/);
});

test("#2676: the Grade shell pane shows the grade-shell trend with Estimation's own sentence", () => {
  const panes = read("src", "modules", "viewer", "ModellingPanes.jsx"), est = read("src", "components", "GradeEstimationModal.jsx");
  const key = 'tr("Along trend \\"{name}\\": an ellipsoid of {searchRadius} × {v} × {v2} m ({v3})"';
  assert.ok(est.includes(key) && panes.includes(key), "one translated sentence for both tools");
  assert.match(panes, /trendFor\("gradeShell"\)/); // the key modellingRuns' trendWarp("gradeShell") reads
  assert.match(panes, /searchEllipsoidAxes\(gt, numericSearchRadius/);
});

test("#2676: no text still claims doubling the radius multiplies the volume by eight", () => {
  const files = ["src/modules/viewer/ClosureNote.jsx", "src/modules/viewer/ModellingPanes.jsx", "src/modules/viewer/modellingRuns.js", "src/locales/es.json", "src/locales/pt.json", "src/locales/fr.json", "src/locales/ar.json"];
  for (const f of files) assert.doesNotMatch(read(f), /roughly multiplies the volume by eight/, f);
  for (const f of files.slice(0, 3)) assert.match(read(f), /can multiply the volume by up to eight/, f);
});

test("#2676: Restrict to a modelled volume and Solid blocks name a shell by its own name (which carries the trend since #2423)", () => {
  assert.match(read("src", "components", "GradeEstimationModal.jsx"), /tr\("\{name\} — \{v\}", \{ name: v\.name/);
  assert.match(read("src", "components", "SurfaceSolidsPanel.jsx"), /id: s\.id, name: s\.name/);
  assert.match(read("src", "modules", "viewer", "modellingRuns.js"), /trendRatioText/);
});
