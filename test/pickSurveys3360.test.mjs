// TASKS.csv #3360 / #3361 (follow-ups of #3309, Galore Creek review) — survey points are picked on their symbol's bounding sphere, the
// nearest few per survey (after a far zoom-out a hover ray-tested ~43 M triangles, 15 s); each compact batch keeps its own tree, so adding
// or removing a small survey no longer re-boxes 543,820 instances (~1 s); a zoom's in-place resize refits a survey's boxes.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PICK_ONLY_LAYER } from "../src/lib/viewer/pickStandIn.js";
import { addCompactBatch, eachPickTarget, syncBatchedInstances } from "../src/lib/viewer/layerBatches.js";
import { buildPickIndex, queryPickIndex, batchTree } from "../src/lib/pickIndex.js";

const proto = new THREE.SphereGeometry(1, 8, 6);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function survey(g, key, n, size, spread = 300) {
  const base = new Float32Array(n * 16), rows = [];
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    base[o] = base[o + 5] = base[o + 10] = size; base[o + 15] = 1;
    base[o + 12] = rnd() * spread - spread / 2; base[o + 13] = -rnd() * 100; base[o + 14] = rnd() * spread - spread / 2;
    rows.push({ tip: `${key} ${i}` });
  }
  const inst = addCompactBatch(g, proto, {}, base, rows, new Float32Array(n * 3).fill(0.5));
  if (key) inst.userData.geophysSurvey = key;
  return inst;
}
const ray = (x, z) => { const rc = new THREE.Raycaster(new THREE.Vector3(x, 5000, z), new THREE.Vector3(0, -1, 0)); rc.layers.enable(PICK_ONLY_LAYER); return rc; };
const pick = (g, rc) => { g.updateMatrixWorld(true); const list = []; eachPickTarget(g, (c) => list.push(c)); return rc.intersectObjects(queryPickIndex(buildPickIndex(list), rc), false); };
// every instance's sphere hit, by brute force: [distance, i]
function brute(inst, rc) {
  const out = [], base = inst.userData.compact.base, sph = new THREE.Sphere(), at = new THREE.Vector3();
  for (let i = 0; i < inst.userData.compact.rows.length; i++) {
    const m = new THREE.Matrix4().fromArray(base, i * 16).premultiply(inst.matrixWorld);
    sph.copy(proto.boundingSphere).applyMatrix4(m);
    if (rc.ray.intersectSphere(sph, at)) out.push([rc.ray.origin.distanceTo(at), i]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

test("a survey point is hit on its sphere: the nearest is the brute-force nearest, the distance three's sphere test's", () => {
  const g = new THREE.Group(), inst = survey(g, "IP.xyz", 3000, 4);
  for (const [x, z] of [[0, 0], [37, -81], [-120, 64], [5, 140]]) {
    const rc = ray(x, z), hits = pick(g, rc), b = brute(inst, rc);
    if (!b.length) { assert.equal(hits.length, 0); continue; }
    assert.equal(hits[0].object.instanceId, b[0][1], `${x}, ${z}`);
    assert.ok(Math.abs(hits[0].distance - b[0][0]) < 1e-6);
    assert.equal(hits[0].object.userData.tip, `IP.xyz ${b[0][1]}`);
    assert.equal(hits[0].object.parent, g);
  }
  assert.equal(pick(g, ray(5000, 5000)).length, 0, "a ray past the cloud meets nothing");
});

test("symbols much bigger than their spacing: only the 32 nearest of a survey come back, and they are the nearest 32", () => {
  const g = new THREE.Group(), a = survey(g, "A", 2000, 250), b = survey(g, "B", 1500, 250);
  const rc = ray(10, -20), hits = pick(g, rc);
  for (const inst of [a, b]) {
    const mine = hits.filter((h) => h.object.batch === inst).map((h) => h.object.instanceId).sort((p, q) => p - q);
    assert.equal(mine.length, 32);
    assert.deepEqual(mine, brute(inst, rc).slice(0, 32).map((e) => e[1]).sort((p, q) => p - q));
  }
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].distance >= hits[i - 1].distance, "sorted nearest first");
});

test("a hidden point is no candidate; a batch that is no survey is still tested on its triangles, every box the ray meets", () => {
  const g = new THREE.Group(), inst = survey(g, "IP.xyz", 400, 6, 60);
  const rc = ray(0, 0), first = brute(inst, rc)[0];
  assert.ok(first, "the ray meets a symbol");
  inst.userData.compact.hidden[first[1]] = 1;
  syncBatchedInstances(inst);
  assert.ok(pick(g, rc).every((h) => h.object.instanceId !== first[1]));
  const g2 = new THREE.Group(), plain = survey(g2, null, 400, 6, 60);
  const hits = pick(g2, rc);
  assert.ok(hits.length >= 1 && hits[0].face, "triangle hits (a face) for an assay-like batch");
  assert.ok(brute(plain, rc).length >= hits.length);
});

test("#3361: each batch's tree is kept while the batch is unchanged; a new survey builds only its own", () => {
  const g = new THREE.Group(), big = survey(g, "IP.xyz", 20000, 3, 3000), assays = survey(g, null, 5000, 2, 3000);
  g.updateMatrixWorld(true);
  const list = []; eachPickTarget(g, (c) => list.push(c));
  buildPickIndex(list);
  const tBig = batchTree(big), tAssays = batchTree(assays);
  const small = survey(g, "electrodes", 514, 2, 3000);
  g.updateMatrixWorld(true);
  const list2 = []; eachPickTarget(g, (c) => list2.push(c));
  const idx = buildPickIndex(list2);
  assert.equal(batchTree(big), tBig, "the big survey's tree is the same object");
  assert.equal(batchTree(assays), tAssays);
  assert.equal(idx.boxedCount, 20000 + 5000 + 514);
  assert.deepEqual(idx.surveys.map((s) => s.obj), [big, small], "the surveys walked per query");
  g.remove(small);
  const list3 = []; eachPickTarget(g, (c) => list3.push(c));
  buildPickIndex(list3);
  assert.equal(batchTree(big), tBig, "removing a survey keeps the others' trees too");
  // a batch moved (#3117's moves) or re-placed gets a new tree
  assays.userData.compact.moves = 1;
  assert.notEqual(batchTree(assays), tAssays);
});

test("a zoom's in-place resize (no index rebuild) refits the survey's boxes: a grown symbol's rim is hit", () => {
  const g = new THREE.Group(), inst = survey(g, "IP.xyz", 1, 2);
  const cp = inst.userData.compact;
  cp.base[12] = 0; cp.base[13] = 0; cp.base[14] = 0;
  syncBatchedInstances(inst);
  g.updateMatrixWorld(true);
  const list = []; eachPickTarget(g, (c) => list.push(c));
  const idx = buildPickIndex(list), rc = ray(8, 0);
  assert.equal(rc.intersectObjects(queryPickIndex(idx, rc), false).length, 0, "radius 2: the ray at x = 8 misses");
  const tree = batchTree(inst);
  cp.base[0] = cp.base[5] = cp.base[10] = 10; // geophysPts.js rescale: the same arrays, the same index
  syncBatchedInstances(inst);
  const hits = rc.intersectObjects(queryPickIndex(idx, rc), false);
  assert.equal(hits.length, 1, "radius 10: hit, with the index as it was");
  assert.equal(batchTree(inst), tree, "refitted, not rebuilt");
  assert.ok(Math.abs(hits[0].distance - (5000 - 6)) < 1e-6, "on the sphere: sqrt(10^2 - 8^2) = 6 below the top");
});

test("the tree: on random boxes a query returns every box the ray meets (a superset, never fewer)", () => {
  const g = new THREE.Group(), plain = survey(g, null, 30000, 3, 2000);
  g.updateMatrixWorld(true);
  const list = []; eachPickTarget(g, (c) => list.push(c));
  const idx = buildPickIndex(list), box = new THREE.Box3();
  if (!proto.boundingBox) proto.computeBoundingBox();
  for (const [x, z] of [[0, 0], [400, -300], [-999, 999], [12.5, 7.25]]) {
    const rc = ray(x, z), got = new Set(queryPickIndex(idx, rc).map((v) => v.instanceId));
    for (let i = 0; i < 30000; i++) {
      box.copy(proto.boundingBox).applyMatrix4(new THREE.Matrix4().fromArray(plain.userData.compact.base, i * 16));
      if (rc.ray.intersectsBox(box)) assert.ok(got.has(i), `instance ${i} at ${x}, ${z}`);
    }
  }
});
