// TASKS.csv #3955 — collar elevations from the terrain, on request. Made-up collars (DH-23-xxx) on a synthetic terrain: a plane z = 400 + 0.1 (x - 500000) + 0.05 (y - 5500000).
import test from "node:test";
import assert from "node:assert/strict";
import { planCollarsFromTerrain, applyCollarsFromTerrain, assumedForTerrain, needsTerrainZ, terrainSourceWords } from "../src/lib/collarFromTerrain.js";

const terrain = { name: "made-up DEM", bbox: [499900, 5499900, 500400, 5500300] };
const plane = (x, y) => 400 + 0.1 * (x - 500000) + 0.05 * (y - 5500000);
const groundAt = (x, y) => plane(x, y);
const collars = [
  { hole_id: "DH-23-001", x: 500000, y: 5500000, z: 450, zAssumed: "median" }, // assumed (the median of the other holes): waits for a terrain
  { hole_id: "DH-23-002", x: 500100, y: 5500100, z: 0, zAssumed: "zero" }, // assumed at 0 m
  { hole_id: "DH-23-003", x: 500200, y: 5500200, z: 500 }, // the file's own elevation
  { hole_id: "DH-23-004", x: 501000, y: 5500000, z: 450, zAssumed: "median" }, // outside the terrain
  { hole_id: "DH-23-005", x: 500300, y: 5500050, z: 433, zAssumed: "terrain" }, // already on a terrain at import (#2169)
];

test("#3955 which collars wait for a terrain: the median / 0 m ones, not a file's own elevation nor a terrain one", () => {
  assert.deepEqual(assumedForTerrain(collars).map((c) => c.hole_id), ["DH-23-001", "DH-23-002", "DH-23-004"]);
  assert.equal(needsTerrainZ({ hole_id: "X", x: 1, y: 2, z: NaN }), true);
  assert.equal(needsTerrainZ(collars[2]), false);
});

test("#3955 the preview: count, largest and median change, the holes the terrain does not cover named", () => {
  const p = planCollarsFromTerrain(collars, terrain, { groundAt });
  assert.equal(p.which, "assumed");
  assert.deepEqual(p.items.map((i) => i.hole_id), ["DH-23-001", "DH-23-002"]);
  assert.deepEqual(p.off, ["DH-23-004"], "outside the terrain: left as it is, and named");
  assert.equal(p.count, 2);
  assert.equal(p.items[0].after, 400);
  assert.equal(p.items[0].dz, -50);
  assert.equal(p.items[1].after, 415); // 400 + 10 + 5
  assert.deepEqual(p.maxChange, { hole_id: "DH-23-002", dz: 415 });
  assert.equal(p.medianChange, (50 + 415) / 2);
});

test("#3955 'all' replaces a file's own elevation, the default never does", () => {
  const dflt = planCollarsFromTerrain(collars, terrain, { groundAt });
  assert.ok(!dflt.items.some((i) => i.hole_id === "DH-23-003"));
  const all = planCollarsFromTerrain(collars, terrain, { which: "all", groundAt });
  assert.deepEqual(all.items.map((i) => i.hole_id), ["DH-23-001", "DH-23-002", "DH-23-003", "DH-23-005"]);
  const out = applyCollarsFromTerrain(collars, all, terrain);
  const c3 = out.find((c) => c.hole_id === "DH-23-003");
  assert.equal(c3.z, plane(500200, 5500200));
  assert.equal(c3.z_before_snap, 500, "the file's own value is kept, to undo");
});

test("#3955 apply: new z, the source recorded, the old value kept once, the rest untouched", () => {
  const p = planCollarsFromTerrain(collars, terrain, { groundAt });
  const out = applyCollarsFromTerrain(collars, p, terrain);
  const c1 = out.find((c) => c.hole_id === "DH-23-001");
  assert.equal(c1.z, 400);
  assert.equal(c1.z_source, terrainSourceWords(terrain));
  assert.equal(c1.zAssumed, "terrain");
  assert.equal(c1.z_before_snap, 450);
  assert.equal(c1.x, 500000);
  assert.deepEqual(out.find((c) => c.hole_id === "DH-23-004"), collars[3], "the off-terrain hole is unchanged");
  assert.deepEqual(out.find((c) => c.hole_id === "DH-23-003"), collars[2]);
  assert.equal(collars[0].z, 450, "the input is not mutated");
  const again = applyCollarsFromTerrain(out, planCollarsFromTerrain(out, terrain, { which: "all", groundAt: (x, y) => plane(x, y) + 1 }), terrain);
  assert.equal(again.find((c) => c.hole_id === "DH-23-001").z_before_snap, 450, "a second application keeps the FIRST value");
});

test("#3955 no terrain data under a hole: it is left and named (no NaN written)", () => {
  const p = planCollarsFromTerrain(collars, terrain, { groundAt: () => NaN });
  assert.equal(p.count, 0);
  assert.equal(p.off.length, 3);
  assert.equal(p.maxChange, null);
  assert.equal(p.medianChange, null);
});

// ---- Data QC records the source; the import dialog and the offer are wired
import { readFileSync } from "node:fs";
import { runDataQC } from "../src/lib/dataQC.js";
import { zOptional } from "../src/lib/collarElevation.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3955 Data QC: an elevation taken from the terrain says so (information, with the source); an assumed median / 0 m stays a warning", () => {
  const c = [
    { hole_id: "DH-23-001", x: 500000, y: 5500000, z: 400, zAssumed: "terrain", z_source: "terrain: made-up DEM", azimuth: 0, dip: 90, length: 50 },
    { hole_id: "DH-23-002", x: 500100, y: 5500100, z: 420, zAssumed: "median", azimuth: 0, dip: 90, length: 50 },
  ];
  const issues = runDataQC({ collars: c, survey: [], layers: {}, assays: [] }).issues;
  const t = issues.find((i) => i.holeId === "DH-23-001" && /From the terrain/.test(i.message));
  assert.ok(t, JSON.stringify(issues.slice(0, 4)));
  assert.equal(t.severity, "info");
  assert.match(t.message, /made-up DEM/);
  assert.ok(!issues.some((i) => i.holeId === "DH-23-001" && /ASSUMED elevation/.test(i.message)), "no warning for a hole placed on a terrain on request");
  const m = issues.find((i) => i.holeId === "DH-23-002" && /ASSUMED elevation/.test(i.message));
  assert.equal(m?.severity, "warning");
});

test("#3955 a collar file with no elevation column can be imported: Elevation is optional for collars only, and the dialog offers where it comes from", () => {
  assert.equal(zOptional("collars"), true);
  assert.equal(zOptional("survey"), false);
  const pipe = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(pipe, /!\(zOptional\(target\) && f\.key === "z"/);
  assert.match(pipe, /groundAt: terrainNow && data\.zFromTerrain !== false \?/);
  const modal = read("../src/components/ImportMappingModal.jsx");
  assert.match(modal, /!\(zOptional\(modal\.target\) && f\.key === "z"\)/);
  assert.match(modal, /<CollarElevationChoice modal=\{modal\} onChange=\{onChange\} \/>/);
  const choice = read("../src/components/CollarElevationChoice.jsx");
  assert.match(choice, /modal\.target !== "collars" \|\| modal\.mapping\?\.z/);
  assert.match(choice, /zFromTerrain: false/);
  assert.match(choice, /From the terrain \\"\{name\}\\"/);
});

test("#3955 the action and the offer: mounted once in App, opened from Data QC, applying through the store's undoable setCollars, never while a project loads", () => {
  assert.equal((read("../src/App.jsx").match(/<CollarZFromTerrain \/>/g) || []).length, 1);
  assert.match(read("../src/components/DataQCModal.jsx"), /onClick=\{requestCollarZFromTerrain\}/);
  const c = read("../src/components/CollarZFromTerrain.jsx");
  assert.match(c, /setCollars\(\(prev\) => applyCollarsFromTerrain\(prev, plan, terrain\)\)/);
  assert.match(c, /if \(projectLoading\) \{ seen\.current = key; setOffer\(null\); return; \}/);
  assert.match(c, /which: "assumed"/);
  assert.match(c, /name="collarZWhich" checked=\{which === "all"\}/);
});
