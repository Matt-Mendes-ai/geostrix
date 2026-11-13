// TASKS.csv #3045 (#2973's leftovers, review #2876) — Model from map on a 2 km map took the logged contacts of the whole 21 km field (and the
// model box grew to hold them), said its reach as '{m} m past its {n} contact point(s)' where the rule measures from the outline of the
// contacts in their best-fit plane, and kept the vertices the clips left unused in the stored mesh.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");

test("only the logged contacts of holes collared inside the map's area; the others counted and said", () => {
  assert.match(r, /const mapHoles = Number\.isFinite\(mbx0\) \? new Set\(\(collars \|\| \[\]\)\.filter\(/);
  assert.match(r, /if \(mapHoles && !mapHoles\.has\(c\.hole_id\)\) \{ holeOutside\+\+; continue; \}/);
  assert.ok(r.includes("logged contact(s) in holes collared outside the map's area were left out: the model stands on the map."));
  const p = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("{o} in holes outside it, which the run leaves out."));
});

test("the reach said as the rule applied; the unused vertices dropped after the clips; the count is the kept one", () => {
  assert.ok(r.includes("{label}: {m} m past the outline of its {n} contact point(s), measured in their best-fit plane"));
  const i = r.indexOf("const remap = new Int32Array(sceneVerts.length).fill(-1), kept = [];");
  assert.ok(i > r.indexOf("const c = clipMesh(sceneVerts, faces, above);") && i < r.indexOf("const fit = clipDomain ? null : contactFit("), "after the clips, before the mesh is built");
  assert.match(r, /vertexCount: sceneVerts\.length \/\* #3045/);
  // the compaction itself, on a clipped mesh: four vertices, one triangle kept
  let sceneVerts = [{ x: 0 }, { x: 1 }, { x: 2 }, { x: 3 }], faces = [[3, 1, 2]];
  const remap = new Int32Array(sceneVerts.length).fill(-1), kept = [];
  faces = faces.map((f) => f.map((k) => { if (remap[k] < 0) { remap[k] = kept.length; kept.push(sceneVerts[k]); } return remap[k]; }));
  sceneVerts = kept;
  assert.deepEqual(faces, [[0, 1, 2]]); assert.deepEqual(sceneVerts.map((v) => v.x), [3, 1, 2]);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(d["{label}: {m} m past the outline of its {n} contact point(s), measured in their best-fit plane"], l);
  }
});
