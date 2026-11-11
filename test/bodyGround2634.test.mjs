// TASKS.csv #2634 (review #2486, WA lithium) — with no terrain the closed body of P topped at RL 288.3 over collars at RL 271.4 at most:
// 17 m of pegmatite in the air. The unit body and the alteration halo are now cut at the ground as the GemPy surfaces are (#2470): the
// terrain, or with none the collar surface. Found on the way: their grid is origin-relative (world minus the scene origin) and the
// terrain was looked up at those origin-relative x, y, which no terrain covers, so a body or a halo was never cut at all (#803 worked
// for grade shells only, whose grid is in world coordinates).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelGround, groundAtInFrame } from "../src/lib/modelGround.js";
import { capFieldAtGround } from "../src/lib/groundCap.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// nine surface collars at RL 260-280 on a 100 m grid
const collars = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) collars.push({ hole_id: `H${i}${j}`, x: 500000 + i * 100, y: 7000000 + j * 100, z: 260 + 10 * i, azimuth: 0, dip: 90, length: 80 }); // dip 90 = down (GeoStrix convention)
const survey = collars.map((c) => ({ hole_id: c.hole_id, depth: 0, azimuth: 0, dip: 90 }));

test("#2634: with no terrain the ground is the collar surface, inside the collars' footprint, in the grid's own frame", () => {
  const g = modelGround(null, collars, survey);
  assert.equal(g.kind, "collars");
  const o = { x: 500100, y: 7000100, z: 250 }; // a scene origin at the collars' centre, as ViewerModule sets it
  const atWorld = groundAtInFrame(g.ground), atApi = groundAtInFrame(g.ground, o);
  assert.ok(Math.abs(atWorld(500100, 7000100) - 270) < 1e-6);
  assert.ok(Math.abs(atApi(0, 0) - 20) < 1e-6, "origin-relative: 270 - 250");
  assert.ok(Number.isNaN(atApi(-500, 0)), "outside the footprint: no ground");
  assert.ok(Number.isNaN(atWorld(0, 0)), "world lookups at origin-relative coordinates find nothing (the old bug)");
  assert.equal(groundAtInFrame(null), null);
});

test("#2634: an origin-relative body grid is cut at the collar surface (it was not cut at all)", () => {
  const o = { x: 500100, y: 7000100, z: 250 };
  const g = modelGround(null, collars, survey).ground;
  // a 21 x 21 x 21 grid, 10 m cells, origin-relative, an indicator of 1 everywhere from RL 200 to 300 (inside), 0 elsewhere
  const nx = 21, ny = 21, nz = 21, origin = { x: -100, y: -100, z: -100 }, spacing = { x: 10, y: 10, z: 10 };
  const v = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const zReal = origin.z + k * 10 + o.z; v[i + nx * (j + ny * k)] = zReal >= 200 && zReal <= 300 ? 1 : 0; }
  const cut = capFieldAtGround(v, nx, ny, nz, origin, spacing, 0.5, groundAtInFrame(g, o));
  assert.ok(cut.capped > 0);
  // above the collar surface (RL 290 at the centre, ground 270) the node is now outside; below it (RL 250) still inside
  const node = (i, j, k) => cut.values[i + nx * (j + ny * k)];
  assert.ok(node(10, 10, 14) < 0.5, "RL 290 over a 270 m ground: cut");
  assert.ok(node(10, 10, 10) >= 0.5, "RL 250: kept");
  // the old lookup (world ground at origin-relative x, y) cut nothing
  const old = capFieldAtGround(v, nx, ny, nz, origin, spacing, 0.5, groundAtInFrame(g)); // a world ground at origin-relative x, y
  assert.equal(old.capped, 0);
});

test("#2634: the runs pass the ground in each grid's frame, and say when it was the collar surface", () => {
  const s = fs.readFileSync(path.join(root, "src", "modules", "viewer", "modellingRuns.js"), "utf8");
  assert.match(s, /groundCappedGrid\(grid, iso, groundAtInFrame\(altGround, o\)/); // unit body / halo: origin-relative
  assert.match(s, /groundCappedGrid\(grid, numericCutoff, groundAtInFrame\(gsGround\)/); // grade shell: world
  assert.doesNotMatch(s, /groundCappedGrid\([^)]*terrainForClipRef\.current/);
  assert.equal((s.match(/was cut at the collar surface: the ground interpolated between the \{n\} collars/g) || []).length, 2);
});

test("#2634: where the log is blank, an assay cut-off decides inside / outside; the unassayed blank metres are left to the #2531 rule", async () => {
  const { assayIndicatorInGaps } = await import("../src/lib/assayInGaps.js");
  const gaps = [{ hole_id: "A", from: 0, to: 20 }, { hole_id: "B", from: 5, to: 9 }, { hole_id: "C", from: 0, to: 4 }];
  const segs = [
    { hole_id: "A", from: 2, to: 6, value: 1.4 }, // inside (cut-off 1)
    { hole_id: "A", from: 6, to: 10, value: 0.3 }, // outside
    { hole_id: "A", from: 18, to: 24, value: 2 }, // inside, clipped to the gap: 18-20
    { hole_id: "B", from: 0, to: 30, value: 1 }, // exactly the cut-off: inside, 5-9
    { hole_id: "B", from: 30, to: 31, value: NaN }, // no value: ignored
  ];
  const r = assayIndicatorInGaps(gaps, segs, 1);
  assert.deepEqual(r.inside.map((q) => [q.hole_id, q.from, q.to]), [["A", 2, 6], ["A", 18, 20], ["B", 5, 9]]);
  assert.deepEqual(r.outside.map((q) => [q.hole_id, q.from, q.to]), [["A", 6, 10]]);
  assert.deepEqual(r.rest.map((q) => [q.hole_id, q.from, q.to]), [["A", 0, 2], ["A", 10, 18], ["C", 0, 4]]);
  assert.equal(r.insideM, 10); assert.equal(r.outsideM, 4); assert.equal(r.holes, 2);
  assert.deepEqual(assayIndicatorInGaps([], segs, 1).inside, []);
});

test("#2634: the closed-body run and its pane carry the assay cut-off (no default cut-off)", () => {
  const s = fs.readFileSync(path.join(root, "src", "modules", "viewer", "modellingRuns.js"), "utf8");
  const pane = fs.readFileSync(path.join(root, "src", "components", "ModellingCodesPane.jsx"), "utf8");
  const panes = fs.readFileSync(path.join(root, "src", "modules", "viewer", "ModellingPanes.jsx"), "utf8");
  assert.match(s, /assayIndicatorInGaps\(un\.rows, resolvedSegments\(excludeQAQC\(assays\), aSym/);
  assert.match(s, /if \(bodyOpts\.unloggedOutside\) \(ai \? ai\.rest : un\.rows\)/);
  assert.match(pane, /aria-label=\{tr\("Element that decides where the log is blank"\)\}/);
  assert.match(pane, /value=\{unitBody\.assayCutoff \?\? ""\} placeholder=\{tr\("cut-off"\)\}/);
  assert.match(panes, /assayElements=\{assayElements\} \/\* #2634 \*\//);
  assert.match(panes, /useState\(\{ iso: 0\.5, largest: false, search: 0, cell: 0 \}\)/, "no assay element or cut-off by default");
});
