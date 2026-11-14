// TASKS.csv #3097 (the rest of #2937) — a desurvey switch that moves a few holes patches the layer groups they have rows in (their rows
// retired from the compact batches, only those holes built again) instead of rebuilding every interval of the layer.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { PickStandIn } from "../src/lib/viewer/pickStandIn.js";
import { buildLayerBatches, eachLayerMember } from "../src/lib/viewer/layerBatches.js";
import { PROTO_CYLINDER } from "../src/lib/viewer/protos.js";

const scene = await import("../src/modules/viewer/drillholeScene.js").catch((e) => ({ err: e }));
const skip = scene.err ? `drillholeScene needs three in this runner: ${scene.err.message}` : false;

function layerGroup(holes = 10, per = 30) {
  const g = new THREE.Group();
  for (let h = 0; h < holes; h++) for (let k = 0; k < per; k++) {
    const s = new PickStandIn(PROTO_CYLINDER, { color: "#cc8833" });
    s.position.set(h * 10, -k, 0); s.scale.set(1.6, 1, 1.6);
    s.userData = { holeId: `H${h}`, catValue: "BIF", row: { k } };
    g.add(s);
  }
  buildLayerBatches(g);
  return g;
}

test("the moved holes' rows are retired from the compact batch: a zero matrix, never shown again, their userData gone", { skip }, () => {
  const { retireHoles, RETIRED_ROW } = scene;
  const g = layerGroup();
  const inst = g.children[0], cp = inst.userData.compact;
  assert.ok(cp && cp.rows.length === 300);
  assert.equal(retireHoles(g, new Set(["H2"])), true);
  const idx = cp.rows.map((r, i) => (r === RETIRED_ROW ? i : -1)).filter((i) => i >= 0);
  assert.equal(idx.length, 30);
  for (const i of idx) for (let k = 0; k < 16; k++) assert.equal(inst.instanceMatrix.array[i * 16 + k], 0);
  // a visibility pass that shows everything does not bring a retired row back: its base matrix is zero
  eachLayerMember(g, (m) => { m.visible = true; });
  for (const i of idx) assert.equal(cp.base[i * 16], 0);
  let live = 0; eachLayerMember(g, (m) => { if (m.userData.holeId) live++; });
  assert.equal(live, 270);
  assert.equal(g.userData.retired, 30);
});

test("plain members of a moved hole are removed; a batch of real meshes, a member without a hole, or too much retired: rebuilt whole", { skip }, () => {
  const { retireHoles, PATCH_MAX_RETIRED } = scene;
  const g = layerGroup(10, 30);
  const curved = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); curved.userData = { holeId: "H3" }; g.add(curved);
  assert.equal(retireHoles(g, new Set(["H3"])), true);
  assert.ok(!g.children.includes(curved));
  const odd = layerGroup(); const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()); m.userData = {}; odd.add(m);
  assert.equal(retireHoles(odd, new Set(["H1"])), false, "a member without a hole id");
  const real = new THREE.Group(); for (let i = 0; i < 30; i++) { const x = new THREE.Mesh(PROTO_CYLINDER, new THREE.MeshLambertMaterial()); x.userData = { holeId: "H0" }; real.add(x); } buildLayerBatches(real);
  assert.equal(retireHoles(real, new Set(["H0"])), false, "a batch of real meshes");
  const many = layerGroup(4, 30); // 120 rows: one hole is 25 %, two are 50 %
  assert.equal(retireHoles(many, new Set(["H0", "H1"])), false, `over ${PATCH_MAX_RETIRED * 100} % retired`);
  const often = layerGroup(100, 30); // 16 holes of 100: 16 % retired, under the quarter
  for (let i = 0; i < scene.PATCH_MAX_TIMES; i++) assert.equal(retireHoles(often, new Set([`H${i}`])), true);
  assert.equal(retireHoles(often, new Set(["H30"])), false, "after PATCH_MAX_TIMES patches the group is rebuilt whole (each patch adds a batch)");
});

test("wiring: a desurvey-only change patches the groups it can; they are not cleared, build their moved holes only, keep their hole sets", () => {
  const s = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.match(s, /if \(!full && plan\.shift && plan\.shift\.moved === changedHoles\.size && changedHoles\.size <= PATCH_MAX_HOLES\) \{/);
  assert.match(s, /\[\.\.\.rebuild\]\.filter\(\(k\) => !patched\.has\(k\)\)\.map\(groupOf\)/);
  assert.match(s, /patched\.has\(k\) \? groupByHole\(\(rows \|\| \[\]\)\.filter\(\(r\) => patchHoles\(k\)\.has\(r\.hole_id\)\)\)/); // #3053: a row patch's holes, else the moved holes
  assert.match(s, /const patchHoles = \(k\) => rowPatchHoles\.get\(k\) \|\| changedHoles;/);
  assert.match(s, /holeSets\.set\(k, rebuild\.has\(k\) && !patched\.has\(k\) \?/);
  assert.match(s, /g\.userData\.retired = 0; g\.userData\.patches = 0; \/\* #3097 \*\//);
});
