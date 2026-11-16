// TASKS.csv #3697 — Pick on view with a block model drawn: the planned collar is on the ground, not on the model.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { pickOnView, modelObjectOf } from "../src/modules/viewer/pickGround.js";

const root = new THREE.Group(); root.name = "root";
const mk = (groupName) => { const g = new THREE.Group(); g.name = groupName; root.add(g); const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); g.add(m); return m; };
const block = mk("voxels"), omf = mk("omf"), surf = mk("implicit"), other = mk("rasters");

test("modelObjectOf names the kind of model a hit belongs to; other groups are not models", () => {
  assert.equal(modelObjectOf(block), "block model");
  assert.equal(modelObjectOf(omf), "model");
  assert.equal(modelObjectOf(surf), "modelled surface");
  assert.equal(modelObjectOf(other), null);
  assert.equal(modelObjectOf(null), null);
});

// collars in a plane z = 100: a ground the pick falls back on
const collars = [{ hole_id: "A", x: 0, y: 0, z: 100 }, { hole_id: "B", x: 100, y: 0, z: 100 }, { hole_id: "C", x: 0, y: 100, z: 100 }, { hole_id: "D", x: 100, y: 100, z: 100 }];
const origin = { x: 0, y: 0, z: 0 };
const ray = new THREE.Ray(new THREE.Vector3(50, 400, -50), new THREE.Vector3(0, -1, 0)); // straight down at E 50 / N 50 (scene: x east, y up, -z north)
const hit = (object, y) => ({ object, point: new THREE.Vector3(50, y, -50), distance: 400 - y });
const toWorld = (hits) => { const h = hits[0]; return h ? { x: h.point.x, y: -h.point.z, z: h.point.y, on: "model" } : null; };

test("a block model hit first: the point is on the collar surface and says what was clicked", () => {
  const p = pickOnView(ray, [hit(block, 60)], toWorld, collars, origin);
  assert.ok(p && p.onCollarSurface, JSON.stringify(p));
  assert.equal(p.fromModel, "block model");
  assert.ok(Math.abs(p.z - 100) < 0.5, "the ground, 100 m, not the model's 60 m: " + p.z);
});

test("a model that is not first, no model at all, and the wiring", () => {
  const p0 = pickOnView(ray, [], toWorld, collars, origin);
  assert.ok(!p0 || !p0.fromModel);
  const src = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(src, /pickedPoint\.fromModel && pickedPoint\.onCollarSurface && !underground/);
});
