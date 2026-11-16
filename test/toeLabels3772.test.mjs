// TASKS.csv #3772 — on fans from a pad the 3D View could name a hole only at its collar: five unlabelled lines after the callout. 'Hole ID at the toe'
// (and 'at both ends') name each hole where the fan has opened out, as the Section window already does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncHoleLabels, holeLabelText } from "../src/lib/viewer/holeLabels.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sprite = (text) => ({ text, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, userData: {} });
const group = () => ({ children: [], add(c) { this.children.push(c); } });
// a pad: three holes from one collar fanning out to toes 100 m apart
const anchors = [["A", 100], ["B", 0], ["C", -100]].map(([id, tx]) => ({ id, x: 0, y: 0, z: 0, zWorld: 800, depth: 300, tx, ty: -200, tz: 0 }));

test("toe mode: one label per hole at its toe, the id alone", () => {
  const g = group();
  syncHoleLabels(g, anchors, "hole_id_toe", sprite);
  assert.deepEqual(g.children.map((s) => s.text).sort(), ["A", "B", "C"]);
  const a = g.children.find((s) => s.text === "A");
  assert.equal(a.position.x, 100); assert.equal(a.position.z, 0); assert.ok(a.position.y > -200); // above its toe
  assert.equal(g.children.find((s) => s.text === "C").position.x, -100);
});

test("both ends: the collar's label and each toe's", () => {
  const g = group();
  syncHoleLabels(g, anchors, "hole_id_both", sprite);
  assert.equal(g.children.length, 4); // the pad's one collar label ('A +2') and three toes
  assert.ok(g.children.some((s) => /^A \+2$/.test(s.text)));
  assert.deepEqual(g.children.filter((s) => !/\+/.test(s.text)).map((s) => s.text).sort(), ["A", "B", "C"]);
});

test("the other modes are as they were, and a collar-end anchor with no toe draws no toe label", () => {
  const g = group();
  syncHoleLabels(g, anchors, "hole_id", sprite);
  assert.equal(g.children.length, 1); assert.equal(g.children[0].text, "A +2");
  assert.equal(holeLabelText(anchors[0], "hole_id_depth"), "A (300m)");
  const g2 = group(); syncHoleLabels(g2, [{ id: "Z", x: 1, y: 2, z: 3, zWorld: 5, depth: 1 }], "hole_id_toe", sprite);
  assert.equal(g2.children.length, 0);
  const g3 = group(); syncHoleLabels(g3, anchors, "none", sprite); assert.equal(g3.children.length, 0);
});

test("wired: the scene records each hole's toe on its label anchor", () => {
  assert.match(read("../src/modules/viewer/drillholeScene.js"), /tx: pts\[pts\.length - 1\]\.x, ty: pts\[pts\.length - 1\]\.y, tz: pts\[pts\.length - 1\]\.z/);
});
