// TASKS.csv #3368 (#3195, Galore Creek review) — with no terrain, unit polygons and readings lay flat at the median collar while
// interpretation lines followed a surface through the collars, so a fault traced on a polygon's edge was drawn 168 m below it. One ground
// now: the surface through the collar elevations for map layers, samples and outcrop readings. SYNTHETIC collars (no Galore data).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mapLayerOnCollars, interpretationOnCollars, outcropZ } from "../src/lib/viewer/sceneBuilders.js";
import { noTerrainGround, placeSurfaceSamples, surfacePlacementCounts, setOutcropNoTerrainGround, surfaceFlatElevation, surfaceFlatRule } from "../src/lib/viewer/surfacePlacement.js";
import { collarGround } from "../src/lib/collarGround.js";

// a valley: collars from 456 m to 1,596 m RL over 20 km; the median (the old flat RL) is nobody's ground at either end
const collars = Array.from({ length: 9 }, (_, i) => ({ hole_id: `C${i}`, x: 2500 * i, y: 1000 * (i % 3), z: 456 + 142.5 * i, dip: 60 }));
const polygon = { geomType: "polygon", drapeMode: "terrain", elevation: 1026 };
const fault = { geomType: "line", interpretation: true, drapeMode: "terrain", elevation: 1026 };

test("every map layer drawn on the ground takes the collar surface with no terrain, as the interpretation lines do", () => {
  assert.equal(mapLayerOnCollars(polygon, null, collars), true, "the unit polygon (it lay flat at the median collar before)");
  assert.equal(mapLayerOnCollars(fault, null, collars), true);
  assert.equal(interpretationOnCollars(fault, null, collars), true);
  assert.equal(mapLayerOnCollars({ ...polygon, drapeMode: "flat" }, null, collars), false, "Flat at one RL instead");
  assert.equal(mapLayerOnCollars({ ...polygon, drapeMode: "file", hasZ: true }, null, collars), false, "a layer at its own z");
  assert.equal(mapLayerOnCollars(polygon, { bbox: [0, 0, 1, 1] }, collars), false, "a terrain: drape on it");
  assert.equal(mapLayerOnCollars(polygon, null, collars.slice(0, 2)), false, "fewer than 3 collars");
  // collars stacked on mine levels: a map lies flat (the highest collar), an interpretation line keeps #2768's behaviour
  const ug = Array.from({ length: 12 }, (_, i) => ({ hole_id: `U${i}`, x: 100 + (i % 3) * 2, y: 200, z: 500 - 60 * Math.floor(i / 3), dip: i < 6 ? -30 : 45 }));
  assert.equal(mapLayerOnCollars(polygon, null, ug), false);
  assert.equal(mapLayerOnCollars(fault, null, ug), true);
});

test("samples and outcrop readings with no elevation lie on the same ground as the polygon they sit in", () => {
  const g = collarGround(collars), at = noTerrainGround(collars, false);
  const corner = { x: 5000, y: 1000 };
  assert.equal(at(corner.x, corner.y), g(corner.x, corner.y), "the surface the map layers are draped on");
  assert.equal(noTerrainGround(collars, true), null, "underground: flat");
  assert.equal(noTerrainGround(collars.slice(0, 2), false), null);
  const flatZ = surfaceFlatElevation(collars, [], false);
  assert.equal(flatZ, 1026, "the median the polygon used to lie at");
  const samples = [{ sample_id: "a", ...corner, z: null }, { sample_id: "b", x: 18000, y: 0, z: null }, { sample_id: "c", x: 1, y: 1, z: 700 }];
  const placed = placeSurfaceSamples(samples, null, flatZ, () => NaN, null, at);
  assert.equal(placed[0].z, g(corner.x, corner.y)); assert.ok(placed[0].zCollars && !placed[0].zFlat);
  assert.ok(placed[1].z > 1400, `on the high end of the valley (collars 1,311 to 1,596 m there), not at ${flatZ} (got ${placed[1].z})`);
  assert.equal(placed[2], samples[2]);
  assert.deepEqual(surfacePlacementCounts(samples, placed), { noTerrain: 0, outside: 0, tinGap: 0, collars: 2, unplaced: 0 });
  assert.equal(placeSurfaceSamples(samples, null, flatZ, () => NaN, null, null)[0].zFlat, true, "no collar ground: flat, as before");
  // the outcrop symbols: the registered collar ground with no terrain, flatZ when there is none
  setOutcropNoTerrainGround(at);
  try {
    assert.equal(outcropZ({ x: corner.x, y: corner.y, z: null }, {}, null, flatZ, 0), g(corner.x, corner.y));
    assert.equal(outcropZ({ x: corner.x, y: corner.y, z: 812 }, {}, null, flatZ, 0), 812, "a reading with its own z keeps it");
  } finally { setOutcropNoTerrainGround(null); }
  assert.equal(outcropZ({ x: corner.x, y: corner.y, z: null }, {}, null, flatZ, 0), flatZ);
});

test("the notices name the one rule they used, and the panes offer flat", () => {
  assert.equal(surfaceFlatRule(collars, false), "collars");
  assert.equal(surfaceFlatRule(collars, true), "highest-collar");
  assert.equal(surfaceFlatRule([], false), "samples");
  const n = fs.readFileSync(new URL("../src/modules/viewer/SurfacePlacementNotices.jsx", import.meta.url), "utf8");
  assert.ok(!n.includes("the highest on an underground project, or the samples' own"), "not three possible rules for one number");
  assert.match(n, /counts\.collars > 0/);
  const u = fs.readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(u, /const onCollars = mapLayerOnCollars\(layer \|\| \{ drapeMode: "terrain" \}, terrain, collars\);/);
  assert.match(u, /\{plan && !onCollars && <div role="note"/);
  const sm = fs.readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(sm, /\{mapLayerOnCollars\(l, terrain, collars\) && <div/);
  const h = fs.readFileSync(new URL("../src/modules/viewer/useSurfacePlacement.js", import.meta.url), "utf8");
  assert.match(h, /useMemo\(\(\) => setOutcropNoTerrainGround\(collarAt\), \[collarAt\]\);/);
});
