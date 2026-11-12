// TASKS.csv #2776 (Matt's #2777 decision (a)) — collar markers, hole traces and boundary lines are drawn over a flat raster in the 3D View:
// the raster first in the transparent pass (renderOrder 1), these after it at full opacity (5 / 6 / 7) with their depth kept.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { DRAW_ORDER } from "../src/lib/viewer/drawOrder.js";
import { addTraceChunks } from "../src/lib/viewer/traceBatch.js";
import { buildLayerBatches } from "../src/lib/viewer/layerBatches.js";
import { collarMarkerMaterial } from "../src/lib/viewer/collarMarkerShader.js";
import { PROTO_SPHERE_12 } from "../src/lib/viewer/protos.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the order: flat raster, then traces, collar markers and lines; map layers (2 + index) and labels (999) unchanged around them", () => {
  assert.ok(DRAW_ORDER.flatRaster < DRAW_ORDER.traces && DRAW_ORDER.traces < DRAW_ORDER.collars && DRAW_ORDER.collars < DRAW_ORDER.lines && DRAW_ORDER.lines < 999);
});

test("trace chunks carry the traces' order", () => {
  const g = new THREE.Group();
  const out = addTraceChunks(g, [{ holeId: "A", pts: [{ x: 0, y: 0, z: 0, md: 0 }, { x: 0, y: -10, z: 0, md: 10 }] }, { holeId: "B", pts: [{ x: 5, y: 0, z: 0, md: 0 }, { x: 5, y: -10, z: 0, md: 10 }], dashed: true }]);
  assert.ok(out.length >= 2);
  for (const l of out) { assert.equal(l.renderOrder, DRAW_ORDER.traces); assert.equal(l.material.transparent, true); }
});

test("a batch of opacity-1 transparent members (collar markers) keeps its depth write and their order; a see-through batch still drops it (#201)", () => {
  const g = new THREE.Group();
  const marker = collarMarkerMaterial(new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true }));
  for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(PROTO_SPHERE_12, marker); m.renderOrder = DRAW_ORDER.collars; m.position.set(i, 0, 0); m.userData = { collarMarker: true }; g.add(m); }
  const seeThrough = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.5 });
  for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(PROTO_SPHERE_12, seeThrough); m.position.set(i, 5, 0); g.add(m); }
  buildLayerBatches(g);
  const batches = g.children.filter((c) => c.isInstancedMesh);
  assert.equal(batches.length, 2);
  const mk = batches.find((b) => b.material.userData?.collarMarker), st = batches.find((b) => b !== mk);
  assert.equal(mk.renderOrder, DRAW_ORDER.collars);
  assert.equal(mk.material.transparent, true); assert.equal(mk.material.opacity, 1); assert.equal(mk.material.depthWrite, true);
  assert.equal(st.renderOrder, 0); assert.equal(st.material.depthWrite, false);
});

test("wiring: a flat raster (not draped) at the raster order; boundary lines and collar markers in the pass after it", () => {
  const sb = read("../src/lib/viewer/sceneBuilders.js");
  assert.match(sb, /if \(ground\) \{ mesh\.renderOrder = -1;[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*else if \(!drapeOnTerrain\) mesh\.renderOrder = DRAW_ORDER\.flatRaster;/);
  assert.match(sb, /new THREE\.LineBasicMaterial\(\{ color: b\.color \|\| "#e2a63c", transparent: true \}\)/);
  assert.match(sb, /line\.renderOrder = DRAW_ORDER\.lines;/);
  const ds = read("../src/modules/viewer/drillholeScene.js");
  assert.match(ds, /new THREE\.MeshBasicMaterial\(\{ color: collarColorFor\(bgColorRef\.current\), transparent: true \}\)/);
  assert.match(ds, /marker\.renderOrder = DRAW_ORDER\.collars;/);
});
