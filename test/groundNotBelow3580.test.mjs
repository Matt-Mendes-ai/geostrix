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
  assert.match(s, /const gsGroundAt = gsLift \? gsLift\.at : groundAtInFrame\(gsGround\);/); // #3580 (b): one ground for the window's cut and the worker's columns
  assert.match(s, /groundCappedGrid\(g, numericCutoff, gsGroundAt, gsRealOf\)/);
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
  // #3551 (side 1) — with the collar file's hole type, its 80 UDDH collars (an adit's, under the hills) are left out of the collar surface, and on
  // Macpass that alone keeps every composite under it; a project without a hole-type column is the case the raise below still has to cover
  const typed = read("collars").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, attrs: { hole_type: r.hole_type } }));
  const withTypes = groundAtInFrame(modelGround(null, typed, survey).ground);
  assert.equal(hi.filter((p) => p.z > withTypes(p.x, p.y)).length, 0, "with hole types: none above the collar surface (#3551)");
  const ground = modelGround(null, collars, survey).ground;
  assert.equal(ground?.kind, "collars");
  const before = groundAtInFrame(ground);
  assert.equal(hi.filter((p) => p.z > before(p.x, p.y)).length, 47, "without hole types (the survey's upward / station check of #3551 only) the collar surface runs below 47 of them; 312 before #3551");
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

test("capFieldAtGround: the ground looked up once per column gives the per-node values and count exactly (Review: a 16 s freeze on Macpass)", () => {
  const nx = 23, ny = 17, nz = 11, values = new Float64Array(nx * ny * nz);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < values.length; i++) values[i] = rnd() < 0.2 ? NaN : rnd() * 100;
  const origin = { x: 1000.5, y: 2000.25, z: 300 }, spacing = { dx: 7.5, dy: 7.5, dz: 4 };
  let calls = 0;
  const groundAt = (x, y) => { calls++; return x > 1150 ? NaN : 330 + 0.1 * (x - 1000) - 0.05 * (y - 2000); };
  const col = capFieldAtGround(values, nx, ny, nz, origin, spacing, 40, groundAt);
  assert.equal(calls, nx * ny, "one lookup per column");
  const node = capFieldAtGround(values, nx, ny, nz, origin, spacing, 40, groundAt, { toReal: (p) => p }); // the per-node path
  assert.equal(col.capped, node.capped);
  assert.ok(col.capped > 0);
  assert.deepEqual(Array.from(col.values), Array.from(node.values));
});

test("sampleSpacing: from a sample, the nearest sample of another hole (own hole left out); fanned holes from one site read apart, as at the samples", async () => {
  const { sampleSpacing } = await import("../src/lib/sampleSpacing.js");
  // two vertical holes 30 m apart, 2 m samples: 30 m
  const holes = (dx) => [0, dx].flatMap((x, h) => Array.from({ length: 50 }, (_, k) => ({ hole_id: `H${h}`, x, y: 0, z: -2 * k })));
  assert.equal(Math.round(sampleSpacing(holes(30)).medianM), 30);
  // a fan from one collar (the collar sites say 0 m apart): the samples spread with depth
  const fan = [0, 1].flatMap((h) => Array.from({ length: 50 }, (_, k) => ({ hole_id: `F${h}`, x: (h ? 1 : -1) * 0.5 * 2 * k, y: 0, z: -2 * k })));
  const s = sampleSpacing(fan);
  assert.ok(s.medianM > 40 && s.medianM < 60, `the fan's median at the samples: ${s.medianM}`);
  assert.equal(sampleSpacing(holes(30).filter((p) => p.hole_id === "H0")), null, "one hole: no spacing");
  assert.equal(sampleSpacing(holes(400)), null, "no other hole within reach (250 m)");
});
