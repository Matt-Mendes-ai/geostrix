// TASKS.csv #3910 (redesign P8) — the trend helper in Model settings (modules/viewer/TrendHelper.jsx): what it gathers from the project
// (lib/trendHelperData.js), the candidates it shows, the disc in the 3D view, "I know my trend", and the one line that hooks it into Model settings'
// trend store. SYNTHETIC readings, holes and map polygons only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gatherTrendData } from "../src/lib/trendHelperData.js";
import { trendCandidates } from "../src/lib/trendCandidates.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const es = JSON.parse(read("../src/locales/es.json"));

test("#3910 gathered: core picks, outcrop readings, tops, surfaces, the grade, the drilling and the map's contacts; a source that fails leaves the others", () => {
  const picks = Array.from({ length: 12 }, (_, i) => ({ value: "V", dip: 58 + (i % 3), azimuth: 133 + (i % 4) }));
  const outcrop = Array.from({ length: 6 }, (_, i) => ({ cls: "bedding", dip: 20 + i, dipDir: 90, x: 500 + i, y: 500 }));
  // two units side by side: their shared edge runs north-south
  const layer = { geomType: "polygon", styleField: "unit", features: [
    { attributes: { unit: "A" }, parts: [[[0, 0], [100, 0], [100, 1000], [0, 1000], [0, 0]]] },
    { attributes: { unit: "B" }, parts: [[[100, 0], [200, 0], [200, 1000], [100, 1000], [100, 0]]] },
  ] };
  const d = gatherTrendData({
    structurePicks: picks, surfaceStructures: [...outcrop, { cls: "bedding", dip: 0, dipDir: 0, horizontal: true }],
    surfaces: [{ id: "s1", name: "Shape 1" }], surfacePoints: () => { throw new Error("no mesh"); },
    units: ["UNIT-A"], unitTopPoints: () => [{ x: 0, y: 0, z: 0 }],
    gradeElement: "Au", samplePoints: () => ({ pts: [{ x: 1, y: 2, z: 3 }], cutoff: 0.5, unit: "g/t" }), drillingPoints: () => [{ x: 1, y: 2, z: 3 }],
    mapLayers: [layer, { geomType: "point", styleField: "unit", features: [] }],
  });
  assert.equal(d.structures.length, 18, "12 picks and 6 tilted outcrop readings (a horizontal one has no dip direction)");
  assert.deepEqual(d.structures[0], { kind: "V", dip: 58, dipDir: 133 });
  assert.equal(d.structures[12].kind, "bedding (outcrop)");
  assert.deepEqual(d.surfaces, [], "the mesh failed: no surfaces, the rest still gathered");
  assert.equal(d.units[0].code, "UNIT-A");
  assert.deepEqual([d.grade.element, d.grade.cutoff, d.grade.unit], ["Au", 0.5, "g/t"]);
  assert.ok(d.mapContacts.length >= 1, "the A / B contact");
  const out = trendCandidates(d);
  const map = out.candidates.find((c) => c.source === "map");
  assert.ok(map && map.directionOnly && (Math.abs(map.dipAzimuth - 90) < 5 || Math.abs(map.dipAzimuth - 270) < 5), JSON.stringify(map));
  assert.equal(out.candidates[0].kind, "V", "the tight core picks lead");
});

test("#3910 hooked into Model settings with one line, above the trends list; the helper writes the store through withHelperTrend", () => {
  const m = modellingPanesSource();
  const lines = m.split("\n").filter((l) => l.includes("<TrendHelper "));
  assert.equal(lines.length, 1);
  assert.ok(m.indexOf("<TrendHelper ") > m.indexOf('{tr("Structural trends")}</div>') && m.indexOf("<TrendHelper ") < m.indexOf("<TrendsPanel "));
  assert.match(lines[0], /structuralTrends=\{structuralTrends\} setStructuralTrends=\{setStructuralTrends\} sceneRef=\{sceneRef\} camState=\{camState\}/);
  assert.doesNotMatch(read("../src/modules/ViewerModule.jsx"), /TrendHelper/, "nothing in ViewerModule.jsx");
  const h = read("../src/modules/viewer/TrendHelper.jsx");
  assert.match(h, /setStructuralTrends\(\(s\) => withHelperTrend\(s, t, follow\)\)/);
  assert.match(h, /const t = trendFromCandidate\(chosen, strength\);/);
});

test("#3910 the disc: the candidate pointed at (or the one chosen), see-through, at the view's centre; removed when it changes or the helper closes", () => {
  const h = read("../src/modules/viewer/TrendHelper.jsx");
  assert.match(h, /const shown = byId\(hoverId\) \|\| chosen;/);
  assert.match(h, /onMouseEnter=\{\(\) => setHoverId\(c\.id\)\} onMouseLeave=\{\(\) => setHoverId\(null\)\} onFocus=\{\(\) => setHoverId\(c\.id\)\}/);
  assert.match(h, /new THREE\.MeshBasicMaterial\(\{ color: colors\.info, transparent: true, opacity: 0\.28, side: THREE\.DoubleSide, depthWrite: false \}\)/);
  assert.match(h, /g\.position\.copy\(cs\.target\);/);
  assert.match(h, /return clear;\n  \}, \[shown\?\.id, shown\?\.dip, shown\?\.dipAzimuth, strength, sceneRef, camState\]\);/);
});

test("#3910 'I know my trend': the typed direction and tilt are a candidate like the others (clamped), shown in words", () => {
  const h = read("../src/modules/viewer/TrendHelper.jsx");
  assert.match(h, /\{ id: "typed", source: "typed", dip: Math\.max\(0, Math\.min\(90, Number\(typed\.dip\)\)\), dipAzimuth: \(\(Number\(typed\.dipDir\) % 360\) \+ 360\) % 360 \}/);
  assert.match(h, /<summary style=\{\{ cursor: "pointer" \}\}>\{tr\("I know my trend"\)\}<\/summary>/);
});

test("#3910 the labels picked from tables are translated too", () => {
  const h = read("../src/modules/viewer/TrendHelper.jsx");
  const table = [...h.matchAll(/\["(?:grade|rock|everything|gentle|medium|strong)", "([^"]+)"\]/g)].map((x) => x[1]);
  const used = [...h.slice(h.indexOf("const USED"), h.indexOf("const STRENGTHS")).matchAll(/: "([^"]+)"/g)].map((x) => x[1]);
  assert.equal(table.length, 6); assert.equal(used.length, 3);
  for (const k of [...table, ...used]) assert.ok(es[k], `es: ${k}`);
});
