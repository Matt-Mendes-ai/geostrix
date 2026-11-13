// TASKS.csv #3126 — Project KMZ (Matt, 2026-11-12): every Perk-Rocky litho unit filled in Google Earth except And, the unit covering most of the map. One of its
// 43 holes crossed itself as written: in metres an edge passes a centimetre from a vertex, and the reprojection to longitude / latitude,
// rounded, carries it across. Google Earth does not fill an invalid polygon. A ring crossing itself as written is split into simple loops.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitSelfCrossing, splitRings, ringCrossesItself } from "../src/lib/ringSplit.js";
import { polygonsFromRings } from "../src/lib/polygonRings.js";
import { buildProjectKml } from "../src/lib/projectKmz.js";
import { featuresToKml, mapLayerFeatures, lonLatTransform } from "../src/lib/overlayExport.js";

const square = (x0, y0, s) => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
const eight = (x0, y0, s) => [[x0, y0], [x0 + s, y0 + s], [x0 + s, y0], [x0, y0 + s]]; // a bow tie: its two diagonals cross at the centre

test("a figure-eight ring becomes two simple loops, each starting at one of its own vertices; a simple ring is left as it is", () => {
  const loops = splitSelfCrossing(eight(0, 0, 10));
  assert.equal(loops.length, 2);
  assert.ok(loops.every((l) => l.length === 3 && !ringCrossesItself(l)));
  assert.ok(loops.every((l) => !(l[0][0] === 5 && l[0][1] === 5)), "never starting at the crossing");
  const sq = square(0, 0, 10);
  assert.equal(splitSelfCrossing(sq)[0], sq);
  assert.equal(splitSelfCrossing([...sq, sq[0]])[0].length, 5, "a closed simple ring as it was");
  // two crossings: three loops
  const zig = [[0, 0], [10, 10], [20, 0], [30, 10], [30, 0], [20, 10], [10, 0], [0, 10]];
  assert.ok(ringCrossesItself(zig));
  const z = splitSelfCrossing(zig);
  assert.ok(z.length >= 3 && z.every((l) => !ringCrossesItself(l)), `${z.length} loops`);
});

test("a crossing hole becomes two holes of its polygon; a crossing outer ring two polygons", () => {
  const polys = polygonsFromRings(splitRings([square(0, 0, 100), eight(40, 40, 20)]));
  assert.equal(polys.length, 1);
  assert.equal(polys[0].length, 3, "outer + two holes");
  const outers = polygonsFromRings(splitRings([eight(0, 0, 100)]));
  assert.equal(outers.length, 2);
});

test("Perk-Rocky's PR-Litho_interpV3, as both KML writers write it: no ring crosses itself in longitude / latitude", async () => {
  const { loadPerkRocky } = await import("../src/lib/samplePerkRocky.js");
  const dir = new URL("../sample_data/perk_rocky/", import.meta.url);
  const layers = [];
  await loadPerkRocky(async (n) => new File([readFileSync(new URL(n, dir))], n), { addMapLayer: (l) => layers.push(l), addSurfaceStructureSet: () => {}, addTerrain: () => {} });
  const L = layers.find((l) => l.name === "PR-Litho_interpV3");
  const toLonLat = await lonLatTransform(26910);
  const rings = (kml) => [...kml.matchAll(/<LinearRing><coordinates>([^<]*)<\/coordinates>/g)].map((m) => m[1].trim().split(/\s+/).map((t) => t.split(",").map(Number)));
  const { kml, counts } = buildProjectKml({ projectName: "Perk-Rocky", mapLayers: [L], epsg: 26910 }, { toLonLat });
  const pr = rings(kml);
  assert.ok(pr.length > 100);
  assert.deepEqual(pr.filter(ringCrossesItself).length, 0, "project KMZ");
  assert.ok(counts.ringsSplit >= 1, "And's hole was split");
  const one = featuresToKml(mapLayerFeatures(L), { toLonLat });
  assert.equal(rings(one).filter(ringCrossesItself).length, 0, "the per-layer KML");
});
