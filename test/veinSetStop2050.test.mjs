// TASKS.csv #2050 (review #2013, 3D Modelling) — a code that behaves like a vein SET (Woodjam's qtz: 10.7 intercepts per hole, midpoints
// 87.8 m RMS off one plane) still added a hangingwall / footwall pair; it now adds nothing and says why.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the vein-set check runs before the first wall is stamped and returns", () => {
  const gate = r.indexOf("if ((pl.rmsOffPlane != null && pl.rmsOffPlane > 10 * Math.max(th.trueMean || 0, 0.5)) || setPerHole > 2.5) {");
  const fw = r.indexOf('const fwSurf = stamp(model.footwall, "footwall"');
  assert.ok(gate > 0 && fw > gate);
  assert.match(r.slice(gate, fw), /no surface, solid or volume was made[\s\S]*return;\s*\}/);
});
test("the busy state is reset in a finally, so the early stop leaves the pane usable", () => {
  assert.match(r, /\} finally \{ \/\/ #2050 — also after the early stop below\s*setTaskProgress\?\.\(null\);\s*setVeinBusy\(false\);/);
});
test("the halo takes the Vein log as its source: a vein set as an envelope", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /altSource\.layer === "vein" \? storeLayers\.vein \|\| \[\]/);
  assert.match(p, /<option value="vein">\{tr\("Veins \(a vein set as an envelope\)"\)\}<\/option>/);
  assert.match(r, /sourceKey = isCode \? "litho" : source\?\.layer === "vein" \? "vein" : "alt";/);
});
