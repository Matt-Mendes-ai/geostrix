// TASKS.csv #2823 (a user's report, High) — collar markers sized from the drilling (Auto), a radius in m, or Off, saved with the view; a
// resize scales the markers in place (batches synced, the pick signature changes), and #2623's pixel floor shrinks with a small marker.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { medianCollarSpacing, autoCollarRadius, resolveCollarRadius, floorPxFor, applyCollarMarkerSize, DEFAULT_COLLAR_RADIUS } from "../src/lib/viewer/collarMarkerSize.js";
import { COLLAR_MARKER_UNIFORMS, collarMarkerMaterial } from "../src/lib/viewer/collarMarkerShader.js";
import { buildLayerBatches, batchTag } from "../src/lib/viewer/layerBatches.js";
import { PROTO_SPHERE_12 } from "../src/lib/viewer/protos.js";

// the report's drive: 145 holes 1 m apart along a line (scene z = -north), 2-5 m long (median 2.3 m in the report)
const drive = Array.from({ length: 145 }, (_, i) => ({ x: 0.2 * Math.sin(i), y: -400, z: -i * 1.0, depth: [2, 2.3, 2.5, 3, 5][i % 5] }));

test("the drive gets small markers; spread drilling, pads of deep holes and a lone hole keep 3.2 m", () => {
  assert.ok(Math.abs(medianCollarSpacing(drive) - 1) < 0.05);
  const r = autoCollarRadius(drive);
  assert.ok(r > 0.25 && r < 0.35, String(r)); // 0.3 x 1 m: a 0.6 m marker on holes 1 m apart, not 6.4 m
  const grid = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) grid.push({ x: i * 50, y: 300, z: -j * 50, depth: 150 });
  assert.equal(autoCollarRadius(grid), DEFAULT_COLLAR_RADIUS); // WA uranium (76 m), Woodjam (188 m), Harry (44 m): as before
  const pads = []; for (let p = 0; p < 3; p++) for (let k = 0; k < 3; k++) pads.push({ x: p * 400 + k * 1.75, y: 1500, z: 0, depth: 600 });
  assert.equal(autoCollarRadius(pads), DEFAULT_COLLAR_RADIUS); // Silvertip-like: pads 1.75 m apart, deep holes (0.05 x 600 m)
  assert.equal(autoCollarRadius([{ x: 0, y: 0, z: 0, depth: 3 }]), DEFAULT_COLLAR_RADIUS);
  assert.equal(autoCollarRadius([]), DEFAULT_COLLAR_RADIUS);
});

test("collars at the same spot (a fan from one pad) are not each other's neighbours; the radius never goes under 5 cm", () => {
  const fans = [0, 0, 0, 60, 60, 120, 120, 120].map((x) => ({ x, y: 0, z: 0, depth: 300 }));
  assert.equal(medianCollarSpacing(fans), 60);
  const tight = Array.from({ length: 20 }, (_, i) => ({ x: i * 0.1, y: 0, z: 0, depth: 0.5 }));
  assert.equal(autoCollarRadius(tight), 0.05);
});

test("the setting: Off is 0, a typed radius is used, anything else is Auto", () => {
  assert.equal(resolveCollarRadius("off", drive), 0);
  assert.equal(resolveCollarRadius(0.5, drive), 0.5);
  assert.equal(resolveCollarRadius("1.2", drive), 1.2);
  for (const s of [undefined, null, "auto", "", 0, -1, "abc"]) assert.equal(resolveCollarRadius(s, drive), autoCollarRadius(drive), String(s));
});

test("the pixel floor: 2.5 px at full size, shrinking with the marker to 1 px, none when Off", () => {
  assert.equal(floorPxFor(3.2), 2.5);
  assert.equal(floorPxFor(5), 2.5);
  assert.equal(floorPxFor(1.6), 1.25);
  assert.equal(floorPxFor(0.3), 1);
  assert.equal(floorPxFor(0), 0);
});

test("a resize scales every collar marker in place, syncs the batch, changes the pick signature, and leaves other meshes alone", () => {
  const g = new THREE.Group(), mat = collarMarkerMaterial(new THREE.MeshBasicMaterial({ color: 0x111111 }));
  const markers = Array.from({ length: 30 }, (_, i) => { const m = new THREE.Mesh(PROTO_SPHERE_12, mat); m.scale.setScalar(3.2); m.position.set(i, 0, 0); m.userData = { collarMarker: true, tip: `H${i}\ncollar` }; g.add(m); return m; });
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); other.scale.setScalar(2); g.add(other);
  buildLayerBatches(g);
  const inst = g.children.find((c) => c.isInstancedMesh);
  assert.ok(inst && inst.userData.batchMembers.length === 30);
  const before = batchTag(inst);
  assert.equal(applyCollarMarkerSize(g, 0.3), 30);
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3();
  inst.getMatrixAt(7, m4); s.setFromMatrixScale(m4);
  assert.ok(Math.abs(s.x - 0.3) < 1e-6);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(markers[7].matrixWorld).x - 0.3) < 1e-6); // what picking tests
  assert.notEqual(batchTag(inst), before);
  assert.equal(other.scale.x, 2);
  assert.equal(COLLAR_MARKER_UNIFORMS.uMinPx.value, 1);
  applyCollarMarkerSize(g, 0); // Off
  inst.getMatrixAt(7, m4); s.setFromMatrixScale(m4);
  assert.equal(s.x, 0);
  assert.equal(COLLAR_MARKER_UNIFORMS.uMinPx.value, 0);
  applyCollarMarkerSize(g, 3.2);
  assert.equal(COLLAR_MARKER_UNIFORMS.uMinPx.value, 2.5);
});

test("wiring: the build flags and sizes the markers; ViewerModule keeps the setting in the saved figure settings; the popover offers it", () => {
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const ds = read("../src/modules/viewer/drillholeScene.js");
  assert.match(ds, /marker\.userData = \{ collarMarker: true/);
  assert.match(ds, /holeLabelAnchorsRef\.current = labelAnchors; \/\/ #1277\n\s+collarSize\?\.apply\(groups\.holes, labelAnchors\);/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /const collarSize = useCollarMarkerSize\(figureOverlay\.collarSize, layerGroupsRef, holeLabelAnchorsRef\);/);
  assert.match(v, /collarMaterialRef, collarSize, collars,/);
  assert.match(v, /s \+= `@\$\{a\[0\]\},\$\{a\[12\]\}/); // the pick signature sees a scale change of an unbatched marker
  assert.match(read("../src/modules/viewer/ViewerParts.jsx"), /<CollarSizeControl figureOverlay=\{figureOverlay\} setFigureOverlay=\{setFigureOverlay\} \/>/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); for (const k of ["Collar markers", "Auto", "Radius (m)", "Off"]) assert.ok(j[k], `${l}: ${k}`); }
});
