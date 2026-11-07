// TASKS.csv #1504 — holes coloured by a collar field: the scheme, the pass over built (and batched) collar markers and traces, the legend.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { holeColourScheme, applyHoleColours, holeColourLegendGroup, NO_VALUE_COLOUR, TRACE_GREY } from "../src/lib/viewer/holeColours.js";
import { buildLayerBatches } from "../src/lib/viewer/layerBatches.js";

const collars = Array.from({ length: 30 }, (_, i) => ({ hole_id: `H${i}`, x: i, y: 0, z: 0, attrs: i < 20 ? { drill_type: i % 2 ? "RC" : "DD", year: String(2020 + (i % 3)) } : {} }));

test("the scheme: one colour per value in natural order, (no value) grey and last", () => {
  const s = holeColourScheme(collars, "drill_type");
  assert.deepEqual(s.items.map(([v, , n]) => [v, n]), [["DD", 10], ["RC", 10], [null, 10]]);
  assert.notEqual(s.colourOf(collars[0]), s.colourOf(collars[1]));
  assert.equal(s.colourOf(collars[25]), NO_VALUE_COLOUR);
  assert.equal(holeColourScheme(collars, ""), null);
  assert.equal(holeColourScheme(collars, "nothing"), null);
  const g = holeColourLegendGroup(s, "Holes by drill_type", "(no value)");
  assert.deepEqual(g.items.map((r) => r[0]), ["DD (10)", "RC (10)", "(no value) (10)"]);
});

function scene() {
  const group = new THREE.Group(), shared = new THREE.MeshBasicMaterial({ color: 0xffffff }), proto = new THREE.SphereGeometry(1, 6, 6);
  proto.userData.protoKey = "sphere";
  for (const c of collars) {
    const m = new THREE.Mesh(proto, shared); m.userData = { collar: c }; m.position.set(c.x, 0, 0); group.add(m);
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x, 0, 0), new THREE.Vector3(c.x, -10, 0)]), new THREE.LineBasicMaterial({ color: TRACE_GREY, transparent: true, opacity: 0.5 }));
    l.userData = { holeId: c.hole_id }; group.add(l);
  }
  buildLayerBatches(group);
  return { group, shared };
}

test("batched collar markers each get their value's colour, the batch is re-synced, traces follow; clearing restores", () => {
  const { group, shared } = scene();
  const inst = group.children.find((c) => c.isInstancedMesh);
  const markers = inst.userData.batchMembers; // #1540: batched members leave group.children
  assert.ok(markers.length === 30 && markers.every((m) => m.userData.batched && m.userData.collar), "30 markers are drawn through one batch");
  assert.ok(!group.children.some((c) => c.userData?.collar));
  const s = holeColourScheme(collars, "drill_type");
  const byId = new Map(collars.map((c) => [c.hole_id, c]));
  assert.equal(applyHoleColours(group, s, { collarMaterial: shared, collarsById: byId }), 30);
  const col = new THREE.Color();
  inst.getColorAt(0, col); assert.equal("#" + col.getHexString(), s.colourOf(collars[0]).toLowerCase());
  inst.getColorAt(1, col); assert.equal("#" + col.getHexString(), s.colourOf(collars[1]).toLowerCase());
  inst.getColorAt(25, col); assert.equal("#" + col.getHexString(), NO_VALUE_COLOUR);
  const line1 = group.children.find((c) => c.isLine && c.userData.holeId === "H1");
  assert.equal("#" + line1.material.color.getHexString(), s.colourOf(collars[1]).toLowerCase());
  applyHoleColours(group, null, { collarMaterial: shared, collarsById: byId });
  inst.getColorAt(1, col); assert.equal(col.getHex(), 0xffffff, "back to the shared collar colour");
  assert.equal(line1.material.color.getHex(), TRACE_GREY);
  assert.equal(line1.material.opacity, 0.5);
  shared.color.setHex(0x112233); // a later background change still reaches every marker through the shared colour
  assert.equal(markers[3].material.color.getHex(), 0x112233);
});

test("wired: state, the pass after each rebuild, the legend and the select", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /holeColourScheme\(collars, holeColourBy\)/);
  assert.match(v, /applyHoleColours\(g, holeScheme, \{ collarMaterial: collarMaterialRef\.current/);
  assert.match(v, /\}, \[holeScheme, tracesSeq\]\)/);
  assert.match(v, /holeColourLegendGroup\(holeScheme, tr\("Holes by \{field\}"/);
  const h = readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8");
  assert.match(h, /aria-label=\{tr\("Colour holes by a collar field"\)\}/);
});
