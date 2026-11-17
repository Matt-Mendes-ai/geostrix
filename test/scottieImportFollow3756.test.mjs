// TASKS.csv #3756 (follow-ups of #3730 / #3738 / #3731) — (1) the survey import's own notice names a stretch with no survey station, (2) a UBC mesh dropped with its model goes to
// Geophysics > Block models with both files, (3) the surface-sample fallback notice keeps the file's own spelling of the medium words. Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyGapsOfRows } from "../src/lib/surveyGaps.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const hasKeys = (keys) => { for (const k of keys) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 50)}`); };

test("#3756 (1) surveyGapsOfRows: DH-23-299's shape (0, 339, then every 3 m) is the widest stretch; evenly surveyed holes are not counted", () => {
  const rows = [{ hole_id: "DH-23-299", depth: 0 }, ...Array.from({ length: 51 }, (_, i) => ({ hole_id: "DH-23-299", depth: 339 + i * 3 }))];
  for (const h of ["A", "B"]) for (let d = 0; d <= 300; d += 3) rows.push({ hole_id: h, depth: d });
  const g = surveyGapsOfRows(rows);
  assert.equal(g.holes, 1); assert.deepEqual(g.widest, { hole_id: "DH-23-299", from: 0, to: 339 });
  assert.equal(surveyGapsOfRows(rows.filter((r) => r.hole_id !== "DH-23-299")), null);
  assert.equal(surveyGapsOfRows([]), null); assert.equal(surveyGapsOfRows(null), null);
  const imp = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(imp, /const sg = surveyGapsOfRows\(rows\);/);
  assert.match(imp, /have a stretch with no survey station \(the widest: \{id\}, \{a\}–\{b\} m\)/);
  hasKeys([" {n} hole(s) have a stretch with no survey station (the widest: {id}, {a}–{b} m): the path there is interpolated, not measured. Data QC lists them."]);
});

test("#3756 (2) a UBC mesh dropped with its model is handed to Geophysics > Block models with both files", () => {
  const imp = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(imp, /requestModuleAction\("geophysics-ubc", \{ files: \[meshes\[0\], \.\.\.ubcModels\] \}\)/);
  assert.match(imp, /a UBC-GIF mesh and its model, opened in Geophysics > Block models/);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /useModuleAction\(\["geophysics-ubc"\], \(_a, p\) => \{ if \(p\?\.files\?\.length\) \{ setGeoPane\("voxel"\); importUBC\(p\.files\); \} \}\);/);
  hasKeys(["{name} with {models}: a UBC-GIF mesh and its model, opened in Geophysics > Block models (Import UBC mesh + model…)."]);
});

test("#3756 (3) the fallback notice's words keep the file's spelling, counted case-folded", () => {
  const g = read("../src/modules/GeochemModule.jsx");
  assert.match(g, /const mediumCell = mapping\.medium \? String\(r\[mapping\.medium\] \?\? ""\)\.trim\(\) : "", rawMedium = mediumCell\.toLowerCase\(\);/);
  assert.match(g, /fbWords\.set\(sample, mediumCell\);/);
  assert.match(g, /const fbSpell = new Map\(\);/);
});
