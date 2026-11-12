// TASKS.csv #2932 (WA iron review) — assays drawn as 180-triangle spheres: Fe on 147,891 samples orbits at 14-19 fps. An assay can be drawn
// along the hole (the logged layers' 6-sided cylinder, 24 triangles), and the default is automatic: spheres up to 40,000 samples, along
// the hole above. The user's own shape always wins.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { ASSAY_AUTO_LIMIT, ASSAY_TRACE, assayShapeFor, assayProto, placeAssayMarker } from "../src/lib/viewer/assayShape.js";
import { PROTO_CYLINDER, PROTO_SPHERE_10, PROTO_CUBE } from "../src/lib/viewer/protos.js";
import { traceLookup } from "../src/lib/viewer/modelHelpers.js";

test("automatic: spheres up to the limit, along the hole above; a chosen shape and a pXRF cube win", () => {
  assert.equal(assayShapeFor(null, 1000), "sphere");
  assert.equal(assayShapeFor({}, ASSAY_AUTO_LIMIT), "sphere");
  assert.equal(assayShapeFor({}, 147891), ASSAY_TRACE); // the review's Fe
  assert.equal(assayShapeFor({ shape: "sphere" }, 147891), "sphere", "spheres chosen: kept on a big project");
  assert.equal(assayShapeFor({ shape: "cube" }, 10), "cube");
  assert.equal(assayShapeFor({ shape: ASSAY_TRACE }, 10), ASSAY_TRACE);
  assert.equal(assayShapeFor({ shape: "bogus" }, 10), "sphere");
  assert.equal(assayShapeFor({ shape: ASSAY_TRACE }, 10, true), "cube");
  assert.equal(assayProto(ASSAY_TRACE), PROTO_CYLINDER);
  assert.equal(assayProto("sphere"), PROTO_SPHERE_10);
  assert.equal(assayProto("cube"), PROTO_CUBE);
  const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  assert.ok(tris(PROTO_CYLINDER) * 5 < tris(PROTO_SPHERE_10), `${tris(PROTO_CYLINDER)} vs ${tris(PROTO_SPHERE_10)} triangles`);
});

test("along the hole: a cylinder from `from` to `to`, as thick as the sphere, turned with the trace and offset like the sphere", () => {
  const pts = [{ md: 0, x: 0, y: 100, z: 0 }, { md: 100, x: 60, y: 20, z: 0 }]; // a 100 m hole dipping east
  const at = traceLookup(pts).at, m = new THREE.Mesh();
  assert.equal(placeAssayMarker(m, ASSAY_TRACE, at, { from: 10, to: 12 }, 2.5, 3, 0), true);
  assert.deepEqual([m.position.x, m.position.y, m.position.z].map((v) => +v.toFixed(3)), [9, 92, 0]);
  assert.deepEqual([m.scale.x, +m.scale.y.toFixed(6), m.scale.z], [2.5, 2, 2.5]);
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
  assert.ok(Math.abs(axis.x - 0.6) < 1e-9 && Math.abs(axis.y + 0.8) < 1e-9, "along the hole");
  const s = new THREE.Mesh();
  assert.equal(placeAssayMarker(s, "sphere", at, { from: 10, to: 12 }, 2.5), true);
  assert.deepEqual([s.position.x, s.position.y].map((v) => +v.toFixed(3)), [6.6, 91.2]);
  assert.equal(s.scale.x, 2.5);
  assert.equal(placeAssayMarker(new THREE.Mesh(), ASSAY_TRACE, traceLookup([]).at, { from: 1, to: 2 }, 1), false);
  const z = new THREE.Mesh();
  assert.equal(placeAssayMarker(z, ASSAY_TRACE, at, { from: 5, to: 5 }, 2), true, "a zero-length sample still draws");
  assert.equal(z.scale.y, 0.5);
});

test("wiring: the 3D view counts the samples to draw and places each marker through the lib; the dialog offers Automatic and Along the hole", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /shape = assayShapeFor\(style, drawnAssays, px\)/);
  assert.match(v, /new PickStandIn\(assayProto\(shape\),/);
  assert.match(v, /if \(!placeAssayMarker\(mesh, shape, look\.at, a, assaySizeFor\(v, ranges\[sym\], style\), offX, offZ\)\) return;/);
  const d = fs.readFileSync(new URL("../src/components/AssayStyleModal.jsx", import.meta.url), "utf8");
  assert.match(d, /shape: style\?\.shape \|\| "auto"/);
  assert.match(d, /shape: next\.shape === "auto" \? null : next\.shape/);
  assert.match(d, /tr\("Automatic: spheres, or along the hole above \{n\} samples"/);
  assert.match(d, /tr\("Along the hole"\)/);
});
