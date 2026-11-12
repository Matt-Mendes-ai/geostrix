// TASKS.csv #1643 — a batch of pick stand-ins keeps no member objects: rows, placements, hidden flags and colours live on the batch,
// readers see an InstanceView per instance, and the pick index boxes and returns instances
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PickStandIn, PICK_ONLY_LAYER } from "../src/lib/viewer/pickStandIn.js";
import { buildLayerBatches, eachLayerMember, eachPickTarget, syncBatchedInstances } from "../src/lib/viewer/layerBatches.js";
import { buildPickIndex, queryPickIndex } from "../src/lib/pickIndex.js";
import { PROTO_CYLINDER } from "../src/lib/viewer/protos.js";

// 40 vertical unit-radius intervals of one family, 10 m long, 20 m apart along x; userData as the build gives them
function group40() {
  const g = new THREE.Group();
  for (let i = 0; i < 40; i++) {
    const m = new PickStandIn(PROTO_CYLINDER, { color: i % 2 ? "#ff0000" : "#336699" }); // #336699: all three channels
    m.position.set(i * 20, -10, 0); m.scale.set(1, 10, 1);
    m.userData = { holeId: `H${i}`, catValue: i % 2 ? "A" : "B", row: { hole_id: `H${i}`, from: 0, to: 10 }, tip: `H${i}\nLith` };
    g.add(m);
  }
  return g;
}

test("a stand-in family becomes one compact batch with no members kept", () => {
  const g = group40();
  buildLayerBatches(g);
  assert.equal(g.children.length, 1);
  const inst = g.children[0];
  assert.ok(inst.isInstancedMesh && inst.userData.compact && !inst.userData.batchMembers);
  const cp = inst.userData.compact;
  assert.equal(cp.rows.length, 40);
  assert.equal(cp.rows[7].holeId, "H7");
  assert.deepEqual([...inst.instanceColor.array.slice(3, 6)], [1, 0, 0], "row 1's colour");
  const blue = new THREE.Color("#336699");
  assert.deepEqual([...inst.instanceColor.array.slice(0, 3)], [Math.fround(blue.r), Math.fround(blue.g), Math.fround(blue.b)], "row 0: r, g and b");
  const m = new THREE.Matrix4(); inst.getMatrixAt(3, m);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(m).toArray(), [60, -10, 0]);
});

test("readers see a view per instance: userData, parent, visible and colour write through to the batch", () => {
  const g = group40();
  buildLayerBatches(g);
  const inst = g.children[0];
  const seen = [];
  eachLayerMember(g, (v) => seen.push(v));
  assert.equal(seen.length, 40);
  assert.ok(seen[5].isInstanceView && seen[5].parent === g && seen[5].userData.holeId === "H5" && seen[5].visible);
  // the Holes-list pass hides H5, the legend repaints H6, then the batch is synced
  seen[5].visible = false;
  seen[6].material.color.set("#00ff00");
  syncBatchedInstances(inst);
  const m = new THREE.Matrix4(); inst.getMatrixAt(5, m);
  assert.equal(new THREE.Vector3().setFromMatrixScale(m).length(), 0, "hidden: zero scale");
  inst.getMatrixAt(6, m);
  assert.ok(new THREE.Vector3().setFromMatrixScale(m).length() > 1, "others drawn");
  assert.deepEqual([...inst.instanceColor.array.slice(18, 21)], [0, 1, 0]);
  // shown again
  seen[5].visible = true; syncBatchedInstances(inst); inst.getMatrixAt(5, m);
  assert.ok(new THREE.Vector3().setFromMatrixScale(m).length() > 1);
});

test("a pick through the index hits the right instance and reports its view as the hit object", () => {
  const g = group40();
  g.updateMatrixWorld(true);
  buildLayerBatches(g);
  g.updateMatrixWorld(true);
  const list = []; eachPickTarget(g, (c) => list.push(c));
  assert.equal(list.length, 1, "the batch itself");
  const idx = buildPickIndex(list);
  assert.equal(idx.boxedCount, 40);
  const rc = new THREE.Raycaster(new THREE.Vector3(200, -5, 50), new THREE.Vector3(0, 0, -1));
  rc.layers.enable(PICK_ONLY_LAYER);
  const cand = queryPickIndex(idx, rc);
  assert.ok(cand.length >= 1 && cand.length < 40, `culled to ${cand.length}`);
  const hits = rc.intersectObjects(cand, false);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].object.userData.holeId, "H10");
  assert.equal(hits[0].object.parent, g);
  assert.equal(hits[0].object.instanceId, 10);
  // a hidden instance is still hit (three's raycast ignores visible) and says it is hidden, as a hidden member did
  eachLayerMember(g, (v) => { if (v.userData.holeId === "H10") v.visible = false; });
  const again = rc.intersectObjects(queryPickIndex(idx, rc), false);
  assert.equal(again[0].object.visible, false);
});

test("a stand-in's colour is copied on first read, so a repaint never reaches the shared parsed colour", () => {
  const a = new PickStandIn(PROTO_CYLINDER, { color: "#123456" }), b = new PickStandIn(PROTO_CYLINDER, { color: "#123456" });
  assert.equal(a.material.baseColor, b.material.baseColor, "shared until read");
  a.material.color.set("#ffffff");
  assert.equal(b.material.color.getHexString(), "123456");
  assert.equal(a._matrix, null, "no matrix until asked for");
  a.updateMatrix();
  assert.ok(a.matrix.isMatrix4);
});
