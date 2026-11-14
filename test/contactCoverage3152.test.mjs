// TASKS.csv #3152 — the fit line of a cut surface counted every contact, though some had no mesh above or below them after the cuts. A contact
// is covered when a kept triangle lies over or under it in plan (scene frame: y up, plan = x, z); the run fits over those and says which cut
// removed the surface over the rest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coveredInPlan, contactCoverage } from "../src/lib/contactCoverage.js";

// a 10 x 10 grid of quads (two triangles each) over x, z in [0, 100]
const grid = (keep = () => true) => {
  const verts = [], faces = [];
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) verts.push([i * 10, 5, j * 10]);
  const at = (i, j) => i * 11 + j;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (keep(i, j)) { faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)]); faces.push([at(i, j), at(i + 1, j + 1), at(i, j + 1)]); }
  return { verts, faces };
};

test("coveredInPlan: a point under or over a triangle, whatever its height; outside the mesh, not", () => {
  const { verts, faces } = grid();
  const pts = [[50, -200, 50], [5, 900, 5], [0, 0, 0], [100, 0, 100], [101, 0, 50], [-1, 0, 50], [50, 0, 150]];
  assert.deepEqual([...coveredInPlan(pts, verts, faces)], [1, 1, 1, 1, 0, 0, 0]);
  // object vertices too ({ x, y, z })
  assert.deepEqual([...coveredInPlan([[50, 0, 50]], verts.map(([x, y, z]) => ({ x, y, z })), faces)], [1]);
  assert.deepEqual([...coveredInPlan([[50, 0, 50]], verts, [])], [0]);
});

test("contactCoverage: the contacts left uncovered, and the cut that removed the mesh over each", () => {
  const all = grid();
  const afterReach = grid((i) => i < 8); // the reach cut removed x > 80
  const afterGround = grid((i, j) => i < 8 && j < 6); // then the ground cut removed z > 60
  const pts = [[30, 0, 30], [90, 0, 30], [30, 0, 80], [50, 0, 150]]; // covered; reach; ground; never
  const r = contactCoverage(pts, afterGround.verts, afterGround.faces, [{ cut: "ground", ...afterReach }, { cut: "reach", ...all }]);
  assert.deepEqual([...r.covered], [1, 0, 0, 0]);
  assert.equal(r.left, 3);
  assert.deepEqual(r.byCut, { ground: 1, reach: 1 });
  assert.equal(r.never, 1);
  // everything covered: nothing to say
  const ok = contactCoverage([[30, 0, 30]], afterGround.verts, afterGround.faces, []);
  assert.equal(ok.left, 0); assert.deepEqual(ok.byCut, {});
});

test("wiring: the fit over the covered contacts, the left-out notice; keys", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /const preReach = \{ verts: sceneVerts, faces \};/);
  assert.match(m, /const preGround = \{ verts: sceneVerts, faces \};/);
  assert.match(m, /\.\.\.\(cover\?\.left \? \{ contactsWithoutSurface: \{ left: cover\.left, of: contactPts\.length, byCut: cover\.byCut, never: cover\.never \} \} : \{\}\)/);
  assert.match(m, /const fit = clipDomain \? null : contactFit\(cover\?\.left \? contactPts\.filter\(\(_, i\) => cover\.covered\[i\]\) : contactPts,/);
  assert.match(m, /notice\("\\"\{label\}\\": \{k\} of its \{n\} contact point\(s\) have no surface above or below them \(\{why\}\); its fit is measured over the other \{m\}\."/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of ["{n} where the part of it above the ground was cut away", "{n} past its contacts' outline", "{n} where the model's surface never ran", "\"{label}\": {k} of its {n} contact point(s) have no surface above or below them ({why}); its fit is measured over the other {m}."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
