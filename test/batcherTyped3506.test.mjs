// TASKS.csv #3506 — the assay batcher writes each marker's matrix and colour straight into typed arrays that double when full (it pushed 19 numbers a
// marker into plain arrays and copied them with Float32Array.from), and reuses the last family and colour. The same arrays come out.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { makeAssayBatcher } from "../src/lib/viewer/assayBatcher.js";

const COLOURS = ["#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00"];
const geoA = new THREE.SphereGeometry(1, 4, 3), geoB = new THREE.BoxGeometry(1, 1, 1);

test("a run of markers across the array growth, two families, mixed colours: matrices and colours as computed marker by marker", () => {
  const b = makeAssayBatcher({ minBatch: 1 });
  const expectA = { base: [], col: [] }, expectB = { base: [], col: [] };
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const geo = i % 7 === 0 ? geoB : geoA, color = COLOURS[Math.floor(i / 5) % COLOURS.length] /* runs of five */, opacity = geo === geoB ? 0.5 : 1;
    const pos = new THREE.Vector3(i * 1.5 + 0.1, -i * 0.25, 100 + (i % 13)), sc = 0.5 + (i % 4) * 0.25;
    const ok = b.add(geo, { color, transparent: opacity < 1, opacity }, (t) => { t.position.copy(pos); t.scale.set(sc, sc, sc); return true; }, () => ({ i }));
    assert.equal(ok, true);
    m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); c.set(color);
    const e = geo === geoB ? expectB : expectA;
    e.base.push(...m.elements); e.col.push(c.r, c.g, c.b);
  }
  assert.equal(b.add(geoA, { color: "#000000" }, () => false, () => ({})), false, "a skipped row writes nothing");
  const group = new THREE.Group();
  assert.equal(b.finish(group), N);
  assert.equal(group.children.length, 2);
  for (const mesh of group.children) {
    const e = mesh.geometry === geoB ? expectB : expectA, cp = mesh.userData.compact;
    assert.equal(cp.rows.length, e.col.length / 3);
    assert.deepEqual(Array.from(cp.base), Array.from(Float32Array.from(e.base)), "matrices");
    assert.deepEqual(Array.from(mesh.instanceColor.array), Array.from(Float32Array.from(e.col)), "colours");
    assert.equal(cp.base.length, cp.rows.length * 16, "exactly the markers written, not the capacity");
    assert.equal(mesh.instanceColor.array.length, cp.rows.length * 3);
  }
  assert.deepEqual(group.children.map((x) => x.userData.compact.rows.map((r) => r.i)).flat().sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i), "every row, once");
  // the batcher is reusable: nothing of the first build is left in the second
  const again = new THREE.Group();
  b.add(geoA, { color: "#123456" }, (t) => { t.position.set(1, 2, 3); return true; }, () => ({ i: -1 }));
  assert.equal(b.finish(again), 1);
  assert.equal(again.children[0].userData.compact.rows.length, 1);
});

test("a family under the batch minimum is made as stand-ins with the same positions", () => {
  const b = makeAssayBatcher(); // minBatch 24
  for (let i = 0; i < 5; i++) b.add(geoA, { color: COLOURS[i] }, (t) => { t.position.set(i, 0, 0); return true; }, () => ({ i }));
  const group = new THREE.Group();
  assert.equal(b.finish(group), 5);
  assert.equal(group.children.length, 5);
  group.children.forEach((s, i) => assert.equal(s.position.x, i));
});

test("a colour given as an object and a string for the same family both resolve; a changed colour changes the rgb", () => {
  const b = makeAssayBatcher({ minBatch: 1 });
  const red = new THREE.Color("#ff0000");
  const place = (t) => { t.position.set(0, 0, 0); return true; };
  b.add(geoA, { color: red }, place, () => ({})); b.add(geoA, { color: red }, place, () => ({})); b.add(geoA, { color: "#00ff00" }, place, () => ({}));
  const g = new THREE.Group(); b.finish(g);
  const col = Array.from(g.children[0].instanceColor.array);
  assert.deepEqual(col.slice(0, 3), [1, 0, 0]); assert.deepEqual(col.slice(3, 6), [1, 0, 0]); assert.ok(col[7] > 0.9 && col[6] === 0 && col[8] === 0);
});
