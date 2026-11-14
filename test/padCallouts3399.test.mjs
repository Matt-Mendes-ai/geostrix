// TASKS.csv #3399 (Matt: 'also draw callouts in the 3d view where more than 1 drill hole is located'; Orion_2026's 'OR-26-01 +2') — a pad of
// several holes gets a callout listing each hole (its colour-by swatch when the holes are coloured by a collar field); a single hole keeps
// its plain label; the callout's whole box takes part in the declutter.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { syncHoleLabels, labelBoxes, labelsToShow } from "../src/lib/viewer/holeLabels.js";

const anchors = [
  { id: "OR-26-01", x: 0, y: 0, z: 0, zWorld: 400, depth: 300 }, { id: "OR-26-02", x: 0.3, y: 0, z: 0.2, zWorld: 400, depth: 250 },
  { id: "OR-26-03", x: 0.5, y: 0, z: -0.4, zWorld: 400, depth: 410.5 }, { id: "OR-26-04", x: 80, y: 0, z: 0, zWorld: 398, depth: 200 },
];
function maker() {
  const calls = { plain: [], callouts: [] };
  const sprite = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial()); s.material.userData.labelAspect = 3; return s; };
  const make = (t) => { calls.plain.push([t]); return sprite(); };
  make.many = (texts) => { calls.plain.push(texts); return texts.map(sprite); };
  make.callout = (lines) => { calls.callouts.push(lines); const s = sprite(); s.center.set(0, 0); s.material.userData.labelAspect = 2; s.material.userData.labelLines = 3.5; return s; };
  return { make, calls };
}

test("a pad gets one callout listing each hole in order; the single hole its plain label; tips list the pad's holes", () => {
  const g = new THREE.Group(), { make, calls } = maker();
  assert.equal(syncHoleLabels(g, anchors, "hole_id", make), 2);
  assert.deepEqual(calls.callouts, [[{ text: "OR-26-01", colour: null }, { text: "OR-26-02", colour: null }, { text: "OR-26-03", colour: null }]]);
  assert.deepEqual(calls.plain, [["OR-26-04"]]);
  assert.equal(g.children[0].userData.tip, "OR-26-01\nOR-26-02\nOR-26-03");
  assert.equal(g.children[0].userData.pad, 3);
  assert.deepEqual(g.children[0].position.toArray(), [0, 1, 0], "the leader's foot on the collar marker");
  assert.deepEqual(g.children[1].position.toArray(), [80, 6, 0], "a single hole's label where it was");
});

test("the label mode and the colour-by swatches go into the callout's lines (group.userData.colourOf, set by the 3D View)", () => {
  const g = new THREE.Group(), { make, calls } = maker();
  g.userData.colourOf = (id) => (id === "OR-26-02" ? "#e69f00" : "#56b4e9");
  syncHoleLabels(g, anchors, "hole_id_depth", make);
  assert.deepEqual(calls.callouts[0], [{ text: "OR-26-01 (300m)", colour: "#56b4e9" }, { text: "OR-26-02 (250m)", colour: "#e69f00" }, { text: "OR-26-03 (410.5m)", colour: "#56b4e9" }]);
});

test("a maker with no callout keeps #2208's 'id +n' label", () => {
  const g = new THREE.Group(), texts = [];
  const make = (t) => { texts.push(t); return new THREE.Sprite(new THREE.SpriteMaterial()); };
  syncHoleLabels(g, anchors, "hole_id", make);
  assert.deepEqual(texts, ["OR-26-01 +2", "OR-26-04"]);
});

test("the declutter sees a callout's whole box, up and to the right of its corner; a plain label as before", () => {
  const g = new THREE.Group(), { make } = maker();
  syncHoleLabels(g, anchors, "hole_id", make);
  const cam = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
  cam.up.set(0, 0, -1); cam.position.set(0, 500, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const [box, plain] = labelBoxes(g, cam, 200, 200);
  assert.deepEqual([box.w, box.h], [16 * 3.5 * 2, 16 * 3.5]);
  const corner = g.children[0].position.clone().project(cam);
  assert.ok(Math.abs(box.x - (corner.x * 100 + box.w / 2)) < 1e-6 && Math.abs(box.y - (corner.y * 100 + box.h / 2)) < 1e-6, "centred half a box right of and above its corner");
  assert.deepEqual([plain.w, plain.h], [48, 16]);
  assert.deepEqual(labelsToShow([box, plain]), [true, false], "OR-26-04's label, 80 px right of the pad, falls under the 112 px callout: hidden, as an overlap");
});

test("wiring: the callout sprite and its screen size; the 3D View passes the colours and re-syncs on a colour-by change", () => {
  const t = fs.readFileSync(new URL("../src/lib/viewer/textSprite.js", import.meta.url), "utf8");
  assert.match(t, /makeTextSprite\.callout = makeCalloutSprite;/);
  assert.match(t, /material\.userData\.labelLines = canvas\.height \/ LABEL_H;/);
  assert.match(t, /const a = sp\.material\?\.userData\?\.labelAspect, L = sp\.material\?\.userData\?\.labelLines \|\| 1;[^\n]*\n\s+if \(a\) sp\.scale\.set\(s \* a \* L, s \* L, 1\);/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /if \(g\) g\.userData\.colourOf = byId \? \(id\) => holeScheme\.colourOf\(byId\.get\(String\(id\)\)\) : null;/);
  assert.match(v, /\}, \[holeLabelMode, holeScheme\]\);/);
});
