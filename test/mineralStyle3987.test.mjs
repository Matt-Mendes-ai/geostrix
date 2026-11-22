// TASKS.csv #3987 — every row of a Mineralization layer follows the layer style: a layer with interval rows draws all its rows as tubes (short and
// point rows as short tubes), its style is an interval style (shape, size, opacity, colour, Width by, the tube size choice), the light drawing's
// ribbons reach bent intervals too; a layer of points keeps its markers. Made-up rows (mixed lengths, several minerals, long and wide form).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mineralAsTubes, tubeSpan, hasDepths, MIN_TUBE_M } from "../src/lib/viewer/mineralDraw.js";
import { cleanLayerStyle, resolveLayerStyle } from "../src/lib/layerStyle.js";
import { widthScale, CODE_PREFIX } from "../src/lib/widthBy.js";

const R = (from, to, value, extra) => ({ hole_id: "DH-23-001", from, to, value, extra });
const longForm = [R(0, 3, "Py", 2), R(3, 3.2, "Cpy", 5), R(5, 5, "Sph", 1), R(6, 12, "Py", 8), R(6, 6.4, "Gal", 0.5)];
const wideForm = [{ hole_id: "DH-1", from: 0, to: 0.3, value: "CPY", extra: 6, MN_PY_pct: 2, MN_CPY_pct: 4 }, { hole_id: "DH-1", from: 1, to: 4, value: "PY", extra: 3, MN_PY_pct: 3, MN_CPY_pct: null }];
const scene = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");

test("#3987 a layer with interval rows draws every row as a tube (long and wide form); a points-only layer keeps markers", () => {
  assert.equal(mineralAsTubes(longForm), true);
  assert.equal(mineralAsTubes(wideForm), true);
  assert.equal(mineralAsTubes([R(1, 1, "Py", 2), R(4, 4.3, "Cpy", 1)]), false);
  assert.equal(mineralAsTubes([]), false);
  assert.ok(longForm.every(hasDepths), "every row of the mixed layer passes the tube filter");
  assert.deepEqual(tubeSpan(R(5, 5)), [4.5, 5.5]); // a point row: a 1 m tube on its depth
  assert.deepEqual(tubeSpan(R(3, 3.2)), [2.6, 3.6]);
  assert.deepEqual(tubeSpan(R(0.1, 0.1)), [0, MIN_TUBE_M]); // never above the collar
  assert.deepEqual(tubeSpan(R(6, 12)), [6, 12]); // a long row: its own depths
  assert.match(scene, /buildIntervalTube\("mnlgy", \{ filter: mnlgyTubes \? hasDepths : isIntervalRow, minLen: mnlgyTubes \? MIN_TUBE_M : 0,/);
  assert.match(scene, /if \(!mnlgyTubes\) buildPointMarkers\("mnlgy"/);
  assert.match(scene, /const \[f0, t0\] = opt\.minLen \? tubeSpan\(row, opt\.minLen\) : \[row\.from, row\.to\];/);
});

test("#3987 the style is an interval style: each setting kept and read for the tubes (shape, size, opacity, colour, Width by)", () => {
  const st = cleanLayerStyle({ shape: "square", size: 1.5, opacity: 0.6, color: "#336699", widthBy: CODE_PREFIX + "Py" }, "interval");
  assert.deepEqual(st, { shape: "square", size: 1.5, opacity: 0.6, color: "#336699", widthBy: CODE_PREFIX + "Py" });
  assert.deepEqual(resolveLayerStyle(st, "interval"), { size: 1.5, opacity: 0.6, shape: "square", color: "#336699" });
  assert.equal(cleanLayerStyle({ shape: "square" }, "point"), null, "saved as a point style the shape was dropped: the panel saves with the layer's kind now");
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /const k = key === "mnlgy" && mineralAsTubes\(layers\.mnlgy\) \? "interval" : LAYER_META\[key\]\?\.kind;/);
  assert.match(vm, /onStyle=\{\(p\) => setLayerStyle\(key, styleKindFor\(key\) \|\| "point", p\)\}/);
  // Width by reaches short rows too (they are tubes now): a Py point row gets its factor
  const ws = widthScale(longForm, { widthBy: CODE_PREFIX + "Py", widthFull: 8 });
  assert.ok(ws.w(longForm[0]) > ws.w(longForm[1]));
  assert.match(scene, /const rr = ws \? radius \* ws\.w\(row\) : radius;/);
});

test("#3987 the light drawing's ribbons and the per-layer tube size reach every tube of the layer", () => {
  assert.match(scene, /new PickStandIn\(intervalProto\(st\.shape, \(layers\?\.\[groupKey\] \|\| \[\]\)\.length\), \{ color, transparent/); // bent pieces: the count
  const tsc = fs.readFileSync(new URL("../src/modules/viewer/TubeSizeControl.jsx", import.meta.url), "utf8");
  assert.match(tsc, /k === "mnlgy" && mineralAsTubes\(store\.layers\?\.\[k\]\)/);
});
