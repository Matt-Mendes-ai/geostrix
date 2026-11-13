// TASKS.csv #2801 (split from #2633) — Import solid and Generated surfaces say meshValidate's other checks (bow-tie vertices, triangles with
// no area, unused and repeated vertices, with 'weld' for the last), in the wording Solid blocks from surfaces uses.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defectList, defectSentence, sumDefects } from "../src/lib/viewer/solidDefects.js";
import { meshDefects } from "../src/lib/meshValidate.js";

test("the wording: each defect once, 'weld' for repeated vertices, nothing for a clean mesh", () => {
  const d = { nonManifoldVertices: 1, degenerateTriangles: 2, isolatedVertices: 0, coincidentVertices: 3 };
  assert.deepEqual(defectList(d), ["1 vertex where two parts touch at a point (a bow-tie)", "2 triangle(s) with no area", "3 vertex(es) repeated at the same place: weld them (to 1 mm) and the seams they open close"]);
  assert.match(defectSentence(d), /^Checked as a solid: 1 vertex where .*; 2 triangle\(s\) with no area; 3 vertex\(es\) repeated .*\. Its volume and the inside test can be off there\.$/);
  assert.equal(defectSentence({ nonManifoldVertices: 0, degenerateTriangles: 0, isolatedVertices: 0, coincidentVertices: 0 }), "");
  assert.deepEqual(defectList(null), []);
});

test("an imported solid's parts add up; a real unwelded tetrahedron is caught by meshDefects", () => {
  assert.deepEqual(sumDefects([{ defects: { coincidentVertices: 2, degenerateTriangles: 1 } }, { defects: { coincidentVertices: 1, isolatedVertices: 4 } }, {}]), { nonManifoldVertices: 0, degenerateTriangles: 1, isolatedVertices: 4, coincidentVertices: 3 });
  // a tetrahedron written triangle by triangle (no shared vertices): 12 positions, 8 of them repeats of earlier ones
  const P = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], T = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]];
  const pos = new Float64Array(T.flatMap((t) => t.flatMap((i) => P[i]))), idx = Uint32Array.from({ length: 12 }, (_, i) => i);
  const d = meshDefects(pos, idx);
  assert.equal(d.coincidentVertices, 8);
  assert.match(defectSentence(d), /8 vertex\(es\) repeated at the same place: weld them/);
});

test("wiring: the import worker checks each part; the notice, the expanded surface and Surface Solids use the shared wording", () => {
  const wk = fs.readFileSync(new URL("../src/lib/solidImport.worker.js", import.meta.url), "utf8");
  assert.match(wk, /p\.defects = meshDefects\(p\.positions, p\.indices\);/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /defectSentence\(sumDefects\(solid\.parts\)\) \? ` \$\{defectSentence\(sumDefects\(solid\.parts\)\)\}` : ""\)\]\); \/\/ defects: #2801/);
  assert.match(v, /import\("\.\.\/lib\/meshValidate\.js"\)\.then\(\(\{ meshDefects \}\) =>/);
  assert.match(v, /\{defectSentence\(expandedDefects\) && <div role="note"/); // open or closed: repeated vertices explain an 'open' solid
  assert.match(v, /\(g\.index \? g\.index\.count : g\.attributes\.position\.count\) > 1\.5e6\) return undefined;/, "500,000 triangles at most");
  assert.ok(!/^import [^\n]*meshValidate/m.test(v), "meshValidate stays out of the startup bundle");
  assert.match(fs.readFileSync(new URL("../src/components/SurfaceSolidsPanel.jsx", import.meta.url), "utf8"), /const defects = v && !broken \? defectList\(v\) : \[\];/);
});
