// TASKS.csv #3652 (Fireweed re-test R1, Macpass) — Pick on view with no terrain: a click on a drill trace took that point as the planned collar (from 1,500 m out:
// Elev 1371.1, 163 m under the ground, 75 m from the click). The hole's own drawing is skipped for a collar pick; the click line meets the collar surface.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { pickOnView, drillObjectOf } from "../src/modules/viewer/pickGround.js";
import { collarGround } from "../src/lib/collarGround.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const collars = [];
for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) collars.push({ hole_id: `H${i}_${j}`, x: 442000 + i * 25, y: 7003800 + j * 25, z: 1534 });
const origin = { x: 442000, y: 7003800, z: 1500 };
const ray = { origin: new THREE.Vector3(-200, 600, 0), direction: new THREE.Vector3(0.3, -0.954, 0).normalize() };
const flat = () => { const t = -ray.origin.y / ray.direction.y; return { x: ray.origin.x + ray.direction.x * t + origin.x, y: -(ray.origin.z + ray.direction.z * t) + origin.y, z: origin.z, on: null, plane: true }; };
// what ViewerModule's worldPointFromHits gives: the nearest drawn hit, else the flat plane
const toWorld = (hits) => (hits.length ? { x: 441997.6, y: 7003858.1, z: 1371.1, on: "a drillhole" } : flat());
const traceProxy = { isObject3D: true, isLine: true, traceProxy: true, userData: { holeId: "TS23-009" }, parent: null };
const traceHit = { object: traceProxy, distance: 900, point: new THREE.Vector3(0, 0, 0) };

test("a click on a hole trace gives the collar surface under the click line, and names the hole", () => {
  const p = pickOnView(ray, [traceHit], toWorld, collars, origin);
  assert.ok(p.onCollarSurface, JSON.stringify(p));
  assert.equal(p.fromHole, "TS23-009");
  assert.ok(Math.abs(p.z - collarGround(collars)(p.x, p.y)) < 0.5);
  assert.ok(p.z > 1500, `Elev ${p.z}, not the trace's 1371.1`);
});

test("no flat plane along the ray (nothing else hit): the collar surface is still found", () => {
  const p = pickOnView(ray, [traceHit], (hits) => (hits.length ? { x: 1, y: 2, z: 3, on: "a drillhole" } : null), collars, origin);
  assert.ok(p && p.onCollarSurface && p.fromHole === "TS23-009", JSON.stringify(p));
});

test("a hole's drawing is recognized (trace chunk hit, interval tube in a layer group, an assay); a collar marker and anything else is not", () => {
  const root = { name: "root", parent: null, userData: {} };
  const tube = { userData: {}, parent: { name: "litho", parent: root, userData: {} } };
  assert.equal(drillObjectOf(traceProxy), "TS23-009");
  assert.equal(drillObjectOf(tube), "a hole");
  assert.equal(drillObjectOf({ userData: {}, parent: { name: "assay", parent: root, userData: {} } }), "a hole");
  assert.equal(drillObjectOf({ userData: { collarMarker: true, holeId: "X" }, parent: { name: "holes", parent: root, userData: {} } }), null);
  assert.equal(drillObjectOf({ userData: {}, parent: { name: "voxels", parent: root, userData: {} } }), null);
});

test("with a terrain loaded (collars null) the pick is as it was, and the planned-hole form says what it did (source pins)", () => {
  const w = pickOnView(ray, [traceHit], toWorld, null, origin);
  assert.equal(w.on, "a drillhole");
  assert.match(read("../src/components/PlannedHoleParts.jsx"), /pickedPoint\.fromHole && pickedPoint\.onCollarSurface && !underground \? tr\("You clicked hole \{id\}, which is under the ground:/);
});
