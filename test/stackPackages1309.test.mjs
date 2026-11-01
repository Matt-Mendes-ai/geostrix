// TASKS.csv #1309 — conformable packages separated by unconformities
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { surfacePackages, unitPackage, contactSurface, contactPackage, movePointsToUnconformities } from "../src/lib/viewer/stackPackages.js";

// Z, Y | M, N, O: an unconformity below Y (index 1)
const B = new Set([1]);

test("#1309 the unconformity is the top of the unit below the break, and it stays with the upper package", () => {
  assert.deepEqual(surfacePackages(5, B), [0, 0, 0, 1, 1]);
  assert.deepEqual(surfacePackages(3, new Set()), [0, 0, 0]);
  assert.deepEqual(surfacePackages(6, new Set([0, 3])), [0, 0, 1, 1, 1, 2], "two unconformities");
  assert.deepEqual(surfacePackages(3, B), [0, 0, 0], "nothing below the unconformity: one package");
});

test("#1309 bedding goes by the rock: M's bedding is the lower package though M's top is the unconformity", () => {
  assert.equal(unitPackage(1, B), 0, "Y");
  assert.equal(unitPackage(2, B), 1, "M");
  assert.equal(unitPackage(4, B), 1, "O");
  assert.equal(unitPackage(5, new Set([0, 3])), 2);
});

test("#1309 a contact across the break goes to the unconformity, one inside a package to the older unit's top only", () => {
  assert.equal(contactSurface(1, 2, B), 2, "Y on M: the unconformity");
  assert.equal(contactSurface(1, 4, B), 2, "Y on O, with M and N eroded: still the unconformity, not the top of O");
  assert.equal(contactSurface(0, 3, B), 2, "Z on N");
  assert.equal(contactSurface(2, 4, B), 4, "M on O with N missing: inside the package");
  assert.equal(contactSurface(0, 1, B), 1, "Z on Y");
});

test("#1309 a dip fitted on a contact follows the same split", () => {
  assert.equal(contactPackage(1, 3, B), 0, "across the break: the unconformity's own dip");
  assert.equal(contactPackage(2, 3, B), 1, "below it");
  assert.equal(contactPackage(0, 1, B), 0, "above it");
  const two = new Set([0, 3]);
  assert.equal(contactPackage(3, 4, two), 1, "the second break's own dip, in the middle package");
  assert.equal(contactPackage(4, 5, two), 2);
});

test("#1309 hole contacts under the unconformity move onto it; others and points without a hole stay", () => {
  const specs = ["Z", "Y", "M", "N"].map((u) => ({ meshName: u, codes: [u], points: [] }));
  const rows = [{ hole_id: "A", to: 10, value: "Y" }, { hole_id: "A", to: 50, value: "N" }, { hole_id: "B", to: 20, value: "M" }, { hole_id: "C", to: 5, value: "SOIL" }];
  specs[3].points = [
    { hole_id: "A", contactMd: 10, x: 1 }, // Y directly on N: on the unconformity
    { hole_id: "B", contactMd: 20, x: 2 }, // M on N: conformable, stays
    { hole_id: "C", contactMd: 5, x: 3 }, // soil above: not a stack unit, stays
    { x: 4 }, // a drawn contact: no hole, stays
  ];
  const moved = movePointsToUnconformities(specs, rows, B);
  assert.deepEqual(specs[3].points.map((p) => p.x), [2, 3, 4]);
  assert.deepEqual(specs[2].points.map((p) => p.x), [1]);
  assert.deepEqual(moved, [0, 0, 1, 0]);
});

test("#1309 the sidecar groups by package, one field each, and dedupes inside each", () => {
  const src = fs.readFileSync(new URL("../python-sidecar/app/main.py", import.meta.url), "utf8");
  assert.match(src, /package: Optional\[int\] = None/);
  assert.match(src, /structural_relation=StackRelationType\.ERODE\)\s*\n\s*for [^\n]*packaged/);
  assert.match(src, /_dedupe_onlap_orientations\(members\)/);
});

test("#1309 the run's request carries the package", () => {
  const src = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /points: s\.points, orientations: s\.orientations \}\)\),\s*\n\s*\/\/ TASKS\.csv #271/, "the stack's surfaces");
  assert.match(src, /s\.package != null \? \{ package: s\.package \}/);
});
