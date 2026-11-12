// TASKS.csv #1702 (review #1645, Copley) — the 3D View's "Intercepts" opened lithology boundary picks; grade intercepts lived only in Geochem.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("#1702 the boundary-picks button says 'Contact picks'; 'Grade intercepts' opens Best intercepts on the loaded assays", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /<span className="ge-ribbon-label">\{tr\("Contact picks"\)\}<\/span>/);
  assert.ok(!p.includes('tr("Intercepts")'));
  assert.match(p, /const BestIntercepts = lazyModal\(\(\) => import\("\.\.\/\.\.\/components\/BestIntercepts\.jsx"\)\);/);
  assert.match(p, /<RibbonButton advanced=\{noHoles\} icon=\{FileBarChart2\} label="Grade intercepts" tone="analyse" disabled=\{!gAssays\.length\}/); // advanced with no holes: #2778
  assert.match(p, /\{gradeIntOpen && <BestIntercepts assays=\{gAssays\} assayElements=\{gEls\} collars=\{spacingCollars\} survey=\{gSurvey\} layers=\{gLayers\}/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["Contact picks", "Grade intercepts", "Load assays first (Geochem tab)"]) assert.ok(j[k], `${l}: ${k}`);
  }
});
