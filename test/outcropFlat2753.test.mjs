// TASKS.csv #2753 (side 2's steps) — an outcrop measurement with no elevation off the terrain or over a no-data gap is drawn flat at the
// surface samples' plan elevation (flatZ), not at the terrain's clamped edge or filled level; on the ground it sits on the ground as before.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { outcropZ, syncSurfaceStructures, outcropLabelItems } from "../src/lib/viewer/sceneBuilders.js";

// a 0-100 m box, 11 x 11 nodes at 10 m, ground 500 m rising 1 m per 10 m east; node (5, 5) = (50 E, 50 N) has no data
const gridW = 11, gridH = 11, elevations = new Float32Array(gridW * gridH);
for (let j = 0; j < gridH; j++) for (let i = 0; i < gridW; i++) elevations[j * gridW + i] = 500 + i;
const mask = new Uint8Array(Math.ceil((gridW * gridH) / 8)); const gap = 5 * gridW + 5; mask[gap >> 3] |= 1 << (gap & 7);
const terrain = { bbox: [0, 0, 100, 100], gridW, gridH, elevations, noDataMask: mask };
const set = { rows: [], snapToTerrain: true };
const flatZ = 312, oz = 0;

test("no z: the ground on the terrain; flatZ outside it and over its gap", () => {
  assert.equal(outcropZ({ x: 20, y: 80 }, set, terrain, flatZ, oz), 502);
  assert.equal(outcropZ({ x: 150, y: 50 }, set, terrain, flatZ, oz), 312); // outside: was the clamped edge (510)
  assert.equal(outcropZ({ x: 50, y: 50 }, set, terrain, flatZ, oz), 312); // over the gap: was the filled level
  assert.equal(outcropZ({ x: 150, y: 50 }, set, null, flatZ, oz), 312); // no terrain at all
  assert.equal(outcropZ({ x: 150, y: 50 }, set, terrain, null, 7), 7); // no flatZ given: the scene origin, as before
});

test("with its own z: snapped on the ground when snapToTerrain, kept off it and over a gap, kept when snapping is off", () => {
  assert.equal(outcropZ({ x: 20, y: 80, z: 480 }, set, terrain, flatZ, oz), 502);
  assert.equal(outcropZ({ x: 150, y: 50, z: 480 }, set, terrain, flatZ, oz), 480);
  assert.equal(outcropZ({ x: 50, y: 50, z: 480 }, set, terrain, flatZ, oz), 480);
  assert.equal(outcropZ({ x: 20, y: 80, z: 480 }, { snapToTerrain: false }, terrain, flatZ, oz), 480);
});

test("the discs and their dip labels are placed by the same rule", () => {
  // dip 30, not 0: since #3066 a horizontal symbol carries no number (FGDC 6.1), so a dip-0 row has no label to place
  const rows = [{ x: 20, y: 80, dip: 30, dipDir: 0, cls: "bedding" }, { x: 150, y: 50, dip: 30, dipDir: 0, cls: "bedding" }, { x: 50, y: 50, dip: 30, dipDir: 0, cls: "bedding" }];
  const s = { id: "s", rows, size: 10, labels: "dip" };
  const origin = { x: 0, y: 0, z: 0 }, group = new THREE.Group(), cache = {};
  syncSurfaceStructures(group, cache, [s], { origin, terrain, flatZ });
  const inst = cache.s.children.find((c) => c.isInstancedMesh), m = new THREE.Matrix4(), p = new THREE.Vector3();
  const ys = rows.map((_, i) => { inst.getMatrixAt(i, m); p.setFromMatrixPosition(m); return p.y; });
  const lift = 0.3 + 10 * 0.004; // #3066: the flat symbol (and its pick disc) just above the ground
  assert.deepEqual(ys.map((y) => +(y - lift).toFixed(3)), [502, 312, 312]); // Float32 matrices
  const labels = outcropLabelItems([s], { origin, terrain, flatZ });
  assert.deepEqual(labels.map((l) => +(l.y - 0.3 - 10 * 0.1).toFixed(6)), [502, 312, 312]);
});

test("wiring: ViewerModule passes the samples' flat elevation and rebuilds when it changes", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /syncSurfaceStructures\(surfStructGroupRef\.current, surfStructObjsRef\.current, surfaceStructures, \{ origin: originRef\.current, terrain, flatZ: surfaceFlatZ \}\)/);
  assert.match(v, /outcropLabelItems\(surfaceStructures, \{ origin: originRef\.current, terrain, flatZ: surfaceFlatZ \}\)/);
  assert.match(v, /\[surfaceStructures, collars, terrain, surfaceFlatZ \/\* #2753 \*\/, rebuildSeq, deferRound\]/);
});
