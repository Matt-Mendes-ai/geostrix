// TASKS.csv #3580 (Matt, 2026-11-15) — "where min is present the grade shell doesn't model it". On the bundled Macpass sample with no terrain,
// the Ag > 29.8 g/t shell was cut at the collar surface (#2634), which ran up to 189 m below the composites: 311 of the 1,595 at or above the
// cutoff lay above it, and the cut took them for air. The collar surface is now raised over the samples (lib/groundNotBelowSamples.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groundNotBelowSamples } from "../src/lib/groundNotBelowSamples.js";
import { parseTableText } from "../src/lib/tabular.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";
import { samplePointsFromIntervals, estimateDenseGrid } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { modelGround, groundAtInFrame } from "../src/lib/modelGround.js";
import { capFieldAtGround } from "../src/lib/groundCap.js";
import { samplesInsideShell } from "../src/lib/shellSupport.js";

test("groundNotBelowSamples: raised to a margin over the samples within reach, unchanged elsewhere; NaN (no cut) stays NaN", () => {
  const flat = (x, y) => (x < 1000 ? 100 : NaN);
  const { at, lifted } = groundNotBelowSamples(flat, [{ x: 50, y: 50, z: 150 }, { x: 60, y: 50, z: 90 }, { x: 2000, y: 0, z: 500 }], { reachM: 10, marginM: 10 });
  assert.equal(lifted, 1, "one sample above the collar surface (the one outside it has no ground)");
  assert.equal(at(50, 50), 160);
  assert.equal(at(55, 45), 160, "within reach in plan");
  assert.equal(at(500, 500), 100, "far from every sample: the collar surface");
  assert.ok(Number.isNaN(at(2000, 0)), "outside the collars' footprint: still no cut");
  assert.equal(groundNotBelowSamples(flat, [{ x: 50, y: 50, z: 20 }], { reachM: 10, marginM: 10 }).at(50, 50), 100, "a sample well below the ground leaves it");
  assert.equal(groundNotBelowSamples(null, [], { reachM: 10, marginM: 10 }).at, null);
});

test("wiring: the grade shell and the alteration envelope raise the collar surface over their samples (never a terrain)", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const gsLift = gsGround\?\.kind === "collars" \? \(await import\("\.\.\/\.\.\/lib\/groundNotBelowSamples\.js"\)\)\.groundNotBelowSamples\(groundAtInFrame\(gsGround\), points, /);
  assert.match(s, /groundCappedGrid\(grid, numericCutoff, gsLift \? gsLift\.at : groundAtInFrame\(gsGround\), gsRealOf\)/);
  assert.match(s, /const altLift = altGround\?\.kind === "collars" \? \(await import\("\.\.\/\.\.\/lib\/groundNotBelowSamples\.js"\)\)\.groundNotBelowSamples\(groundAtInFrame\(altGround, o\), pts, /);
  assert.match(s, /groundCappedGrid\(grid, iso, altLift \? altLift\.at : groundAtInFrame\(altGround, o\), /);
  assert.match(s, /level: inShell\.inside \* 2 < inShell\.above \? "error" : "info"/, "a shell missing most of its composites says so in an error notice");
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /checked=\{clipToTopo && \(!!terrain \|\| \(collars \|\| \[\]\)\.length >= 3\)\} disabled=\{!terrain && \(collars \|\| \[\]\)\.length < 3\}[^\n]*tr\("End the shell at the collar surface \(no terrain is loaded\)"\)/, "the pane's box says the run cuts at the collar surface");
});

test("Macpass, Ag > 29.8 g/t (the bundled sample, no terrain): no composite at or above the cutoff is cut off as air", () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const collars = read("collars").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length }));
  const survey = read("survey").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip })); // stored below horizontal (#339)
  const assays = read("assays").filter((r) => String(r.Ag_ppm ?? "").trim() !== "" && Number.isFinite(+r.Ag_ppm)).map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Ag: +r.Ag_ppm } }));
  const iv = compositeDownhole(excludeQAQC(assays), "Ag", "ppm", { Ag: "ppm" }, { length: 2, minCoverage: 0.5 });
  const { points } = samplePointsFromIntervals(iv, collars, survey, desurveyHole, "minimumCurvature");
  const hi = points.filter((p) => p.value >= 29.8);
  assert.equal(hi.length, 1597, "composites at/above the cutoff (the app, through its import, counts 1,595)");
  const ground = modelGround(null, collars, survey).ground;
  assert.equal(ground?.kind, "collars");
  const before = groundAtInFrame(ground);
  assert.equal(hi.filter((p) => p.z > before(p.x, p.y)).length, 312, "the collar surface ran below 312 of them (311 of the 1,595 the app counts)");
  const cell = 95; // the run's 47.5 m cells, doubled to keep the test quick
  const lift = groundNotBelowSamples(before, points, { reachM: cell, marginM: cell });
  assert.equal(hi.filter((p) => !(lift.at(p.x, p.y) >= p.z + cell)).length, 0, "now a cell below the ground, every one");
  // the shell itself: the cut no longer takes any composite out of it (inside after the cut = inside of the uncut field)
  const pad = 25, mm = (k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))];
  const [x0, x1] = mm("x"), [y0, y1] = mm("y"), [z0, z1] = mm("z");
  const g = estimateDenseGrid(points, { bounds: { xmin: x0 - pad, xmax: x1 + pad, ymin: y0 - pad, ymax: y1 + pad, zmin: z0 - pad, zmax: z1 + pad }, cellSize: { dx: cell, dy: cell, dz: cell }, method: "idw2", searchRadius: 120, minSamples: 1, maxSamples: 16, minHoles: 2, maxBlocks: 5e7 });
  const inside = (v) => samplesInsideShell(points, g, v, 29.8).inside;
  const cutOld = capFieldAtGround(g.values, g.nx, g.ny, g.nz, g.origin, g.cellSize, 29.8, before).values;
  const cutNew = capFieldAtGround(g.values, g.nx, g.ny, g.nz, g.origin, g.cellSize, 29.8, lift.at).values;
  const uncut = inside(g.values), was = inside(cutOld), now = inside(cutNew);
  assert.ok(was < uncut, `the old cut lost composites (${was} of ${uncut})`);
  assert.equal(now, uncut, "the raised cut loses none");
});
