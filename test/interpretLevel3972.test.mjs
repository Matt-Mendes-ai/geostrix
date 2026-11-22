// TASKS.csv #3972 — interpretation lines drawn on a level (an RL, or the 3D slice's plane): the line keeps its RL (attribute and every vertex's z,
// through vertex edits), a click lands on the level's plane, the 3D view draws it at depth (not draped), the exports carry z (DXF / Shapefile /
// GeoPackage through mapLayerFeatures, KML at absolute altitude), the pane's choice and each row's level. Made-up coordinates.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { interpretationLayer, addInterpretationLine, moveInterpretationVertex, insertInterpretationVertex, lineLevel, LEVEL_FIELD } from "../src/lib/interpretation.js";
import { rayAtLevel, levelExtent } from "../src/lib/viewer/interpretLevel.js";
import { mapLayerFeatures, featuresToKml } from "../src/lib/overlayExport.js";
import { syncMapLayers } from "../src/lib/viewer/sceneBuilders.js";

const P = (x, y, z) => ({ x, y, z });
const base = () => interpretationLayer("Vein zones", "");

test("#3972 a line on a level keeps its RL: the attribute, z on every vertex, through vertex moves and inserts", () => {
  let l = addInterpretationLine(base(), [P(1000, 5000, 312), P(1100, 5050, 298)], { type: "contact" }, { level: 1250 });
  const f = l.features[0];
  assert.deepEqual(f.parts[0], [[1000, 5000, 1250], [1100, 5050, 1250]]);
  assert.equal(f.attributes[LEVEL_FIELD], 1250);
  assert.equal(lineLevel(f), 1250);
  assert.ok(l.fields.includes(LEVEL_FIELD));
  assert.equal(l.elevation, 0, "a level line does not set the layer's Elev.");
  l = moveInterpretationVertex(l, 0, 1, [1120, 5060]);
  assert.deepEqual(l.features[0].parts[0][1], [1120, 5060, 1250]);
  l = insertInterpretationVertex(l, 0, 1, [1050, 5020]);
  assert.deepEqual(l.features[0].parts[0][1], [1050, 5020, 1250]);
  const draped = addInterpretationLine(base(), [P(0, 0, 10), P(10, 0, 10)], { type: "fault" });
  assert.deepEqual(draped.features[0].parts[0], [[0, 0], [10, 0]]); // a line on the terrain: as before
  assert.equal(lineLevel(draped.features[0]), null);
});

test("#3972 a click lands on the level: the ray meets z = RL (scene: y up, z south)", () => {
  const origin = { x: 1000, y: 5000, z: 300 };
  const ray = new THREE.Ray(new THREE.Vector3(10, 200, -20), new THREE.Vector3(0, -1, 0)); // straight down over E 1010, N 5020
  const w = rayAtLevel(ray, 250, origin);
  assert.deepEqual([w.x, w.y, w.z], [1010, 5020, 250]);
  assert.equal(rayAtLevel(new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)), 250, origin), null); // along the plane
  assert.equal(rayAtLevel(new THREE.Ray(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)), 250, origin), null); // away from it (behind)
  const e = levelExtent([{ pts: [{ x: 0, z: 0 }, { x: 400, z: -100 }] }]);
  assert.ok(e.x0 < 0 && e.x1 > 400 && e.z0 < -100 && e.z1 > 0);
});

test("#3972 the 3D view draws level lines at their RL (segments), the others still draped", () => {
  const l = { ...addInterpretationLine(base(), [P(1000, 5000), P(1100, 5000)], { type: "contact" }, { level: 250 }), id: "L1", interpretation: true };
  const group = new THREE.Group(), cache = {};
  syncMapLayers(group, cache, [l], { origin: { x: 1000, y: 5000, z: 300 }, terrain: null, renderer: null, collars: [] });
  const seg = cache["L1~level"];
  assert.ok(seg instanceof THREE.LineSegments);
  const pos = seg.geometry.getAttribute("position").array;
  assert.deepEqual([pos[1], pos[4]], [-50, -50]); // RL 250 under an origin at 300
  assert.equal(cache.L1, undefined); // every line on a level: no drape for the layer
});

test("#3972 exports carry z: mapLayerFeatures keeps the RL (3D DXF, PolyLineZ, LineStringZ) and KML puts the line at its altitude", () => {
  let l = addInterpretationLine(base(), [P(1000, 5000), P(1100, 5000)], { type: "contact" }, { level: 1250 });
  l = addInterpretationLine(l, [P(0, 0, 9), P(10, 0, 9)], { type: "fault" });
  const built = mapLayerFeatures(l);
  assert.deepEqual(built.features[0].geometry, [[1000, 5000, 1250], [1100, 5000, 1250]]);
  assert.deepEqual(built.features[1].geometry, [[0, 0, 0], [10, 0, 0]]);
  assert.equal(built.flat, false);
  assert.equal(mapLayerFeatures(addInterpretationLine(base(), [P(0, 0), P(10, 0)], { type: "fault" })).flat, true);
  const kml = featuresToKml(built, { toLonLat: (x, y) => [x / 1e4, y / 1e4] });
  assert.match(kml, /<LineString><altitudeMode>absolute<\/altitudeMode><coordinates>0\.1,0\.5,1250 /);
  assert.match(kml, /<LineString><tessellate>1<\/tessellate>/);
});

test("#3972 wiring: the 3D view's click, plane and props; the pane's Draw on, pierce snap and row level; the KMZ", () => {
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /snapInterpretClick\(Number\.isFinite\(lvl\) \? rayAtLevel\(raycaster\.ray, lvl, originRef\.current\) : raycastWorldPoint\(raycaster\)/);
  assert.match(vm, /if \(Number\.isFinite\(lvl\)\) world\.z = lvl;/);
  assert.match(vm, /addLevelPlane\(interpretGroupRef\.current, interpret\.on \? interpret\.level : null/);
  assert.match(vm, /sliceRL: slice3d\.on && slice3d\.mode === "horizontal"/);
  const pane = fs.readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /<option value="level">\{tr\("A level \(RL\)"\)\}<\/option>/);
  assert.match(pane, /<option value="slice">\{tr\("The 3D slice plane"\)\}<\/option>/);
  assert.match(pane, /kind: "pierce", hole_id: t\.hole_id/);
  assert.match(pane, /lineLevel\(f\) != null \? ` · \$\{tr\("RL \{rl\} m"/);
  const snap = fs.readFileSync(new URL("../src/lib/viewer/interpretSnap.js", import.meta.url), "utf8");
  assert.match(snap, /"pierce"\]\)/);
  assert.match(fs.readFileSync(new URL("../src/lib/projectKmz.js", import.meta.url), "utf8"), /w\.line3d\(p\.map\(\(\[x, y, z\]\) => \(\{ x, y, z \}\)\)\)/);
});
