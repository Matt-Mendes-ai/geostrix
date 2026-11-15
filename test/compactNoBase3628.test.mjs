// TASKS.csv #3628 — a compact batch no longer keeps `base`, a second copy of each row's matrix: the drawn matrices are the placements, a hidden row's 3 x 3 block is kept apart
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { addCompactBatch, syncCompact, zeroRow } from "../src/lib/viewer/layerBatches.js";
import { shiftMarkers } from "../src/lib/viewer/assayKeep.js";

const mk = (n) => {
  const base = new Float32Array(n * 16), rows = [], col = new Float32Array(n * 3);
  const m = new THREE.Matrix4();
  for (let k = 0; k < n; k++) { m.compose(new THREE.Vector3(k, 2 * k, 3 * k), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1 * k, 0.2, 0.3)), new THREE.Vector3(1 + k, 2 + k, 3 + k)).toArray(base, k * 16); rows.push({ holeId: `H${k}` }); }
  const group = new THREE.Group();
  const inst = addCompactBatch(group, new THREE.BoxGeometry(1, 1, 1), {}, base, rows, col);
  return { inst, base: base.slice(), n };
};
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test("#3628 there is no second array: base is the mesh's own matrices while nothing is hidden", () => {
  const { inst, base } = mk(30);
  const cp = inst.userData.compact;
  assert.equal(Object.getOwnPropertyDescriptor(cp, "base").get !== undefined, true, "base is a getter");
  assert.equal(cp.base, inst.instanceMatrix.array); assert.ok(eq(cp.base, base));
});

test("#3628 a hidden row is drawn at zero scale, its translation kept, and base still reads the true matrix; shown again it is restored exactly", () => {
  const { inst, base } = mk(30);
  const cp = inst.userData.compact, a = inst.instanceMatrix.array, moves0 = cp.moves || 0;
  cp.hidden[4] = 1; cp.hidden[17] = 1; syncCompact(inst);
  for (const i of [4, 17]) { const o = i * 16; assert.deepEqual([a[o], a[o + 1], a[o + 2], a[o + 4], a[o + 5], a[o + 6], a[o + 8], a[o + 9], a[o + 10]], [0, 0, 0, 0, 0, 0, 0, 0, 0]); assert.deepEqual([a[o + 12], a[o + 13], a[o + 14]], [base[o + 12], base[o + 13], base[o + 14]]); }
  assert.ok(eq(cp.base, base), "the true placements, for the pick tree and the matrices views");
  assert.notEqual(cp.base, a); assert.equal(cp.base, cp.base, "cached until the next change");
  assert.ok((cp.moves || 0) > moves0, "the pick tree is keyed on moves: it is rebuilt");
  cp.hidden[4] = 0; syncCompact(inst);
  assert.ok(eq(a.slice(4 * 16, 5 * 16), base.slice(4 * 16, 5 * 16)), "row 4 restored exactly"); assert.equal(cp.saved.size, 1);
  cp.hidden[17] = 0; syncCompact(inst);
  assert.ok(eq(a, base)); assert.equal(cp.saved.size, 0); assert.equal(cp.base, a);
});

test("#3628 shiftMarkers moves every row once (a hidden one too), zeroRow empties a row for good", () => {
  const { inst, base } = mk(30);
  const cp = inst.userData.compact, a = inst.instanceMatrix.array;
  cp.hidden[3] = 1; syncCompact(inst);
  assert.equal(shiftMarkers(inst, 10, -5), true);
  for (const i of [0, 3, 29]) { const o = i * 16; assert.equal(a[o + 12], Math.fround(base[o + 12] + 10)); assert.equal(a[o + 14], Math.fround(base[o + 14] - 5)); }
  cp.hidden[3] = 0; syncCompact(inst);
  const o = 3 * 16; assert.equal(a[o], base[o]); assert.equal(a[o + 12], Math.fround(base[o + 12] + 10), "the shifted translation, the original block");
  zeroRow(inst, 7); syncCompact(inst);
  assert.ok(a.slice(7 * 16, 8 * 16).every((v) => v === 0)); assert.equal(cp.hidden[7], 1); assert.equal(cp.saved.has(7), true, "its zeros are all that is kept: nothing to bring back");
  assert.deepEqual([...cp.base.slice(7 * 16, 7 * 16 + 4)], [0, 0, 0, 0]);
});
