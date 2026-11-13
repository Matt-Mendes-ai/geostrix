// TASKS.csv #3119 (from #3085, WA iron) — the main-thread work of a stack run around its solve: the collar ground's four nearest from a
// k-d tree (the block cut and the surface cut), the pick checks' pairs from a cell bucket, the block cut once when there is no trend, and
// one mesh query per new surface for the fold check and the order check. Each gives the answer it gave before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwGround } from "../src/lib/pitShell.js";
import { pickReport } from "../src/lib/pickDiagnostics.js";

let seed = 11;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// drilling in clusters over a wide box (the case the cell buckets were slow on), with exact ties: collars on a 25 m grid
function clustered() {
  const pts = [];
  for (let c = 0; c < 30; c++) {
    const cx = 800000 + rnd() * 20000, cy = 7500000 + rnd() * 17000;
    for (let k = 0; k < 60; k++) pts.push({ x: cx + Math.round((rnd() - 0.5) * 16) * 25, y: cy + Math.round((rnd() - 0.5) * 16) * 25, z: 400 + rnd() * 60 });
  }
  return pts;
}
// the sorted answer: a stable sort, so equal distances go to the earlier point
function brute(pts) {
  return (x, y) => {
    const near = pts.map((c) => [(c.x - x) ** 2 + (c.y - y) ** 2, c.z]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    if (near[0][0] < 1e-12) return near[0][1];
    let w = 0, s = 0;
    for (const [d2, z] of near) { const k = 1 / d2; w += k; s += k * z; }
    return s / w;
  };
}

test("the collar ground's k-d tree gives the sorted answer: clustered collars, ties, inside and far outside the box, on a collar", () => {
  const pts = clustered(), fast = idwGround(pts), slow = brute(pts);
  for (let k = 0; k < 3000; k++) {
    const x = 795000 + rnd() * 30000, y = 7495000 + rnd() * 27000;
    assert.ok(Math.abs(fast(x, y) - slow(x, y)) < 1e-9, `at ${x}, ${y}`);
  }
  // on the 25 m lattice of a cluster: four collars at the same distance, more than four tied
  const c = pts[0];
  for (const [dx, dy] of [[12.5, 12.5], [0, 12.5], [12.5, 0], [0, 0]]) assert.ok(Math.abs(fast(c.x + dx, c.y + dy) - slow(c.x + dx, c.y + dy)) < 1e-9);
  assert.equal(fast(c.x, c.y), slow(c.x, c.y));
  // few points, one line, one point, repeated points
  for (const set of [pts.slice(0, 3), Array.from({ length: 20 }, (_, i) => ({ x: i * 50, y: 0, z: i })), [{ x: 1, y: 2, z: 3 }], [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }, { x: 10, y: 0, z: 3 }, { x: 0, y: 0, z: 4 }, { x: 5, y: 5, z: 5 }]]) {
    const f = idwGround(set), b = brute(set);
    for (const [x, y] of [[0, 0], [3, 4], [420, 300], [-1000, 50]]) assert.ok(Math.abs(f(x, y) - b(x, y)) < 1e-9, `${set.length} points at ${x}, ${y}`);
  }
  assert.equal(idwGround([]), null);
});

// the checks as they were: every pair
function duplicateLoop(points, tol = 0.5) {
  const out = [], t2 = tol * tol, used = new Set();
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
      if (dx * dx + dy * dy + dz * dz <= t2) { out.push([i, j]); used.add(j); }
    }
  }
  return out;
}
function conflictLoop(points, h = 5, dz = 15) {
  const out = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    const dh = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y), dv = Math.abs(points[i].z - points[j].z);
    if (dh <= h && dv > dz) out.push({ i, j, h: dh, dz: dv });
  }
  return out.sort((a, b) => b.dz - a.dz);
}

test("the pick checks' pairs from a cell bucket: the same duplicates (first copy kept), close pairs and conflicts as every pair", () => {
  const pts = [];
  for (let k = 0; k < 1500; k++) pts.push({ hole_id: `H${k % 300}`, depth: k, x: Math.round(rnd() * 400) * 2.5, y: Math.round(rnd() * 400) * 2.5, z: 300 + rnd() * 80 });
  for (let k = 0; k < 60; k++) { const p = pts[k * 7]; pts.push({ ...p, z: p.z + (k % 3) * 0.2 }); } // copies, some three deep
  for (let k = 0; k < 40; k++) { const p = pts[k * 11 + 3]; pts.push({ ...p, x: p.x + 5, z: p.z + 30 }); } // exactly 5 m away in plan: on the limit
  pts.push({ x: -2.5, y: -0.0, z: 1 }, { x: -2.5, y: 0, z: 1.3 }); // negative cells
  // the module's own functions are internal to pickReport; it is checked against the loops through the counts and examples it reports
  const spec = { label: "Top of X", points: pts, orientations: [] };
  const r = pickReport(spec);
  const near = duplicateLoop(pts), con = conflictLoop(pts);
  const sameSpot = ([i, j]) => !(pts[i].hole_id && pts[i].hole_id === pts[j].hole_id && Number.isFinite(pts[i].depth) && Number.isFinite(pts[j].depth) && Math.abs(pts[i].depth - pts[j].depth) >= 0.01);
  assert.ok(near.length > 50 && con.length > 40, `${near.length} / ${con.length}`);
  assert.equal(r.duplicates, near.filter(sameSpot).length);
  assert.equal(r.close, near.filter((p) => !sameSpot(p)).length);
  assert.equal(r.conflicts, con.length);
  assert.deepEqual(r.conflictExamples, con.slice(0, 3).map((c) => `${pts[c.i].hole_id ? `${pts[c.i].hole_id} at ${pts[c.i].depth} m` : ""} / ${pts[c.j].hole_id ? `${pts[c.j].hole_id} at ${pts[c.j].depth} m` : ""} (${Math.round(c.h)} m apart, ${Math.round(c.dz)} m in elevation)`));
});

test("the exports agree with the loops pair for pair", async () => {
  const { duplicatePicks, conflictingPicks } = await import("../src/lib/pickDiagnostics.js");
  for (let rep = 0; rep < 4; rep++) {
    const pts = Array.from({ length: 900 }, () => ({ x: Math.round(rnd() * 120) * 0.5, y: Math.round(rnd() * 120) * 0.5, z: Math.round(rnd() * 80) * 0.5 }));
    assert.deepEqual(duplicatePicks(pts), duplicateLoop(pts));
    assert.deepEqual(duplicatePicks(pts, 2), duplicateLoop(pts, 2));
    assert.deepEqual(conflictingPicks(pts), conflictLoop(pts));
    assert.deepEqual(conflictingPicks(pts, { h: 3, dz: 10 }), conflictLoop(pts, 3, 10));
  }
  assert.deepEqual(duplicatePicks([]), []); assert.deepEqual(conflictingPicks([{ x: 0, y: 0, z: 0 }]), []);
});

test("wiring: one mesh query per surface for the fold and order checks; the block cut once with no trend", () => {
  const s = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(s, /const inv = inversionCheck\(meshQuery\(\), \{ up: "y" \}\);/);
  assert.match(s, /q: o\.meshQuery\(\)\.query/);
  assert.equal((s.match(/buildMeshQuery\(/g) || []).length, 1, "built in one place");
  assert.match(s, /const same = lbBlock === res\.block && unwarp === real;/);
  assert.match(s, /const vc = same \? lc : capBlockAtGround\(res\.block, groundOf, unwarp\);/);
});
