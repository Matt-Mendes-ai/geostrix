// TASKS.csv #4013 (Matt: "it should be straight planes ... sheeted planes"; "same thing for dykes and veins unless they are folded") —
// sheetedPlanes.js on made-up geometry: parallel sheets of one set, two sets, a plane fitted when nothing is measured, the fold test, and
// the flat mesh on a sheet's plane.
import test from "node:test";
import assert from "node:assert/strict";
import { sheetedPlanes, normalOf, attitudeOf, planeAngle, foldTest, planeMesh, sheetRegion, planeFrame, orientationSets } from "../src/lib/sheetedPlanes.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; }; // a fixed sequence, so the test is the same on every run
// points on the plane dipping `dip` towards `dd`, shifted `off` m along its normal, spread over `size` m in the plane
const onPlane = (dip, dd, off, n, size = 400, noise = 0) => {
  const { n: N, u, v } = planeFrame(normalOf(dip, dd));
  return Array.from({ length: n }, () => { const a = rnd() * size, b = rnd() * size, w = off + rnd() * noise; return { x: 1000 + u[0] * a + v[0] * b + N[0] * w, y: 2000 + u[1] * a + v[1] * b + N[1] * w, z: 500 + u[2] * a + v[2] * b + N[2] * w }; });
};
const jitter = (n, deg) => normalOf(attitudeOf(n).dip + rnd() * 2 * deg, attitudeOf(n).dipDir + rnd() * 2 * deg);

test("#4013 two parallel sheets 100 m apart: one set, two flat sheets, the normal refined from the points", () => {
  const truth = normalOf(60, 90);
  const pts = [...onPlane(60, 90, 0, 12), ...onPlane(60, 90, 100, 12)];
  const obs = pts.map((p, i) => ({ ...p, normal: i % 3 === 0 ? jitter(truth, 8) : undefined })); // a third of them measured, scattered by 8 degrees
  const r = sheetedPlanes(obs, { gapM: 25 });
  assert.equal(r.ok, true);
  assert.equal(r.sets.length, 1, "one orientation set");
  assert.equal(r.sets[0].sheets.length, 2, "two sheets");
  assert.ok(planeAngle(r.sets[0].normal, truth) < 0.5, `normal from the points: ${planeAngle(r.sets[0].normal, truth)} degrees off`);
  const [a, b] = r.sets[0].sheets;
  near(Math.abs(b.offset - a.offset), 100, 0.5, "the sheets' spacing");
  assert.ok(a.rms < 0.01 && b.rms < 0.01, "flat: the points lie on them");
  near(r.sets[0].dip, 60, 0.5, "dip"); near(r.sets[0].dipDir, 90, 0.5, "dip direction");
});

test("#4013 two orientation sets (conjugate) stay apart; a loose point goes to the nearest sheet", () => {
  const A = onPlane(60, 90, 0, 8).map((p) => ({ ...p, normal: normalOf(60, 90) }));
  const B = onPlane(60, 270, 0, 8).map((p) => ({ ...p, normal: normalOf(60, 270) }));
  const loose = { ...onPlane(60, 90, 2, 1)[0] };
  const r = sheetedPlanes([...A, ...B, loose], { gapM: 25 });
  assert.equal(r.sets.length, 2);
  assert.deepEqual(r.sets.map((s) => Math.round(s.dipDir)).sort((a, b) => a - b), [90, 270]);
  const withLoose = r.sets.flatMap((s) => s.sheets).find((sh) => sh.ids.includes(16));
  assert.ok(withLoose && planeAngle(withLoose.normal, normalOf(60, 90)) < 1, "the loose point joins the 60 -> 090 sheet");
  assert.equal(orientationSets([normalOf(30, 10), normalOf(32, 12), normalOf(80, 200)], 20).length, 2);
});

test("#4013 nothing measured: the plane through the points; a given dip wins; a line fits no plane", () => {
  const r = sheetedPlanes(onPlane(45, 135, 0, 20));
  assert.equal(r.sets[0].source, "fitted");
  near(r.sets[0].dip, 45, 0.5, "fitted dip"); near(r.sets[0].dipDir, 135, 0.5, "fitted dip direction");
  const g = sheetedPlanes(onPlane(45, 135, 0, 20), { normal: normalOf(70, 135) });
  assert.equal(g.sets[0].source, "given"); near(g.sets[0].dip, 70, 1e-6, "the given dip is kept");
  const line = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 0, z: 0 }));
  assert.equal(sheetedPlanes(line).ok, false);
  assert.equal(sheetedPlanes(line).why, "no-orientation");
});

test("#4013 the fold test: a folded sheet reads as folded, a flat one with scatter does not", () => {
  // a cylindrical fold: w = 0.002 * u^2 over +-200 m along strike (80 m of closure)
  const { n, u, v } = planeFrame(normalOf(60, 90));
  const fold = Array.from({ length: 30 }, () => { const a = rnd() * 400, b = rnd() * 400, w = 0.002 * a * a; return { x: u[0] * a + v[0] * b + n[0] * w, y: u[1] * a + v[1] * b + n[1] * w, z: u[2] * a + v[2] * b + n[2] * w }; });
  assert.equal(foldTest(fold, normalOf(60, 90)).folded, true);
  assert.equal(foldTest(onPlane(60, 90, 0, 30, 400, 4), normalOf(60, 90)).folded, false, "4 m of scatter on a flat sheet");
  assert.equal(foldTest(onPlane(60, 90, 0, 5), normalOf(60, 90)).judged, false, "too few points to judge");
});

test("#4013 the flat mesh: on the sheet's plane, the ellipse covers the points, keep() cuts it (the ground)", () => {
  const pts = onPlane(60, 90, 0, 20);
  const r = sheetedPlanes(pts), sh = r.sets[0].sheets[0];
  const reg = sheetRegion(sh, pts, "finite", { marginM: 50 });
  const m = planeMesh(sh.normal, sh.centroid, reg);
  for (let i = 0; i < m.positions.length; i += 3) near((m.positions[i] - sh.centroid.x) * sh.normal[0] + (m.positions[i + 1] - sh.centroid.y) * sh.normal[1] + (m.positions[i + 2] - sh.centroid.z) * sh.normal[2], 0, 1e-6, "every vertex on the plane");
  assert.ok(reg.b >= reg.a / 2, "down dip at least half the strike length");
  const cut = planeMesh(sh.normal, sh.centroid, reg, (p) => p.z <= 500);
  assert.ok(cut.indices.length > 0 && cut.indices.length < m.indices.length, "the part above z 500 is cut off");
  // the box's rectangle reaches every corner of the box
  const box = { x0: 500, x1: 1500, y0: 1500, y1: 2500, z0: 0, z1: 800 };
  const rect = sheetRegion(sh, pts, "box", { box });
  const { u: U, v: V } = planeFrame(sh.normal);
  for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) {
    const d = [x - sh.centroid.x, y - sh.centroid.y, z - sh.centroid.z], a = d[0] * U[0] + d[1] * U[1] + d[2] * U[2], b = d[0] * V[0] + d[1] * V[1] + d[2] * V[2];
    assert.ok(a >= rect.u0 - 1e-6 && a <= rect.u1 + 1e-6 && b >= rect.v0 - 1e-6 && b <= rect.v1 + 1e-6, "corner inside the rectangle");
  }
});
