// TASKS.csv #3844 (Scottie Gold surface geology review) — the vein and shear symbols were hidden under the rock samples they were measured on (the sample sphere is ~18 m across on screen, the
// strike symbol 5 m), and the vein colour was a pale cream on a light background. The symbols are drawn after the samples, with no depth test; the vein colour reads. Synthetic only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { syncSurfaceStructures } from "../src/lib/viewer/sceneBuilders.js";
import { drawSymbolsOnTop, DRAW_ORDER } from "../src/lib/viewer/drawOrder.js";
import { STRUCTURE_CLASS_COLORS } from "../src/lib/mapLayers.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };

test("#3844 the strike symbols are drawn after the samples with no depth test; the picking discs are left alone", () => {
  const group = new THREE.Group(), cache = {};
  const sets = [{ id: "s1", name: "Outcrop", size: 5, rows: [{ x: 10, y: 10, z: 100, dip: 81, dipDir: 3, strike: 273, type: "Vein", cls: "vein" }, { x: 40, y: 10, z: 100, dip: 40, dipDir: 210, type: "Shear", cls: "fault" }] }];
  syncSurfaceStructures(group, cache, sets, { origin: { x: 0, y: 0, z: 0 } });
  const g = cache.s1; assert.ok(g);
  drawSymbolsOnTop(group);
  const drawn = [], pick = [];
  group.traverse((o) => { if (!o.material) return; (o.isInstancedMesh ? pick : drawn).push(o); });
  assert.equal(pick.length, 1); assert.ok(drawn.length >= 2, "the symbol's lines and filled parts");
  for (const o of drawn) { assert.equal(o.renderOrder, DRAW_ORDER.structures); assert.equal(o.material.depthTest, false); assert.equal(o.material.transparent, true); assert.equal(o.material.opacity, 1); }
  assert.equal(pick[0].material.depthTest, true); assert.equal(pick[0].renderOrder, 0); // the picking discs: untouched
  assert.ok(DRAW_ORDER.structures > DRAW_ORDER.mapPoints - 1 && DRAW_ORDER.structures > DRAW_ORDER.collars);
  drawSymbolsOnTop(null); // no group: nothing happens
});

test("#3844 the vein colour is no longer a pale cream; wired after the symbols are rebuilt", () => {
  assert.ok(lum(STRUCTURE_CLASS_COLORS.vein) < 0.6, STRUCTURE_CLASS_COLORS.vein); // the cream #e8dfc4 was 0.87
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /syncSurfaceStructures\(surfStructGroupRef\.current, [^;]*; drawSymbolsOnTop\(surfStructGroupRef\.current\);/);
  assert.match(v, /import \{ drawSymbolsOnTop \} from "\.\.\/lib\/viewer\/drawOrder\.js";/);
  assert.ok(Buffer.byteLength(v) <= 735000, "ViewerModule stays under its cap");
});
