// TASKS.csv #817 (part 2) — mapped contacts and dip guides as hard lines of an explicit surface
import test from "node:test";
import assert from "node:assert/strict";
import { mapContactPairs, mapContactLines, dipGuideLines } from "../src/lib/explicitMapLines.js";
import { explicitPoints, fitExplicitSurface } from "../src/lib/explicitSurface.js";

// a contact dipping 30° north, z = 1300 - tan30 * (y - 1500), against undulating ground (as in pileOrder817): its map
// trace is where the two meet, found by bisection for each x
const ground = (x, y) => 1300 - 0.05 * (y - 1500) + 60 * Math.sin(x / 150);
const plane = (y) => 1300 - Math.tan(Math.PI / 6) * (y - 1500);
const edge = Array.from({ length: 151 }, (_, i) => {
  const x = i * 20;
  let lo = 0, hi = 3000;
  for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (ground(x, m) - plane(m) > 0) hi = m; else lo = m; }
  return [x, (lo + hi) / 2];
});
const layer = { features: [
  { attributes: { u: "Lower" }, parts: [[[0, 0], [3000, 0], ...edge.slice().reverse(), [0, 0]]] },
  { attributes: { u: "Upper" }, parts: [[...edge, [3000, 3000], [0, 3000], edge[0]]] },
] };

test("#817 the mapped contact between two units, draped on the terrain", () => {
  const pairs = mapContactPairs(layer, "u");
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].units, ["Lower", "Upper"]);
  const r = mapContactLines(layer, "u", ["Upper", "Lower"], ground, { step: 25 }); // either order
  assert.ok(r.lines.length >= 1 && r.offTerrain === 0);
  const pts = r.lines.flatMap((l) => l.pts);
  assert.ok(pts.length > 100, `${pts.length} points`);
  for (const p of pts) {
    assert.ok(Math.abs(p.z - ground(p.x, p.y)) < 1e-9, "on the ground");
    assert.ok(Math.abs(p.z - plane(p.y)) < 3, "on the contact plane (the trace is where ground and plane meet)");
  }
  for (const l of r.lines) for (let i = 1; i < l.pts.length; i++) assert.ok(Math.hypot(l.pts[i].x - l.pts[i - 1].x, l.pts[i].y - l.pts[i - 1].y) <= 25 + 1e-6);
  // beyond the terrain the line breaks and the points are counted
  const half = mapContactLines(layer, "u", ["Lower", "Upper"], (x, y) => (x > 1500 ? NaN : ground(x, y)));
  assert.ok(half.offTerrain > 0 && half.lines.flatMap((l) => l.pts).every((p) => p.x <= 1500));
  assert.equal(mapContactLines(layer, "u", ["Lower", "Nope"], ground).lines.length, 0);
});

test("#817 dip guide: from a measurement, else from the trace's own plane", () => {
  const { lines } = mapContactLines(layer, "u", ["Lower", "Upper"], ground);
  // a measurement 45° N near every point: each guide point is 100 m lower and 100 m further north
  const meas = [{ x: 1500, y: 1500, dip: 45, dipDir: 0 }];
  const g = dipGuideLines(lines, { measurements: meas, depthM: 100, radiusM: 5000 });
  assert.equal(g.fitted, 0);
  assert.equal(g.measured, lines.reduce((s, l) => s + l.pts.length, 0));
  const a = lines[0].pts[3], b = g.lines[0].pts[3];
  assert.ok(Math.abs(b.x - a.x) < 1e-9 && Math.abs(b.y - a.y - 100) < 1e-6 && Math.abs(b.z - a.z + 100) < 1e-9);
  assert.equal(g.lines[0].src, "guide");
  // no measurement in reach: the plane fitted to the trace (30° N) - the guide lands on the true contact plane
  const f = dipGuideLines(lines, { measurements: meas, depthM: 150, radiusM: 10 });
  assert.ok(f.fitted > 0 && f.measured === 0);
  for (const l of f.lines) for (const p of l.pts) assert.ok(Math.abs(p.z - plane(p.y)) < 8, `guide off the plane by ${(p.z - plane(p.y)).toFixed(1)} m`);
  // a near-flat measurement gives no guide (it would land kilometres away)
  const flat = dipGuideLines(lines, { measurements: [{ x: 1500, y: 1500, dip: 3, dipDir: 0 }], radiusM: 5000 });
  assert.equal(flat.lines.length, 0);
  assert.ok(flat.skipped > 0);
});

test("#817 the explicit surface through a mapped contact and its dip guide follows the dipping contact", () => {
  const { lines } = mapContactLines(layer, "u", ["Lower", "Upper"], ground);
  const g = dipGuideLines(lines, { depthM: 200 }); // the trace's own dip
  const ep = explicitPoints({ name: "Top of Lower", picks: [] }, [], { maxPoints: 800, extraLines: [...lines, ...g.lines] });
  assert.ok(ep.points.length <= 800, `${ep.points.length} points`);
  assert.ok(ep.mapLines >= 1 && ep.guideLines >= 1 && ep.lines === 0);
  const res = fitExplicitSurface(ep.points, { resolution: 40 });
  assert.ok(res.residualMax < 0.01);
  // between the trace and the guide the surface should be near the true plane
  let worst = 0, n = 0;
  for (let i = 0; i < res.positions.length; i += 3) {
    const [x, y, z] = [res.positions[i], res.positions[i + 1], res.positions[i + 2]];
    if (x < 300 || x > 2700 || y < 1550 || y > 1750) continue;
    worst = Math.max(worst, Math.abs(z - plane(y))); n++;
  }
  assert.ok(n > 10 && worst < 15, `${n} nodes, worst ${worst.toFixed(1)} m`);
});

test("#817 map lines over the point budget are thinned, not dropped", () => {
  const long = [{ ref: "A | B", src: "map", pts: Array.from({ length: 2000 }, (_, i) => ({ x: i * 25, y: 0, z: 100 + Math.sin(i / 30) * 20 })) }];
  const ep = explicitPoints({ name: "S", picks: [{ id: "p", x: 10, y: 500, z: 50 }] }, [], { maxPoints: 800, extraLines: long });
  // #869 — simplified (Douglas-Peucker, smallest tolerance that fits) rather than every k-th point
  assert.ok(ep.points.length <= 800 && ep.extraTolM > 0 && ep.extraEvery > 1, `${ep.points.length} / tol ${ep.extraTolM}`);
  assert.deepEqual(ep.points.at(-1), { x: 1999 * 25, y: 0, z: long[0].pts[1999].z, src: "map", ref: "A | B" }, "the line's end is kept");
});
