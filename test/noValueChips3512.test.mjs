// TASKS.csv #3512 (a positions-only survey says 'no value', not 0: Identify, CSV export, project KMZ) and #3513 ('unsampled chips' on RC holes in the pit panes, Grade-tonnage and
// Compositing), and #3445 (b) (GEOSTRIX_BUILD_DIR moves only the local build's output). SYNTHETIC rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { geophysTipText } from "../src/lib/viewer/geophysPts.js";
import { surveyExportRows } from "../src/lib/geophysSurveyTools.js"; // TASKS.csv #3590

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3512 Identify: an electrode's tooltip says there is no measured value, a measured point keeps its value", () => {
  const e = { _src: "el.csv", x: 1, y: 2, z: 3, value: 0 }, m = { _src: "mag.csv", x: 1, y: 2, z: 3, value: 55123 };
  const surveys = { "el.csv": { positionsOnly: true }, "mag.csv": { units: "nT" } };
  assert.match(geophysTipText(e, surveys), /no measured value \(positions only\)/);
  assert.doesNotMatch(geophysTipText(e, surveys), /value: 0/);
  assert.match(geophysTipText(m, surveys), /value: 55123 nT/);
});

test("#3512 CSV export: no value column for a positions-only survey, the usual one otherwise", () => {
  const pts = [{ x: 1, y: 2, z: 3, value: 0 }, { x: 4, y: 5, z: 6, value: 0 }];
  const a = surveyExportRows(pts, { positionsOnly: true });
  assert.equal(a.valueName, "");
  assert.deepEqual(Object.keys(a.rows[0]), ["x", "y", "z"]);
  const b = surveyExportRows([{ x: 1, y: 2, z: 3, value: 7 }], { method: "mag_tmi", units: "nT" });
  assert.deepEqual(Object.keys(b.rows[0]), ["x", "y", "z", "mag_tmi_nT"]);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /valueName \? `\$\{valueName\}: the value as stored in GeoStrix[^\n]*: "no value column: positions only"/);
});

test("#3512 project KMZ: the surveys' records reach the writer, which writes positions-only points as their own grey placemark", () => {
  assert.match(read("../src/lib/projectKmzExport.js"), /geophysSurveys: store\.geophysSurveys,/);
  const k = read("../src/lib/projectKmz.js");
  assert.match(k, /const noValue = \(r\) => ctx\.geophysSurveys\?\.\[r\._src \|\| "\(unnamed import\)"\]\?\.positionsOnly;/);
  assert.match(k, /`\$\{k\} \(positions only, no value\)`/);
  assert.match(k, /measured\.forEach\(\(r, i\) =>/, "the classes are made from the measured points only");
});

test("#3512 the SQL tables never held a survey's points (no hole id): nothing to change there", () => {
  assert.match(read("../src/lib/sqlTables.js"), /key === "geophys_pts"\) continue;/);
});

test("#3513 the unsampled wording follows the hole type in the pit panes, Grade-tonnage and Compositing, as in the Estimation", () => {
  for (const f of ["PitShellPane", "PitDesignPane", "NestedPitsPane", "GradeTonnageModal", "CompositingModal"]) {
    const s = read(`../src/components/${f}.jsx`);
    assert.match(s, /import \{ unsampledWord \} from "\.\.\/lib\/holeType\.js";/, f);
    assert.match(s, /const chips = unsampledWord\(collars\) === "chips";/, f);
    assert.match(s, /chips \? "[^"\n]*[Uu]nsampled chips[^\n]*" : "[^\n]*[Uu]nsampled core/, `${f}: both wordings`); // #3899: a sentence may now start with it
  }
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    const chipsKeys = Object.keys(d).filter((k) => /[Uu]nsampled chips/.test(k) && /ore is in blocks|metal at the \{c\} cutoff|Composites are anchored/.test(k)); // #3899: a sentence may now start with it
    assert.equal(chipsKeys.length, 3, `${lang}: three new keys`);
    for (const k of chipsKeys) assert.notEqual(d[k], d[k.replace("unsampled chips", "unsampled core").replace("Unsampled chips", "Unsampled core")], `${lang}: translated differently from the core wording`);
  }
});

test("#3445 (b): the sidecar build and the local build read GEOSTRIX_BUILD_DIR; the release flow does not", () => {
  const b = read("../python-sidecar/build_sidecar.js"), l = read("../scripts/build-local.mjs"), p = JSON.parse(read("../package.json"));
  assert.match(b, /process\.env\.GEOSTRIX_BUILD_DIR \? path\.resolve\(process\.env\.GEOSTRIX_BUILD_DIR, "sidecar"\) : null;/);
  assert.match(b, /\.\.\.\(buildRoot \? \["--distpath", distDir, "--workpath", workDir\] : \[\]\)/);
  assert.match(l, /cfg\.directories = \{ \.\.\.\(cfg\.directories \|\| \{\}\), output: release \};/);
  assert.equal(p.scripts["build:local"], "node scripts/build-local.mjs");
  assert.equal(p.scripts.build, "vite build && electron-builder", "npm run build is untouched");
  for (const f of ["../.github/workflows/release.yml", "../scripts/sign-release.ps1"]) assert.doesNotMatch(read(f), /GEOSTRIX_BUILD_DIR|build:local/, f);
});
