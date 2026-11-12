// TASKS.csv #2695 — Grade estimation's volumeShells and checkedHoleIds were rebuilt on every ViewerModule render while the dialog
// was open: the closed solids' world copies are now cached per mesh geometry and the same array comes back while nothing changed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closedShellsOf } from "../src/modules/viewer/estimationShells.js";

const meshOf = (pts, version = 0) => ({ geometry: { attributes: { position: { array: Float32Array.from(pts), version } }, index: null } });
const tri = [0, 0, 0, 10, 0, 0, 0, 5, -10];

test("world coordinates: E = x + ox, N = oy - z, Z = y + oz, and open surfaces are left out", () => {
  const surfaces = [{ id: "a", name: "Shell", type: "mineralization_envelope", params: null }, { id: "b", name: "Fault", type: "fault" }];
  const out = closedShellsOf(surfaces, { a: meshOf(tri), b: meshOf(tri) }, { x: 1000, y: 2000, z: 300 }, null);
  assert.equal(out.length, 1);
  assert.deepEqual(Array.from(out[0].positions), [1000, 2000, 300, 1010, 2000, 300, 1000, 2010, 305]);
  assert.deepEqual(Array.from(out[0].indices), [0, 1, 2]);
});

test("the same array (and the same world copies) on a render where nothing changed", () => {
  const surfaces = [{ id: "a", name: "Shell", type: "mineralization_envelope" }, { id: "c", name: "Vol", type: "unit_volume", params: { cellVolumeM3: 1000 } }];
  const meshes = { a: meshOf(tri), c: meshOf(tri) };
  const o = { x: 0, y: 0, z: 0 };
  const first = closedShellsOf(surfaces, meshes, o, null);
  const second = closedShellsOf(surfaces, meshes, { ...o }, first);
  assert.equal(second, first);
  assert.equal(first[1].blockSizeM, 10);
});

test("a new surface object, a moved origin, an edited position buffer or a removed solid gives a new list", () => {
  const surfaces = [{ id: "a", name: "Shell", type: "mineralization_envelope" }];
  const meshes = { a: meshOf(tri) };
  const first = closedShellsOf(surfaces, meshes, { x: 0, y: 0, z: 0 }, null);
  const renamed = closedShellsOf([{ ...surfaces[0], name: "Shell 2" }], meshes, { x: 0, y: 0, z: 0 }, first);
  assert.notEqual(renamed, first); assert.equal(renamed[0].name, "Shell 2");
  const moved = closedShellsOf(surfaces, meshes, { x: 5, y: 0, z: 0 }, first);
  assert.notEqual(moved, first); assert.equal(moved[0].positions[0], 5);
  meshes.a.geometry.attributes.position.version++;
  const bumped = closedShellsOf(surfaces, meshes, { x: 5, y: 0, z: 0 }, moved);
  assert.notEqual(bumped, moved);
  assert.deepEqual(closedShellsOf([], meshes, { x: 0, y: 0, z: 0 }, bumped), []);
});

test("ViewerModule passes the cached list and one memoized Set", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const closedShellsForEstimation = \(\) => \(shellsRef\.current = closedShellsOf\(implicitSurfaces, implicitMeshesRef\.current, originRef\.current, shellsRef\.current\)\);/);
  assert.match(v, /const checkedHoleIds = useMemo\(\(\) => new Set\(/);
  assert.equal((v.match(/checkedHoleIds=\{checkedHoleIds\}/g) || []).length, 2);
  assert.ok(!v.includes("checkedHoleIds={new Set("));
  // the dialog's ground (collarGround buckets every collar) is built once per terrain / collars change, not twice a render
  assert.match(v, /const estGround = useMemo\(\(\) => \(!gradeEstOpen \? null : terrain \? \(x, y\) => terrainGroundAt\(terrain, x, y\) : collarGround\(collars\)\), \[gradeEstOpen, terrain, collars\]\);/);
  assert.match(v, /groundAt=\{estGround\}/);
});
