// TASKS.csv #3580 (b) — the grade shell's cut, iso-surface and counts in the worker (lib/viewer/shellPost.js): the same mesh and the same numbers
// as the window's own steps (capFieldAtGround, marchingCubes, samplesInsideShell, farFromSamples, sumInsideShell), on a Macpass box.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shellPost, groundColumns, meshOfPost } from "../src/lib/viewer/shellPost.js";
import { parseTableText } from "../src/lib/tabular.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";
import { samplePointsFromIntervals, estimateDenseGrid } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { marchingCubes } from "../src/lib/marchingCubes.js";
import { capFieldAtGround, sumInsideShell } from "../src/lib/groundCap.js";
import { samplesInsideShell } from "../src/lib/shellSupport.js";
import { farFromSamples } from "../src/lib/haloSupport.js";
import { modelGround, groundAtInFrame } from "../src/lib/modelGround.js";
import { groundNotBelowSamples } from "../src/lib/groundNotBelowSamples.js";

test("Macpass Tom West, Zn >= 2 %: the worker's post-process equals the window's steps (mesh, cut, inside, beyond, mean, support)", async () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const collars = read("collars").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length, attrs: { hole_type: r.hole_type }, prospect: r.prospect }));
  const survey = read("survey").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip }));
  const tw = new Set(collars.filter((c) => c.prospect === "Tom West").map((c) => c.hole_id));
  const assays = read("assays").filter((r) => tw.has(r.hole_id) && String(r.Zn_pct ?? "").trim() !== "" && Number.isFinite(+r.Zn_pct)).map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Zn: +r.Zn_pct } }));
  const { points } = samplePointsFromIntervals(compositeDownhole(excludeQAQC(assays), "Zn", "%", { Zn: "%" }, { length: 2, minCoverage: 0.5 }), collars, survey, desurveyHole, "minimumCurvature");
  const mm = (k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))];
  const [x0, x1] = mm("x"), [y0, y1] = mm("y"), [z0, z1] = mm("z"), pad = 25, iso = 2, cell = { dx: 13, dy: 13, dz: 13 };
  const bounds = { xmin: x0 - pad, xmax: x1 + pad, ymin: y0 - pad, ymax: y1 + pad, zmin: z0 - pad, zmax: z1 + pad };
  const grid = estimateDenseGrid(points, { bounds, cellSize: cell, method: "idw2", searchRadius: 60, minSamples: 1, maxSamples: 16, minHoles: 2, maxBlocks: 5e7, support: true });
  const groundAt = groundNotBelowSamples(groundAtInFrame(modelGround(null, collars, survey).ground), points, { reachM: 13, marginM: 13 }).at;
  const hi = points.filter((p) => p.value >= iso);
  // the window's steps
  const cut = capFieldAtGround(grid.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, iso, groundAt);
  const mc = marchingCubes(cut.values, grid.nx, grid.ny, grid.nz, iso, { origin: grid.origin, spacing: grid.cellSize, noData: "outside" });
  const inShell = samplesInsideShell(hi, grid, cut.values, iso), far = farFromSamples(cut.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, iso, points, 23, {}), mean = sumInsideShell(grid.values, cut.values, iso);
  // the worker's
  const G = await groundColumns(groundAt, bounds, cell, { pause: () => null });
  const post = shellPost(grid, { iso, closeOutside: true, ground: G, inShellPoints: hi, farPoints: points, farDist: 23 });
  const m2 = meshOfPost(post);
  assert.ok(mc.faces.length > 1000, `a real shell: ${mc.faces.length} faces`);
  assert.equal(post.capped, cut.capped);
  assert.deepEqual(m2.faces, mc.faces);
  assert.deepEqual(m2.vertices, mc.vertices, "the same vertices, to the last digit (Float64)");
  assert.equal(post.closingVertices, mc.closingVertices);
  assert.deepEqual(post.inShell, inShell);
  assert.deepEqual(post.far, { inside: far.inside, far: far.far });
  assert.deepEqual([post.sum, post.n], [mean.sum, mean.n]);
  assert.equal(post.vertexSupport.length, mc.vertices.length);
  assert.ok([...post.vertexSupport].every((c) => c <= 2));
});

test("wiring: the worker runs it after a dense estimate that asks; the run sends it without a trend or log values", () => {
  const w = readFileSync(new URL("../src/lib/estimation.worker.js", import.meta.url), "utf8");
  assert.match(w, /if \(opts\.post\) \{ \/\/ #3580 \(b\): the mesh and the counts go back, not the grid/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const workerPost = !anisotropy\.enabled && !logInfo;/);
  assert.match(r, /const posts = grids\.map\(\(g\) => g\.post \|\| null\), viaWorker = posts\.every\(Boolean\);/);
});
