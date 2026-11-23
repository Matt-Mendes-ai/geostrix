// TASKS.csv #4013 (Matt, 2026-11-22, looking at a fault the Faults pane built as one GemPy surface: "the fault here is folded, it should
// be straight planes. Instead of trying to build one surface we should try to build sheeted planes", then "same thing for dykes and veins
// unless they are folded") — a structure as a set of FLAT, PARALLEL sheets instead of one curved surface.
//
// The evidence (points, some with a measured orientation) is grouped twice:
//   1. into orientation sets: the measured poles clustered axially (within tolDeg of the set's mean), or, with no measured orientation,
//      the plane fitted through the points (or the dip the geologist gives);
//   2. within a set, into sheets: each point's offset along the set's normal (n . p); a gap of more than gapM between neighbouring
//      offsets starts a new sheet. Parallel sheets of one set share its normal; a point far along strike from the others but on the
//      same plane is the same sheet, as it should be.
// The set's normal is then refined from the points (each sheet centred on its own mean, one plane fitted through all of them), when that
// fit is well conditioned and stays within tolDeg of the measured mean: core orientations scatter by ten degrees, positions do not.
//
// foldTest says whether a sheet reads as folded: a quadratic surface explains its points much better than the plane, and the plane misses
// them by more than a few metres. A folded vein is left to the curved model; a fault stays planar and the misfit is said.
//
// Pure: world ENU in (x east, y north, z up), world ENU out; no three.js, no store. Tested in test/sheetedPlanes4006.test.mjs.
import { fitPlane } from "./faultEvidence.js";
import { arrMin, arrMax } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)

const RAD = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
const up = (n) => (n[2] < 0 ? [-n[0], -n[1], -n[2]] : n);
const P = (p) => [p.x, p.y, p.z];

// the upward normal of a plane dipping `dip` towards `azimuth` (degrees)
export function normalOf(dip, azimuth) {
  return [Math.sin(dip * RAD) * Math.sin(azimuth * RAD), Math.sin(dip * RAD) * Math.cos(azimuth * RAD), Math.cos(dip * RAD)];
}
// dip and dip direction of an (upward) normal
export function attitudeOf(n) {
  const u = up(n);
  return { dip: Math.acos(Math.min(1, Math.abs(u[2]))) / RAD, dipDir: ((Math.atan2(u[0], u[1]) / RAD) + 360) % 360 };
}
// the angle between two planes (axial: a normal and its opposite are the same plane), degrees
export function planeAngle(a, b) { return Math.acos(Math.min(1, Math.abs(dot(a, b)))) / RAD; }

// orientation sets: greedy axial clustering of upward normals. -> [{ normal, members: [index] }], the largest set first
export function orientationSets(normals, tolDeg = 20) {
  const left = new Set(normals.map((_, i) => i)), sets = [];
  const near = (n, pool) => [...pool].filter((j) => planeAngle(n, normals[j]) <= tolDeg);
  while (left.size) {
    let seed = -1, best = -1;
    for (const i of left) { const k = near(normals[i], left).length; if (k > best) { best = k; seed = i; } }
    const mean = (ids) => unit(up(ids.reduce((s, j) => { const n = dot(normals[j], normals[seed]) < 0 ? normals[j].map((x) => -x) : normals[j]; return [s[0] + n[0], s[1] + n[1], s[2] + n[2]]; }, [0, 0, 0]))) || normals[seed];
    let m = mean(near(normals[seed], left));
    const members = near(m, left).length ? near(m, left) : [seed];
    m = mean(members);
    members.forEach((j) => left.delete(j));
    sets.push({ normal: m, members });
  }
  return sets.sort((a, b) => b.members.length - a.members.length);
}

// split offsets into sheets: indices sorted by n . p, a new sheet wherever the gap exceeds gapM
function splitSheets(ids, pts, n, gapM) {
  const d = ids.map((i) => ({ i, d: dot(n, pts[i]) })).sort((a, b) => a.d - b.d);
  const out = [];
  for (const e of d) { const cur = out[out.length - 1]; if (cur && e.d - cur.last <= gapM) { cur.ids.push(e.i); cur.last = e.d; } else out.push({ ids: [e.i], last: e.d }); }
  return out.map((s) => s.ids);
}

// the normal fitted through several sheets at once: each sheet centred on its own mean, then one plane through all (null when the
// points cannot fix a plane: too few, or along one line)
function sharedNormal(groups, pts) {
  const centred = [];
  for (const g of groups) {
    const c = g.reduce((s, i) => [s[0] + pts[i][0] / g.length, s[1] + pts[i][1] / g.length, s[2] + pts[i][2] / g.length], [0, 0, 0]);
    for (const i of g) centred.push({ x: pts[i][0] - c[0], y: pts[i][1] - c[1], z: pts[i][2] - c[2] });
  }
  if (centred.length < 4) return null;
  const f = fitPlane(centred);
  return f.flat ? null : f.normal;
}

/**
 * obs: [{ x, y, z, normal?: [nx, ny, nz] }] world; normal: a measured orientation at that point (upward or not)
 * opts: { tolDeg = 20, gapM = 25, normal: a given plane normal for every sheet (the geologist's dip), minPoints = 2, maxSheets = 12 }
 * -> { ok, why?, sets: [{ normal, dip, dipDir, source: "measured" | "fitted" | "given", sheets: [{ normal, offset, centroid, ids, rms, worst }] }],
 *      unassigned: [index], dropped: number of sheets left out (fewer than minPoints points, or past maxSheets) }
 */
export function sheetedPlanes(obs, opts = {}) {
  const tolDeg = opts.tolDeg ?? 20, gapM = opts.gapM ?? 25, minPoints = opts.minPoints ?? 2, maxSheets = opts.maxSheets ?? 12;
  const pts = obs.map(P);
  const oriented = obs.map((o, i) => (o.normal ? i : -1)).filter((i) => i >= 0);
  let sets, source;
  if (opts.normal) { sets = [{ normal: unit(up(opts.normal)), members: obs.map((_, i) => i) }]; source = "given"; }
  else if (oriented.length) {
    const ns = oriented.map((i) => unit(up(obs[i].normal)));
    sets = orientationSets(ns, tolDeg).map((s) => ({ normal: s.normal, members: s.members.map((k) => oriented[k]) }));
    source = "measured";
  } else {
    const f = fitPlane(obs);
    if (f.flat) return { ok: false, why: obs.length < 3 ? "too-few" : "no-orientation", sets: [], unassigned: obs.map((_, i) => i), dropped: 0 };
    sets = [{ normal: f.normal, members: obs.map((_, i) => i) }]; source = "fitted";
  }
  // the points with no orientation of their own: with one set they are its members; with several, each goes to the nearest sheet below
  const loose = obs.map((o, i) => (o.normal ? -1 : i)).filter((i) => i >= 0);
  if (source === "measured" && sets.length === 1) sets[0].members.push(...loose);

  const out = [];
  for (const s of sets) {
    let n = s.normal, groups = splitSheets(s.members, pts, n, gapM);
    if (source !== "given") for (let it = 0; it < 3; it++) { // the shared normal from the points, while it stays near the measured one
      const m = sharedNormal(groups.filter((g) => g.length >= 2), pts);
      if (!m || planeAngle(m, s.normal) > tolDeg) break;
      n = unit(up(m)); groups = splitSheets(s.members, pts, n, gapM);
    }
    out.push({ normal: n, groups });
  }
  const unassigned = [];
  if (source === "measured" && sets.length > 1) for (const i of loose) { // the nearest sheet of any set, within gapM
    let best = null;
    for (const s of out) for (const g of s.groups) { const off = g.reduce((a, j) => a + dot(s.normal, pts[j]), 0) / g.length, d = Math.abs(dot(s.normal, pts[i]) - off); if (!best || d < best.d) best = { d, g }; }
    if (best && best.d <= gapM) best.g.push(i); else unassigned.push(i);
  }
  let dropped = 0;
  const all = [];
  const result = out.map((s) => {
    const sheets = s.groups.filter((g) => { if (g.length >= minPoints) return true; dropped++; unassigned.push(...g); return false; }).map((ids) => {
      const off = ids.reduce((a, j) => a + dot(s.normal, pts[j]), 0) / ids.length;
      const c = ids.reduce((a, j) => ({ x: a.x + pts[j][0] / ids.length, y: a.y + pts[j][1] / ids.length, z: a.z + pts[j][2] / ids.length }), { x: 0, y: 0, z: 0 });
      const miss = ids.map((j) => Math.abs(dot(s.normal, pts[j]) - off));
      const sheet = { normal: s.normal, offset: off, centroid: c, ids, rms: Math.sqrt(miss.reduce((a, m) => a + m * m, 0) / miss.length), worst: arrMax(miss) };
      all.push(sheet);
      return sheet;
    });
    return { normal: s.normal, ...attitudeOf(s.normal), source, sheets };
  });
  // past maxSheets: the smallest sheets go
  if (all.length > maxSheets) {
    const keep = new Set([...all].sort((a, b) => b.ids.length - a.ids.length).slice(0, maxSheets));
    for (const r of result) r.sheets = r.sheets.filter((sh) => { if (keep.has(sh)) return true; dropped++; unassigned.push(...sh.ids); return false; });
  }
  const sets2 = result.filter((r) => r.sheets.length);
  return sets2.length ? { ok: true, sets: sets2, unassigned, dropped } : { ok: false, why: "too-few", sets: [], unassigned, dropped };
}

// the in-plane frame of a plane: u along strike (horizontal; east for a flat plane), v along the dip line, pointing up dip
export function planeFrame(normal) {
  const n = unit(up(normal));
  let u = [-n[1], n[0], 0];
  u = Math.hypot(u[0], u[1]) > 1e-9 ? unit(u) : [1, 0, 0];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { n, u, v };
}

// solve A x = b (small dense, partial pivoting); null when singular
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function lsq(rows, w) { // least squares w ~ rows . x; -> rms of the residuals, or null
  const k = rows[0].length, A = Array.from({ length: k }, () => new Array(k).fill(0)), b = new Array(k).fill(0);
  rows.forEach((r, i) => { for (let a = 0; a < k; a++) { b[a] += r[a] * w[i]; for (let c = 0; c < k; c++) A[a][c] += r[a] * r[c]; } });
  const x = solve(A, b);
  if (!x) return null;
  return Math.sqrt(rows.reduce((s, r, i) => { const e = w[i] - r.reduce((t, v, a) => t + v * x[a], 0); return s + e * e; }, 0) / rows.length);
}

/**
 * Does a sheet read as folded? points [{x,y,z}] and the sheet's normal. A plane and a quadratic surface are both fitted to the offsets
 * off the plane (w over u, v); folded when the plane misses by more than max(minM, 2 % of the sheet's length) and the quadratic halves
 * that misfit. Fewer than 7 points, or points along one line: not judged.
 * -> { folded, judged, rmsPlane, rmsCurved, spanM }
 */
export function foldTest(points, normal, { minM = 5 } = {}) {
  const { n, u, v } = planeFrame(normal);
  if (points.length < 7) return { folded: false, judged: false };
  const c = points.reduce((a, p) => [a[0] + p.x / points.length, a[1] + p.y / points.length, a[2] + p.z / points.length], [0, 0, 0]);
  const loc = points.map((p) => { const d = [p.x - c[0], p.y - c[1], p.z - c[2]]; return [dot(d, u), dot(d, v), dot(d, n)]; });
  const span = arrMax(loc.map((l) => Math.hypot(l[0], l[1]))) * 2 || 1, s = span / 2;
  const w = loc.map((l) => l[2]);
  const rmsPlane = lsq(loc.map((l) => [1, l[0] / s, l[1] / s]), w);
  const rmsCurved = lsq(loc.map((l) => { const a = l[0] / s, b = l[1] / s; return [1, a, b, a * a, a * b, b * b]; }), w);
  if (rmsPlane == null || rmsCurved == null) return { folded: false, judged: false };
  return { folded: rmsPlane > Math.max(minM, 0.02 * span) && rmsCurved < 0.5 * rmsPlane, judged: true, rmsPlane, rmsCurved, spanM: span };
}

/**
 * A flat mesh on a sheet's plane. region: { kind: "ellipse", a, b, cu, cv } (half-axes along strike / down dip, centre offset in the
 * plane from `origin`) or { kind: "rect", u0, u1, v0, v1 }. keep(p) (world {x,y,z}) drops the triangles whose centre it refuses (the box,
 * the ground, another fault). -> { positions: number[] (world x, y, z, ...), indices: number[] }
 */
export function planeMesh(normal, origin, region, keep = null, { rings = 10, sectors = 48, cells = 40 } = {}) {
  const { u, v } = planeFrame(normal);
  const at = (a, b) => ({ x: origin.x + u[0] * a + v[0] * b, y: origin.y + u[1] * a + v[1] * b, z: origin.z + u[2] * a + v[2] * b });
  const verts = [], tris = [];
  if (region.kind === "ellipse") {
    verts.push(at(region.cu, region.cv));
    for (let r = 1; r <= rings; r++) for (let k = 0; k < sectors; k++) { const t = (2 * Math.PI * k) / sectors, f = r / rings; verts.push(at(region.cu + region.a * f * Math.cos(t), region.cv + region.b * f * Math.sin(t))); }
    const id = (r, k) => (r === 0 ? 0 : 1 + (r - 1) * sectors + (k % sectors));
    for (let k = 0; k < sectors; k++) tris.push([0, id(1, k), id(1, k + 1)]);
    for (let r = 1; r < rings; r++) for (let k = 0; k < sectors; k++) tris.push([id(r, k), id(r + 1, k), id(r + 1, k + 1)], [id(r, k), id(r + 1, k + 1), id(r, k + 1)]);
  } else {
    const nu = cells, nv = cells;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) verts.push(at(region.u0 + ((region.u1 - region.u0) * i) / nu, region.v0 + ((region.v1 - region.v0) * j) / nv));
    const id = (i, j) => j * (nu + 1) + i;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
  }
  const kept = keep ? tris.filter((t) => keep({ x: (verts[t[0]].x + verts[t[1]].x + verts[t[2]].x) / 3, y: (verts[t[0]].y + verts[t[1]].y + verts[t[2]].y) / 3, z: (verts[t[0]].z + verts[t[1]].z + verts[t[2]].z) / 3 })) : tris;
  const map = new Map(), positions = [], indices = [];
  for (const t of kept) for (const i of t) { if (!map.has(i)) { map.set(i, positions.length / 3); positions.push(verts[i].x, verts[i].y, verts[i].z); } indices.push(map.get(i)); }
  return { positions, indices };
}

// the region of a sheet: "finite" -> the ellipse around its points plus a margin (down dip at least half its length along strike, as
// faultEllipse); "box" -> the rectangle in its plane that covers the box's eight corners. origin: the sheet's centroid, on its plane.
export function sheetRegion(sheet, points, extent, { marginM = 200, box = null } = {}) {
  const { u, v } = planeFrame(sheet.normal), c = sheet.centroid;
  const loc = (p) => { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; return [dot(d, u), dot(d, v)]; };
  if (extent === "finite" || !box) {
    const l = points.map(loc), us = l.map((q) => q[0]), vs = l.map((q) => q[1]);
    const cu = (arrMin(us) + arrMax(us)) / 2, cv = (arrMin(vs) + arrMax(vs)) / 2;
    const a = (arrMax(us) - arrMin(us)) / 2 + marginM;
    return { kind: "ellipse", a, b: Math.max((arrMax(vs) - arrMin(vs)) / 2 + marginM, a / 2), cu, cv };
  }
  const corners = [];
  for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) corners.push(loc({ x, y, z }));
  return { kind: "rect", u0: arrMin(corners.map((q) => q[0])), u1: arrMax(corners.map((q) => q[0])), v0: arrMin(corners.map((q) => q[1])), v1: arrMax(corners.map((q) => q[1])) };
}
