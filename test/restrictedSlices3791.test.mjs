// TASKS.csv #3791 — a block estimate restricted to a shell froze the window ~0.8 s at the end (the blocks outside the solid dropped in one pass of the
// inside test) and ~0.2 s at the start (the solid's self-intersection check, run again for every estimate). SYNTHETIC.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterSliced, trimLike, trimLikeSliced } from "../src/lib/estimateSet.js";
import { validateSolid, validateSolidCached } from "../src/lib/meshValidate.js";

const cells = Array.from({ length: 5000 }, (_, i) => ({ x: i % 100, y: (i / 100) | 0, z: i % 7, value: i }));

test("filterSliced keeps exactly what one pass keeps, in order, and yields between slices", async () => {
  let pauses = 0, t = 0;
  const pause = () => { if (++t % 10) return null; pauses++; return Promise.resolve(); }; // due every 10th call
  const keep = (c) => c.x % 3 === 0;
  const got = await filterSliced(cells, keep, { pause });
  assert.deepEqual(got, cells.filter(keep));
  assert.ok(pauses > 5, `paused ${pauses} times`);
  assert.deepEqual(await filterSliced([], keep), []);
});

test("a cancel during the filter stops it", async () => {
  const ac = new AbortController();
  let n = 0;
  await assert.rejects(filterSliced(cells, () => true, { pause: () => { if (++n === 3) ac.abort(); return Promise.resolve(); }, signal: ac.signal }), (e) => e.cancelled === true);
});

test("trimLikeSliced is trimLike: the shell, the area and the ground", async () => {
  const o = { inShell: (c) => c.value % 2 === 0, inArea: (x) => x < 60, groundAt: (x, y) => (y > 30 ? 3 : NaN) };
  assert.deepEqual(await trimLikeSliced(cells, o), trimLike(cells, o));
  assert.deepEqual(await trimLikeSliced(cells, {}), trimLike(cells, {}));
});

test("the solid's check is kept for the session per solid, and is the same answer", () => {
  // a tetrahedron
  const pos = Float32Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]), idx = Uint32Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]);
  const a = validateSolidCached(pos, idx), b = validateSolidCached(pos, idx);
  assert.equal(a, b, "the same object the second time");
  assert.deepEqual(a, validateSolid(pos, idx));
  const pos2 = Float32Array.from(pos); assert.notEqual(validateSolidCached(pos2, idx), a, "other arrays: checked again");
});

test("wiring: the estimate's trims run in slices and the check is the cached one", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /est\.cells = await filterSliced\(est\.cells, \(c\) => inShell\(c\), \{ signal: ac\.signal \}\); \/\/ #3791/);
  assert.match(m, /const t = await trimLikeSliced\(me\.cells, \{ inShell: msh \? msh\.inShell : inShell, inArea, groundAt: cutGround \}, \{ signal: ac\.signal \}\);/);
  assert.match(m, /const vs = await validateSolidAsync\(sh\.positions, sh\.indices\); \/\/ #3791/);
  assert.match(readFileSync(new URL("../src/components/SurfaceSolidsPanel.jsx", import.meta.url), "utf8"), /validateSolidCached\(m\.positions, m\.indices\)/);
});

test("the async check (no worker in Node): the same answer, kept per solid, and the cache is shared with the sync one", async () => {
  const { validateSolidAsync } = await import("../src/lib/solidValidateClient.js");
  const pos = Float32Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]), idx = Uint32Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]);
  const a = await validateSolidAsync(pos, idx);
  assert.deepEqual(a, validateSolid(pos, idx));
  assert.equal(await validateSolidAsync(pos, idx), a);
  assert.equal(validateSolidCached(pos, idx), a, "the Solids panel's check reads the same answer");
});

test("the faster check is the same check: a closed tetrahedron, two that interpenetrate, one with a face missing", () => {
  const tet = (d) => ({ pos: [d, d, d, d + 10, d, d, d, d + 10, d, d, d, d + 10], idx: [0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2] });
  const one = tet(0), r = validateSolid(Float32Array.from(one.pos), Uint32Array.from(one.idx));
  assert.equal(r.selfIntersectingPairs, 0); assert.equal(r.openEdges, 0); assert.equal(r.windingConflicts, 0); assert.equal(r.nonManifoldEdges, 0); assert.equal(r.triangles, 4);
  const two = tet(2), pos = Float32Array.from([...one.pos, ...two.pos]), idx = Uint32Array.from([...one.idx, ...two.idx.map((i) => i + 4)]);
  assert.ok(validateSolid(pos, idx).selfIntersectingPairs > 0, "the faces of the second cross the first's");
  assert.equal(validateSolid(pos, idx).openEdges, 0);
  assert.ok(validateSolid(Float32Array.from(one.pos), Uint32Array.from(one.idx.slice(3))).openEdges > 0);
});
