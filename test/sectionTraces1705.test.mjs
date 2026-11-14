// TASKS.csv #1705 — saved sections' traces ('lines in 3D') are screen-space lines of a fixed pixel width (Line2 / LineMaterial),
// not world-width ribbons that perspective blew up into ~25 px bars over the holes when zoomed in.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";

// makeTextSprite draws its label on a canvas: a minimal 2D context is enough here
globalThis.document = globalThis.document || {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ measureText: (t) => ({ width: String(t).length * 10 }), fillText() {}, fillRect() {}, clearRect() {}, strokeText() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, set font(v) {}, set fillStyle(v) {}, set textBaseline(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set textAlign(v) {} }) }),
};
const { buildSectionTraces, clearSectionTraces, TRACE_STROKES, FENCE_STROKES } = await import("../src/lib/viewer/sectionTraces.js");

const origin = { x: 1000, y: 2000, z: 100 };
const collars = [{ z: 300 }, { z: 310 }, { z: 1400 }]; // the median, 310, not the outlier

test("a section's trace and its end ticks are Line2 lines with a width in pixels, whatever the section's length", () => {
  for (const L of [100, 5000]) {
    const g = new THREE.Group();
    buildSectionTraces(g, [{ name: "S1", ax: 1000, ay: 2000, bx: 1000 + L, by: 2000, azimuth: 0 }], { origin, terrain: null, collars });
    const lines = g.children.filter((c) => c.isLine2);
    assert.equal(lines.length, 2 * 3); // halo + ink, for the trace and both end ticks
    assert.deepEqual([...new Set(lines.map((l) => l.material.linewidth))].sort(), TRACE_STROKES.map((s) => s[0]).sort());
    for (const l of lines) { assert.equal(l.material.depthTest, false); assert.equal(l.material.worldUnits, false); } // screen pixels
    assert.equal(g.children.filter((c) => c.isMesh && !c.isLine2).length, 0, "no world-width ribbons left");
    assert.equal(g.userData.labels.children.filter((c) => c.isSprite).length, 2); // S1 and S1′ (#3246: in their own group, decluttered)
    // flat 2 m over the median collar elevation, in the scene frame (y = Z - oz)
    const pos = lines[0].geometry.attributes.instanceStart.data.array;
    assert.equal(pos[1], 310 + 2 - origin.z);
  }
});

test("the resolution follows the renderer at draw time (a print-resolution capture keeps the proportions)", () => {
  const g = new THREE.Group();
  buildSectionTraces(g, [{ name: "S1", ax: 1000, ay: 2000, bx: 1500, by: 2000 }], { origin, terrain: null, collars });
  const l = g.children.find((c) => c.isLine2);
  l.onBeforeRender({ getSize: (v) => v.set(3000, 2000) });
  assert.deepEqual([l.material.resolution.x, l.material.resolution.y], [3000, 2000]);
});

test("a fence's lines are one thin line each; clearing disposes everything", () => {
  const g = new THREE.Group();
  const fence = [0, 50, 100].map((d, i) => ({ name: `Fence ${i + 1}/3 ${1000 + d}E (az 0°)`, ax: 1000 + d, ay: 2000, bx: 1000 + d, by: 2600 })); // lib/sectionDefs.js fenceLabels names
  buildSectionTraces(g, fence, { origin, terrain: null, collars });
  const lines = g.children.filter((c) => c.isLine2);
  assert.deepEqual([...new Set(lines.map((l) => l.material.linewidth))], [FENCE_STROKES[0][0]]); // one thin line, no halo
  assert.equal(lines.length, 3 * 2); // each fence line + one tick at A (labelled), no B tick
  assert.equal(g.userData.labels.children.filter((c) => c.isSprite).length, 3);
  const labels = g.userData.labels;
  clearSectionTraces(g);
  assert.equal(g.children.length, 0);
  assert.equal(labels.children.length, 0, "#3246 — the label group's sprites go too");
  assert.equal(g.userData.labels, null);
  buildSectionTraces(g, [], { origin, terrain: null, collars });
  assert.equal(g.children.length, 0);
  assert.equal(FENCE_STROKES.length, 1);
});

test("wiring: ViewerModule loads the traces on first use and keeps the #1980 guard", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(v.includes("const group = sectionLinesGroupRef.current;\n    if (!group || buildDefer.skip()) return; // #1980"));
  assert.match(v, /import\("\.\.\/lib\/viewer\/sectionTraces\.js"\)\.then\(\(m\) => \{ if \(live\) \{ m\.buildSectionTraces\(group, want \? sections : \[\]/);
  assert.ok(!/width \* 2\.6/.test(v), "the ribbon code is gone from ViewerModule");
  // #3246 — the end labels sized and decluttered each frame like the hole labels
  assert.match(v, /const sl = sectionLinesGroupRef\.current\?\.userData\.labels; if \(sl\?\.children\.length\) \{ fitScreenLabels\(sl, camera, mount\.clientHeight\); declutterHoleLabels\(sl, camera, mount\.clientWidth, mount\.clientHeight\); \}/);
});
