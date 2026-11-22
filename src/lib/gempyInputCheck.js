// TASKS.csv #3986 (Matt, Mount Raymond: Geological Mapping > Model it failed with 'GemPy could not solve this model: Singular matrix' at the end
// of a 10-line notice listing the whole stack) — GemPy's kriging matrix goes singular on inputs it cannot tell apart: the same point twice (or
// two within a few decimetres), points of two surfaces at one place, a surface or fault with fewer than two points, a surface with no
// orientation. Before the solve the run checks each surface and fault and fixes what it can, saying what it did: duplicates and near-duplicates
// removed (within `tol` metres), a later surface's points that sit on an earlier one's removed, a surface or fault with under two points left
// out, a surface with no orientation given the nearest one measured on the map (its dip and direction, placed on the surface's nearest point).
// What it cannot fix (points all on one line with no orientation, two surfaces within a few metres) is kept as the likely cause, said in one
// line if the solve fails. Pure: specs are { label, meshName, fault, points: [{ x, y, z }], orientations: [{ x, y, z, dip, azimuth }] }.

const keyOf = (p, tol) => `${Math.floor(p.x / tol)}|${Math.floor(p.y / tol)}|${Math.floor(p.z / tol)}`;
function* around(p, tol) {
  const i = Math.floor(p.x / tol), j = Math.floor(p.y / tol), k = Math.floor(p.z / tol);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) yield `${i + a}|${j + b}|${k + c}`;
}
const near = (p, q, tol) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= tol;
// a spatial hash of points (cells of `tol`) -> { add(p), hit(p) }
function grid(tol) {
  const m = new Map();
  return {
    add(p) { const k = keyOf(p, tol); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(p); },
    hit(p) { for (const k of around(p, tol)) for (const q of m.get(k) || []) if (near(p, q, tol)) return q; return null; },
  };
}
// the points with no other within tol (the first of each cluster kept) -> { kept, removed }
export function dedupe(points, tol) {
  const g = grid(tol), kept = [];
  for (const p of points) { if (g.hit(p)) continue; g.add(p); kept.push(p); }
  return { kept, removed: points.length - kept.length };
}
// how far the points stray from the straight line through them (the second spread of a principal-axes fit), in metres
export function lineSpread(points) {
  const n = points.length;
  if (n < 3) return 0;
  let mx = 0, my = 0, mz = 0;
  for (const p of points) { mx += p.x; my += p.y; mz += p.z; }
  mx /= n; my /= n; mz /= n;
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (const p of points) { const x = p.x - mx, y = p.y - my, z = p.z - mz; cxx += x * x; cxy += x * y; cxz += x * z; cyy += y * y; cyz += y * z; czz += z * z; }
  // the main axis by power iteration; the spread off it is what is left of the trace
  let v = [1, 1, 1];
  for (let it = 0; it < 50; it++) { const w = [cxx * v[0] + cxy * v[1] + cxz * v[2], cxy * v[0] + cyy * v[1] + cyz * v[2], cxz * v[0] + cyz * v[1] + czz * v[2]]; const L = Math.hypot(...w) || 1; v = w.map((q) => q / L); }
  const along = cxx * v[0] * v[0] + cyy * v[1] * v[1] + czz * v[2] * v[2] + 2 * (cxy * v[0] * v[1] + cxz * v[0] * v[2] + cyz * v[1] * v[2]);
  return Math.sqrt(Math.max(0, (cxx + cyy + czz - along) / n));
}

// the check and its fixes -> { specs (a new list; the specs objects copied), fixes: { dupes, orientationDupes, shared, dropped, borrowed }, risks }
//   dupes: [{ label, n }]; shared: [{ label, other, n }]; dropped: [{ label, n }]; borrowed: [{ label }]; risks: [{ kind, label, other?, m? }]
export function checkStackInputs(specs, { tol = 0.5, needOrientation = true } = {}) {
  const fixes = { dupes: [], orientationDupes: 0, shared: [], dropped: [], borrowed: [] }, risks = [];
  let out = specs.map((s) => ({ ...s, points: [...(s.points || [])], orientations: [...(s.orientations || [])] }));
  // 1. each surface's and fault's own duplicates
  for (const s of out) {
    const d = dedupe(s.points, tol);
    if (d.removed) { fixes.dupes.push({ label: s.label, n: d.removed }); s.points = d.kept; }
    const o = dedupe(s.orientations, tol);
    if (o.removed) { fixes.orientationDupes += o.removed; s.orientations = o.kept; }
  }
  // 2. a later surface's points sitting on an earlier surface's (two contacts at one spot): removed from the later one
  const seen = [];
  for (const s of out) {
    if (s.fault) continue;
    const byOther = new Map();
    s.points = s.points.filter((p) => { for (const t of seen) if (t.g.hit(p)) { byOther.set(t.label, (byOther.get(t.label) || 0) + 1); return false; } return true; });
    for (const [other, n] of byOther) fixes.shared.push({ label: s.label, other, n });
    const g = grid(tol); s.points.forEach((p) => g.add(p)); seen.push({ label: s.label, g });
  }
  // 3. fewer than two points: left out
  out = out.filter((s) => { if (s.points.length >= 2) return true; fixes.dropped.push({ label: s.label, n: s.points.length }); return false; });
  // 4. a surface with no orientation: the nearest one measured anywhere in the run (the map's dip symbols), on the surface's nearest point
  if (needOrientation) {
    const all = out.filter((s) => !s.fault).flatMap((s) => s.orientations);
    for (const s of out) {
      if (s.fault || s.orientations.length || !all.length) continue;
      let best = null, bd = Infinity, at = null;
      for (const o of all) for (const p of s.points) { const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; at = p; } }
      if (best) { s.orientations = [{ x: at.x, y: at.y, z: at.z, dip: best.dip, azimuth: best.azimuth, borrowed: true }]; s.orientationBorrowed = true; fixes.borrowed.push({ label: s.label }); }
    }
  }
  // what is left that could still make the matrix singular (said only if the solve fails)
  for (const s of out) {
    if (!s.orientations.length && needOrientation && !s.fault) risks.push({ kind: "noOrientation", label: s.label });
    else if (s.points.length >= 3 && lineSpread(s.points) < Math.max(1, tol * 2) && !s.fault) risks.push({ kind: "onALine", label: s.label });
  }
  const surf = out.filter((s) => !s.fault);
  for (let a = 0; a < surf.length; a++) for (let b = a + 1; b < surf.length; b++) {
    const g = grid(5); surf[a].points.forEach((p) => g.add(p));
    const hit = surf[b].points.find((p) => g.hit(p));
    if (hit) { risks.push({ kind: "close", label: surf[b].label, other: surf[a].label, m: 5 }); break; }
  }
  return { specs: out, fixes, risks };
}
export const anyFix = (f) => !!(f && (f.dupes.length || f.orientationDupes || f.shared.length || f.dropped.length || f.borrowed.length));
export const isSingularError = (e) => /singular matrix|singular/i.test(String(e || ""));
