// TASKS.csv #3098 (#2937, WA iron) — 'Hole labels' on 6,390 holes drew every label into atlas pages (1.7 s), though the declutter
// shows a few hundred at Fit. The hole labels are lazy: measured, not drawn, until the declutter shows them or a Layout capture needs them.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncHoleLabels, declutterHoleLabels, withEveryLabel, groupSharedCollars } from "../src/lib/viewer/holeLabels.js";

const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const camera = { matrixWorldInverse: { elements: I }, projectionMatrix: { elements: I }, zoom: 1 };
const filled = [];
const maker = () => { throw new Error("one at a time"); };
maker.many = () => { throw new Error("the eager batch"); };
maker.lazy = (texts) => texts.map((t) => ({ visible: true, userData: {}, material: { visible: false, map: null, userData: { labelAspect: 4, labelText: t } }, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } }));
maker.fill = (sprites) => { const todo = sprites.filter((s) => s.material.userData.labelText != null && !s.material.map); todo.forEach((s) => { s.material.map = {}; s.material.visible = true; filled.push(s.material.userData.labelText); }); return todo.length; };
const group = { visible: true, children: [], add(s) { this.children.push(s); } };
// A and B overlap on screen at this size; C is far off to the side
const anchors = [{ id: "A", x: 0, y: 0, z: 0, depth: 50 }, { id: "B", x: 2, y: 0, z: 0, depth: 60 }, { id: "C", x: 200, y: 0, z: 0, depth: 70 }];

test("lazy hole labels: none drawn on sync, only the shown ones after the declutter, all of them for a capture", () => {
  assert.equal(syncHoleLabels(group, anchors, "id", maker), 3);
  assert.equal(filled.length, 0, "nothing drawn when the labels are switched on");
  assert.ok(group.children.every((s) => s.material.visible === false), "an undrawn label is not rendered (no blank box)");
  declutterHoleLabels(group, camera, 2, 2, 16, 0); declutterHoleLabels(group, camera, 2, 2, 16, 200);
  assert.ok(group.children.every((s) => s.userData.tip && s.material.userData.labelText), "the text survives the sync setting each sprite's tip");
  const shown = group.children.filter((s) => s.visible).map((s) => s.material.userData.labelText);
  assert.ok(shown.length < 3, shown.join());
  assert.deepEqual(filled.sort(), shown.sort(), "drawn: exactly the labels the declutter shows");
  withEveryLabel(group, camera, 2, 2, () => {
    assert.ok(group.children.every((s) => s.visible && s.material.visible), "a Layout capture draws every label");
  });
  assert.equal(filled.length, 3);
});

test("wiring: makeTextSprite offers the lazy pair, and the drawn sprite becomes visible", () => {
  const s = fs.readFileSync(new URL("../src/lib/viewer/textSprite.js", import.meta.url), "utf8");
  assert.ok(s.includes("makeTextSprite.lazy = makeLazyTextSprites;") && s.includes("makeTextSprite.fill = fillTextSprites;"));
  assert.ok(s.includes("sp.material.visible = false;") && s.includes("m.visible = true; // #3098"));
  assert.ok(s.includes("makeTextSprites(todo.map((sp) => sp.material.userData.labelText), {}, todo);"), "drawn onto the sprites already in the scene");
  assert.ok(s.includes("sp.material.userData.labelText = text;") && !/sp\.userData\.labelText/.test(s), "the text is on the material, which the syncs leave alone");
});

test("the shared-collar grouping with integer cell keys groups 6,390 collars exactly as the string-key version did", () => {
  const ref = (anchors, tol = 1) => { // the #2208 version
    const cells = new Map(), groups = []; const cell = (v) => Math.floor(v / tol);
    for (const a of anchors) {
      const cx = cell(a.x), cy = cell(a.y), cz = cell(a.z); let home = null;
      for (let dx = -1; dx <= 1 && !home; dx++) for (let dy = -1; dy <= 1 && !home; dy++) for (let dz = -1; dz <= 1 && !home; dz++) for (const g of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) { const h = g[0]; if (Math.hypot(h.x - a.x, h.y - a.y, h.z - a.z) <= tol) { home = g; break; } }
      if (home) { home.push(a); continue; }
      const g = [a]; groups.push(g); const k = `${cx},${cy},${cz}`; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(g);
    }
    return groups;
  };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const A = [];
  for (let i = 0; i < 6390; i++) { const b = rnd() < 0.2 && A.length ? A[Math.floor(rnd() * A.length)] : null; A.push(b ? { id: `H${i}`, x: b.x + rnd() * 1.5 - 0.75, y: b.y + rnd() - 0.5, z: b.z + rnd() * 1.5 - 0.75 } : { id: `H${i}`, x: rnd() * 21600 - 10800, y: rnd() * 400 - 200, z: rnd() * 30000 - 15000 }); }
  const ids = (gs) => JSON.stringify(gs.map((g) => g.map((a) => a.id)));
  const got = groupSharedCollars(A);
  assert.ok(got.length < 6390 && got.some((g) => g.length > 1), "some fans");
  assert.equal(ids(got), ids(ref(A)));
});
