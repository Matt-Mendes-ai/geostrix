// TASKS.csv #3016 (WA iron review) — Grade x thickness in plan, the Fence diagram and Surface query took the whole project whatever the Model
// area (4,800 holes with a 4.2 s stall; a 12 km fence of 594 holes at true scale; 6,390 holes swept against a shell built from 228). They now
// start from the Model area's checked holes and say so; the fence opens at the exaggeration it proposes; Grade x thickness opens on the
// project's lead commodity.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { suggestFenceVe } from "../src/lib/fence.js";
import { preferredElement } from "../src/lib/preferredElement.js";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the fence proposes 50x for the review's line (207 times longer than the holes are deep), 1x for a deep section", () => {
  assert.equal(suggestFenceVe({ min: 0, max: 207 * 90 }, { min: 380, max: 470 }), 50);
  assert.equal(suggestFenceVe({ min: 0, max: 400 }, { min: -300, max: 300 }), 1);
});

test("Grade x thickness opens on the lead commodity (Fe on an iron-ore table), not the first element", () => {
  assert.equal(preferredElement(["Al", "Ca", "Fe", "Si"], null, "Fe"), "Fe");
  const s = read("../src/components/GradeThicknessModal.jsx");
  assert.match(s, /useState\(\(\) => preferredElement\(symbols, "gradeThickness", lead\) \|\| symbols\[0\] \|\| ""\)/);
  assert.match(s, /return inArea \? a\.filter\(\(r\) => inArea\(r\.hole_id\)\) : a;/);
  assert.match(s, /\{inArea && <div style=\{note\}>\{tr\("Samples from the Model area's \{n\} checked holes \(Model settings\)\.", \{ n: areaHoles \}\)\}<\/div>\}/);
  const p = read("../src/modules/viewer/ModellingPanes.jsx");
  assert.match(p, /<GradeThicknessModal [^>]*inArea=\{modelArea === "checked" \? \(id\) => visibleHoles\?\.\[id\] !== false : null\}/);
});

test("wiring: the fence opens on the area's holes at the proposed exaggeration; Surface query sweeps the area's holes and says so", () => {
  const f = read("../src/components/FenceDiagramModal.jsx");
  assert.match(f, /const pool = areaIds\?\.size \? \(traces \|\| \[\]\)\.filter\(\(t\) => areaIds\.has\(t\.hole_id\)\) : traces \|\| \[\];/);
  assert.match(f, /return initialFenceSelection\(pool, 100\);/);
  assert.match(f, /useEffect\(\(\) => \{ if \(!veChosen\.current && panel\) setVeState\(Math\.max\(1, suggestFenceVe\(panel\.sRange, panel\.zRange\)\)\); \}, \[panel\]\);/);
  assert.match(f, /const veChosen = useRef\(false\), setVe = \(v\) => \{ veChosen\.current = true; setVeState\(v\); \};/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /areaIds=\{modelArea === "checked" \? checkedHoleIds : null\}/);
  assert.match(v, /traces=\{modelArea === "checked" \? tracesRef\.current\.filter\(\(t\) => checkedHoleIds\.has\(t\.hole_id\)\) : tracesRef\.current\} inArea=\{modelArea === "checked"\}/);
  const q = read("../src/components/SurfaceQueryModal.jsx");
  assert.match(q, /\{inArea && <span>\{" "\}\{tr\("\(the Model area's checked holes, Model settings\)"\)\}<\/span>\}/);
});
