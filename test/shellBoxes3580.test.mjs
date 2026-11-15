// TASKS.csv #3580 (a) — a grade shell gridded over its drilled clusters, not one box round all of them (lib/viewer/shellBoxes.js).
// Pinned on the bundled Macpass sample (Ag > 29.8 g/t, search 80 m, pad 25 m, Min holes 2, IDW2, 2 m composites; no cut: the cut loses no
// composite since #3580's raise, groundNotBelow3580): at the default 200,000-block budget the single box is refitted to ~138 m cells and
// the boxes to ~29 m, and the shell holds far more of the composites at the cutoff.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drilledBoxes, mergeMeshes } from "../src/lib/viewer/shellBoxes.js";
import { parseTableText } from "../src/lib/tabular.js";
import { compositeDownhole } from "../src/lib/geochem.js";
import { excludeQAQC } from "../src/lib/qaqc.js";
import { samplePointsFromIntervals, estimateDenseGrid } from "../src/lib/estimation.js";
import { desurveyHole } from "../src/lib/desurvey.js";
import { samplesInsideShell } from "../src/lib/shellSupport.js";

const box = (x0, x1, y0, y1, z0, z1) => ({ xmin: x0, xmax: x1, ymin: y0, ymax: y1, zmin: z0, zmax: z1 });
const cloud = (cx, cy, n, id) => Array.from({ length: n }, (_, k) => ({ x: cx + (k % 5) * 10, y: cy + Math.floor(k / 5) * 10, z: -k, hole_id: `${id}${k % 3}` }));

test("drilledBoxes: clusters far apart get boxes of their own (each point in one); close or overlapping ones merge; no gain: the single box", () => {
  const pts = [...cloud(0, 0, 20, "A"), ...cloud(5000, 0, 20, "B"), ...cloud(0, 5000, 20, "C")];
  const whole = box(-25, 5065, -25, 5055, -44, 25);
  const b = drilledBoxes(pts, { bounds: whole, padM: 25, linkM: 160 });
  assert.equal(b.length, 3);
  assert.deepEqual(b.map((x) => x.idx.length), [20, 20, 20]);
  assert.equal(new Set(b.flatMap((x) => x.idx)).size, 60, "every point in exactly one box");
  assert.deepEqual(b.find((x) => x.idx.includes(0)).bounds, box(-25, 65, -25, 55, -44, 25));
  // two clusters 100 m apart: within the link, one box
  assert.equal(drilledBoxes([...cloud(0, 0, 20, "A"), ...cloud(140, 0, 20, "B")], { bounds: whole, padM: 25, linkM: 160 }).length, 1);
  // apart by more than the link, but their padded boxes overlap: merged (no node in two boxes)
  const ov = drilledBoxes([...cloud(0, 0, 20, "A"), ...cloud(210, 0, 20, "B")], { bounds: box(-100, 400, -100, 100, -50, 50), padM: 120, linkM: 160, maxShare: 1 });
  assert.equal(ov.length, 1);
  // boxes that would hold most of the single box: the single box
  const near = drilledBoxes([...cloud(0, 0, 20, "A"), ...cloud(300, 0, 20, "B")], { bounds: box(-25, 365, -25, 55, -44, 25), padM: 25, linkM: 160 });
  assert.equal(near.length, 1);
  assert.equal(near[0].idx.length, 40);
  assert.equal(drilledBoxes(pts, { bounds: whole, padM: 25, linkM: Infinity }).length, 1, "an unlimited search: one box");
});

test("mergeMeshes: vertices in order, faces offset, closing vertices summed, each grid's vertex range", () => {
  const m = mergeMeshes([{ vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faces: [[0, 1, 2]], closingVertices: 1 }, { vertices: [[5, 5, 5], [6, 5, 5], [5, 6, 5]], faces: [[0, 2, 1]], closingVertices: 2 }]);
  assert.deepEqual(m.faces, [[0, 1, 2], [3, 5, 4]]);
  assert.equal(m.vertices.length, 6);
  assert.equal(m.closingVertices, 3);
  assert.deepEqual(m.parts, [{ start: 0, end: 3, gi: 0 }, { start: 3, end: 6, gi: 1 }]);
});

test("Macpass, Ag > 29.8 g/t at the default 200,000-block budget: the drilled boxes' cells and the composites inside, against the single box", () => {
  const read = (f) => parseTableText(readFileSync(new URL(`../sample_data/yk_macpass/${f}.csv`, import.meta.url), "utf8")).rows;
  const collars = read("collars").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, length: +r.length }));
  const survey = read("survey").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip }));
  const assays = read("assays").filter((r) => String(r.Ag_ppm ?? "").trim() !== "" && Number.isFinite(+r.Ag_ppm)).map((r) => ({ hole_id: r.hole_id, from: +r.from, to: +r.to, values: { Ag: +r.Ag_ppm } }));
  const { points } = samplePointsFromIntervals(compositeDownhole(excludeQAQC(assays), "Ag", "ppm", { Ag: "ppm" }, { length: 2, minCoverage: 0.5 }), collars, survey, desurveyHole, "minimumCurvature");
  const R = 80, pad = 25, CUT = 29.8, BUDGET = 200000;
  const mm = (k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))];
  const [x0, x1] = mm("x"), [y0, y1] = mm("y"), [z0, z1] = mm("z");
  const whole = box(x0 - pad, x1 + pad, y0 - pad, y1 + pad, z0 - pad, z1 + pad);
  const boxes = drilledBoxes(points, { bounds: whole, padM: pad, linkM: 2 * Math.max(R, pad) });
  assert.equal(boxes.length, 21, "drilled areas");
  const nodes = (b, c) => [b.xmax - b.xmin, b.ymax - b.ymin, b.zmax - b.zmin].map((L) => Math.max(1, Math.round(L / c))).reduce((a, n) => a * n, 1);
  const fit = (list) => { let c = 10; while (list.reduce((s, b) => s + nodes(b, c), 0) > BUDGET) c = Math.ceil(c * 1.02 * 2) / 2; return c; };
  const cWhole = fit([whole]), cBoxes = fit(boxes.map((b) => b.bounds));
  assert.deepEqual([cWhole, cBoxes], [139, 27.5], "the budget's cell: the single box, the boxes");
  const run = (b, c) => estimateDenseGrid(points, { bounds: b, cellSize: { dx: c, dy: c, dz: c }, method: "idw2", searchRadius: R, minSamples: 1, maxSamples: 16, minHoles: 2, maxBlocks: 5e7 });
  const gw = run(whole, cWhole), sw = samplesInsideShell(points, gw, gw.values, CUT);
  const sb = { above: 0, inside: 0, outside: 0, noData: 0 };
  for (const b of boxes) { const g = run(b.bounds, cBoxes), r = samplesInsideShell(b.idx.map((k) => points[k]), g, g.values, CUT); for (const k in sb) sb[k] += r[k]; }
  assert.equal(sw.above, 1597);
  assert.equal(sb.above, 1597, "every composite counted once, in its own box");
  assert.deepEqual(sw, { above: 1597, inside: 318, outside: 1173, noData: 106 }, "the single box at 139 m");
  assert.deepEqual(sb, { above: 1597, inside: 1106, outside: 466, noData: 25 }, "the drilled boxes at 27.5 m");
});
