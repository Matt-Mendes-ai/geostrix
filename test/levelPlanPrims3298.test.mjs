// TASKS.csv #3298 (#3191: layerPrimitivesFor ~0.44 s of a Level plan open on WA iron's 6,390 holes, shared with sections) — the primitives
// are kept for the last few (inputs, holes, scope), and the plan's own cache is keyed on the primitives' inputs (a version), not on the
// function the 3D View makes anew on every render (any re-render between two RL steps rebuilt them).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const b = fs.readFileSync(new URL("../src/modules/viewer/levelPlanBuild.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the cache: every input the primitives read, the holes as a set, the scope; callers get fresh arrays", () => {
  const deps = v.match(/const primsDeps = \(\) => \[([^\]]+)\];/)[1].split(",").map((x) => x.trim());
  for (const k of ["layers", "layerVisible", "isRowVisible", "numericLayerColor", "effectiveColor", "effectiveLabel", "assayVisible", "assayDisplayElements", "assayStyle", "assays", "assayElements", "assayRowShown", "customLayers", "customVisible", "layerStyles"]) assert.ok(deps.includes(k), k);
  // every name the build reads from the component is in the list (the rest are imports or module constants)
  const body = v.slice(v.indexOf("const buildLayerPrimitives = (holeIds, scope) => {"), v.indexOf("// TASKS.csv #759 — the last model's units on this section"));
  for (const k of ["layers", "layerVisible", "isRowVisible", "numericLayerColor", "effectiveColor", "effectiveLabel", "assayVisible", "assayDisplayElements", "assayStyle", "assays", "assayElements", "assayRowShown", "customLayers", "customVisible", "layerStyles"]) assert.ok(new RegExp(`\\b${k}\\b`).test(body), `${k} is read`);
  assert.match(v, /c\.holes\.size === holeIds\.size && c\.deps\.every\(\(d, i\) => d === deps\[i\]\) && \[\.\.\.holeIds\]\.every\(\(h\) => c\.holes\.has\(h\)\)/);
  assert.match(v, /return \{ intervals: \[\.\.\.hit\.out\.intervals\], points: \[\.\.\.hit\.out\.points\] \};/, "a section empties and refills its arrays: never the cached ones");
  assert.match(v, /\.slice\(0, 4\);/);
});

test("the plan's cache follows the primitives' version", () => {
  assert.match(v, /const primsVersion = \(\) => \{ const d = primsDeps\(\), r = primsVerRef\.current; if \(!r\.deps \|\| !d\.every\(\(x, i\) => x === r\.deps\[i\]\)\) \{ r\.deps = d; r\.v\+\+; \} return r\.v; \};/);
  assert.match(v, /layerPrimitivesFor, primsVersion: primsVersion\(\) \/\* #3298 \*\/, cache: planCacheRef,/);
  assert.match(b, /const fn = ctx\.primsVersion \?\? ctx\.layerPrimitivesFor;/);
});
