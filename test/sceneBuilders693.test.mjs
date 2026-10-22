// TASKS.csv #693 — the per-kind scene rebuilds moved out of ViewerModule run in Node with three
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { syncBoundaries, syncSurfaceStructures, syncOmfObjects } from "../src/lib/viewer/sceneBuilders.js";

const origin = { x: 500000, y: 6000000, z: 1000 };
// a terrain sloping north: 1100 m at the south edge, 1300 m at the north edge
const terrain = { id: "t", bbox: [499000, 5999000, 501000, 6001000], gridW: 2, gridH: 2, elevations: [1300, 1300, 1100, 1100] };

test("#693 syncBoundaries: world -> scene, closed flags, drape on terrain, removal disposes", () => {
  const group = new THREE.Group(), cache = {};
  const sq = [{ x: 500000, y: 6000000 }, { x: 500100, y: 6000000 }, { x: 500100, y: 6000100 }];
  syncBoundaries(group, cache, [{ id: "b1", polylines: [sq, sq], closedFlags: [true, false], elevation: 1050 }], { origin, terrain });
  const g = cache.b1;
  assert.equal(group.children.length, 1);
  assert.equal(g.children[0].type, "LineLoop");
  assert.equal(g.children[1].type, "Line");
  const p = g.children[0].geometry.attributes.position.array;
  assert.deepEqual([...p.slice(3, 6)], [100, 50, -0]); // x - ox, z - oz, -(y - oy)
  syncBoundaries(group, cache, [{ id: "b1", polylines: [sq], drapeMode: "terrain" }], { origin, terrain });
  assert.equal(cache.b1.children[0].geometry.attributes.position.array[1], 200); // terrain 1200 at the centre line
  let disposed = 0;
  cache.b1.children[0].geometry.addEventListener("dispose", () => disposed++);
  syncBoundaries(group, cache, [], { origin, terrain });
  assert.equal(group.children.length, 0);
  assert.equal(Object.keys(cache).length, 0);
  assert.equal(disposed, 1);
});

test("#693 syncSurfaceStructures: one instanced disc mesh + ticks per set; the cache is emptied in place", () => {
  const group = new THREE.Group(), cache = { stale: new THREE.Group() };
  group.add(cache.stale);
  const keep = cache;
  const rows = [{ x: 500000, y: 6000000, dip: 0, dipDir: 0, cls: "bedding" }, { x: 500010, y: 6000000, dip: 90, dipDir: 90, cls: "bedding" }];
  syncSurfaceStructures(group, cache, [{ id: "s1", rows, size: 10 }], { origin, terrain });
  assert.equal(cache, keep);
  assert.deepEqual(Object.keys(cache), ["s1"]);
  assert.equal(group.children.length, 1);
  const [inst, ticks] = cache.s1.children;
  assert.equal(inst.count, 2);
  const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  inst.getMatrixAt(0, m); m.decompose(pos, q, sc);
  assert.ok(Math.abs(pos.y - (200 + 0.5)) < 1e-6, `flat disc on the terrain + 0.5 m: ${pos.y}`);
  assert.equal(ticks.geometry.attributes.position.count, 4);
});

test("#693 syncOmfObjects: points, line segments and surfaces; unknown kinds skipped", () => {
  const group = new THREE.Group(), cache = {};
  const v = [0, 0, 0, 10, 0, 0, 0, 10, 5];
  syncOmfObjects(group, cache, [
    { id: "p", kind: "points", vertices: v, origin: [500000, 6000000, 1000] },
    { id: "l", kind: "lines", vertices: v, segments: [0, 1, 1, 2], origin: [500000, 6000000, 1000] },
    { id: "s", kind: "surface", vertices: v, triangles: [0, 1, 2], origin: [500000, 6000000, 1000], visible: false },
    { id: "x", kind: "volume", vertices: v },
  ], { origin });
  assert.deepEqual(Object.keys(cache).sort(), ["l", "p", "s"]);
  assert.equal(cache.p.type, "Points");
  assert.equal(cache.l.type, "LineSegments");
  assert.equal(cache.l.geometry.attributes.position.count, 4);
  assert.equal(cache.s.type, "Mesh");
  assert.equal(cache.s.visible, false);
  assert.deepEqual([...cache.p.geometry.attributes.position.array.slice(6, 9)], [0, 5, -10]);
});

test("#693 syncTerrain: grid -> scene (row 0 north), replaces and disposes the previous mesh, null without terrain", async () => {
  const { syncTerrain } = await import("../src/lib/viewer/sceneBuilders.js");
  const group = new THREE.Group();
  const t = { bbox: [499000, 5999000, 501000, 6001000], gridW: 3, gridH: 3, elevations: [1300, 1300, 1300, 1200, 1200, 1200, 1100, 1100, 1100], color: "#777" };
  const m1 = syncTerrain(group, null, t, { origin });
  assert.equal(group.children.length, 1);
  const p = m1.geometry.attributes.position.array;
  assert.deepEqual([...p.slice(0, 3)], [-1000, 300, -1000]); // NW node: north edge -> scene z = -(ymax - oy)
  assert.equal(m1.geometry.index.count, 2 * 2 * 6);
  let disposed = 0;
  m1.geometry.addEventListener("dispose", () => disposed++);
  const m2 = syncTerrain(group, m1, { ...t, visible: false }, { origin });
  assert.equal(disposed, 1);
  assert.deepEqual(group.children, [m2]);
  assert.equal(m2.visible, false);
  assert.equal(syncTerrain(group, m2, null, { origin }), null);
  assert.equal(group.children.length, 0);
});

test("#693 syncTerrain: a grid above 90,000 nodes is drawn as the adaptive mesh, far fewer triangles", async () => {
  const { syncTerrain } = await import("../src/lib/viewer/sceneBuilders.js");
  const n = 401, elevations = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) elevations[j * n + i] = 1000 + 50 * Math.sin(i / 40) + 30 * Math.cos(j / 25);
  const m = syncTerrain(new THREE.Group(), null, { bbox: [499000, 5999000, 501000, 6001000], gridW: n, gridH: n, elevations }, { origin });
  assert.ok(m.geometry.userData.adaptive, "adaptive path");
  assert.ok(m.geometry.index.count / 3 < 2 * (n - 1) * (n - 1) / 4, `triangles ${m.geometry.index.count / 3}`);
});
