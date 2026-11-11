// TASKS.csv #2625 (split from #2530; review #2486, WA lithium) and #2635 — a sheet swarm: the pegmatite P is 52 runs in 15 holes (up to 11 per
// hole); the Vein / dyke tool says honestly that they do not behave like one vein, and Auto-number numbers them top-down PER HOLE, so P3 in one
// hole is not P3 in the next. Here the runs are correlated BETWEEN holes along an attitude (typed, or fitted to the runs' midpoints): each
// run's midpoint is placed on the attitude's normal, and a new sheet starts wherever two neighbouring positions along it are farther apart
// than the gap. The sheets are numbered from the top (the upper side of the normal) and written as base + n, like Auto-number, so the Vein
// tool can take them one by one. Parallel sheets only: a swarm that splits, or sheets that cross, need connecting by hand.
import { fitPlane, normalToDipDipDir } from "./vein.js";

const RAD = Math.PI / 180;
// a plane's upward unit normal from its dip and dip direction (east x, north y, up z)
export function attitudeNormal(dip, dipDirection) {
  const d = Number(dip) * RAD, a = Number(dipDirection) * RAD;
  return { x: Math.sin(d) * Math.sin(a), y: Math.sin(d) * Math.cos(a), z: Math.cos(d) };
}

// runs: [{ hole_id, code, from, to, rows }] (lib/modellingCodes.js codedRuns); positionAt(hole_id, md) -> { x, y, z } (east, north, up) | null
// -> [{ run, p }] for the runs that could be placed
export function placeRuns(runs, positionAt) {
  const out = [];
  for (const run of runs || []) {
    const p = positionAt(run.hole_id, (Number(run.from) + Number(run.to)) / 2);
    if (p && [p.x, p.y, p.z].every(Number.isFinite)) out.push({ run, p });
  }
  return out;
}

// the attitude fitted to the placed runs' midpoints (the swarm's plane), or null when they do not define one (fewer than 3, on a line)
// One line of holes in plan (a single section) puts every sheet's runs in the section's own plane: that vertical plane would be 'fitted'.
function planCollinear(ps) {
  const n = ps.length; if (n < 3) return true;
  const cx = ps.reduce((a, p) => a + p.x, 0) / n, cy = ps.reduce((a, p) => a + p.y, 0) / n;
  let xx = 0, xy = 0, yy = 0;
  for (const p of ps) { const dx = p.x - cx, dy = p.y - cy; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
  const tr = xx + yy, det = xx * yy - xy * xy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
  return !(l1 > 1e-9) || Math.sqrt(l2 / l1) < 0.05;
}
export function fitSheetAttitude(placed) {
  if (planCollinear((placed || []).map((q) => q.p))) return null;
  const f = fitPlane((placed || []).map((q) => q.p));
  if (!f || !(f.collinearity > 0.05)) return null;
  const a = normalToDipDipDir(f.normal);
  return a ? { dip: a.dip, dipDirection: a.dipDir, normal: f.normal, planarity: f.planarity } : null;
}

// placed: placeRuns(...); normal: the attitude's upward normal; gapM: the largest gap along the normal inside one sheet
// -> { sheets: [{ n, d, runs }], twice: holes with two runs in one sheet, spread: the largest within-sheet spread along the normal }
export function correlateSheets(placed, normal, gapM) {
  const l = Math.hypot(normal.x, normal.y, normal.z) || 1, nx = normal.x / l, ny = normal.y / l, nz = normal.z / l;
  const items = (placed || []).map((q) => ({ ...q, d: q.p.x * nx + q.p.y * ny + q.p.z * nz })).sort((a, b) => b.d - a.d); // top first
  const sheets = [];
  for (const it of items) {
    const cur = sheets[sheets.length - 1];
    if (cur && cur.last - it.d <= gapM) { cur.runs.push(it.run); cur.last = it.d; cur.dSum += it.d; }
    else sheets.push({ runs: [it.run], first: it.d, last: it.d, dSum: it.d });
  }
  let twice = 0, spread = 0;
  const out = sheets.map((s, i) => {
    const holes = new Set();
    for (const r of s.runs) { if (holes.has(r.hole_id)) twice++; holes.add(r.hole_id); }
    spread = Math.max(spread, s.first - s.last);
    return { n: i + 1, d: s.dSum / s.runs.length, runs: s.runs };
  });
  return { sheets: out, twice, spread };
}

// One plane through every sheet's midpoints is tilted by the stacking (three sheets 15 m apart fitted 35.3° for a 34° swarm): refine it by
// correlating, centring each sheet on its own centroid and refitting the pooled points, twice. -> the refined fit, or the first when a
// round leaves nothing to fit (one run per sheet)
export function refineSheetAttitude(placed, fit, gapM, rounds = 2) {
  let cur = fit;
  for (let k = 0; k < rounds && cur; k++) {
    const { sheets } = correlateSheets(placed, cur.normal, gapM);
    const byRun = new Map((placed || []).map((q) => [q.run, q.p]));
    const pts = [];
    for (const sh of sheets) {
      if (sh.runs.length < 2) continue;
      const ps = sh.runs.map((r) => byRun.get(r)), m = ps.length;
      const c = ps.reduce((acc, p) => ({ x: acc.x + p.x / m, y: acc.y + p.y / m, z: acc.z + p.z / m }), { x: 0, y: 0, z: 0 });
      for (const p of ps) pts.push({ x: p.x - c.x, y: p.y - c.y, z: p.z - c.z });
    }
    const f = fitPlane(pts);
    if (!f || !(f.collinearity > 0.05)) break;
    const at = normalToDipDipDir(f.normal);
    if (!at) break;
    cur = { dip: at.dip, dipDirection: at.dipDir, normal: f.normal, planarity: f.planarity, refined: k + 1 };
  }
  return cur;
}

// the Modelling codes assign map for the sheets: each run's rows get base + n (rowKey from lib/modellingCodes.js)
export function sheetAssign(sheets, base, rowKey, assign = {}) {
  const out = { ...assign };
  for (const s of sheets) for (const run of s.runs) for (const r of run.rows || []) out[rowKey(r)] = `${base}${s.n}`;
  return out;
}

// the 3D view's desurveyed traces ([{ hole_id, pts: [{ md, x, y, z }] }], scene frame: y up, z = -north) -> positionAt(hole_id, md) in
// (east, north, up) relative to the scene origin: projections along a normal need no world offset
export function positionFromTraces(traces) {
  const by = new Map((traces || []).filter((t) => t?.pts?.length).map((t) => [t.hole_id, t.pts]));
  return (holeId, md) => {
    const pts = by.get(holeId);
    if (!pts || !Number.isFinite(md)) return null;
    let i = 1;
    while (i < pts.length - 1 && pts[i].md < md) i++;
    const a = pts[i - 1] || pts[0], b = pts[i] || a;
    const f = b.md > a.md ? Math.min(1, Math.max(0, (md - a.md) / (b.md - a.md))) : 0;
    const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
    return { x, y: -z, z: y };
  };
}
