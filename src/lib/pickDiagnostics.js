// TASKS.csv #762 — checks on the picks a GemPy run is given, before it solves. The review proposed GemPy's kriging
// condition number; MEASURED (probe762, two surfaces x 60 points, float32): clean 1.0e6 / 1.5e6, five duplicate
// picks 3.2e6 (x3 - inside the spread between clean fields), a pick 0.5 m from another but 30 m deeper 1.04e6
// (unchanged), orientations contradicting the contacts 1.04e6 (unchanged); and it costs 0.7 s at 1,500 rows, 6.6 s
// at 3,000. It misses the faults that bend surfaces, so these look at the data instead. Pure: points / orientations
// in metres (x east, y north, z up), each point may carry hole_id.

// Picks of one surface repeated at (almost) the same place: GemPy honours every copy, which only slows and stiffens
// the solve. Returns [[i, j], ...] (each later copy paired with the first).
export function duplicatePicks(points, tol = 0.5) {
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

// Picks of one surface nearly on top of each other but far apart in elevation: the surface would have to be close
// to vertical there (15 m over 5 m is 72 degrees) - usually a mis-picked or mislabelled contact, or the unit repeated
// by a fold or fault. Returns [{i, j, h, dz}].
export function conflictingPicks(points, { h = 5, dz = 15 } = {}) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dh = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y), dv = Math.abs(points[i].z - points[j].z);
      if (dh <= h && dv > dz) out.push({ i, j, h: dh, dz: dv });
    }
  }
  return out.sort((a, b) => b.dz - a.dz);
}

// The plane through a few points (least squares): its unit normal, and how planar / spread the points are
function planeOf(pts) {
  const n = pts.length, m = [0, 0, 0];
  pts.forEach((p) => { m[0] += p.x / n; m[1] += p.y / n; m[2] += p.z / n; });
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  pts.forEach((p) => { const v = [p.x - m[0], p.y - m[1], p.z - m[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a][b] += v[a] * v[b]; });
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let s = 0; s < 30; s++) for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) { // Jacobi rotations
    if (Math.abs(c[p][q]) < 1e-12 * (Math.abs(c[p][p]) + Math.abs(c[q][q]) + 1e-300)) continue;
    const th = 0.5 * Math.atan2(2 * c[p][q], c[q][q] - c[p][p]), cs = Math.cos(th), sn = Math.sin(th);
    for (let k = 0; k < 3; k++) { const a = c[k][p], b = c[k][q]; c[k][p] = cs * a - sn * b; c[k][q] = sn * a + cs * b; }
    for (let k = 0; k < 3; k++) { const a = c[p][k], b = c[q][k]; c[p][k] = cs * a - sn * b; c[q][k] = sn * a + cs * b; }
    for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = cs * a - sn * b; V[k][q] = sn * a + cs * b; }
  }
  const ord = [0, 1, 2].sort((a, b) => c[b][b] - c[a][a]);
  const ev = ord.map((k) => Math.max(0, c[k][k]));
  return { normal: [V[0][ord[2]], V[1][ord[2]], V[2][ord[2]]], spread: ev[1] / Math.max(1e-12, ev[0]), flatness: ev[2] / Math.max(1e-12, ev[1]) };
}

// Pole of a plane from dip / dip direction (degrees)
const pole = (dip, az) => { const d = (dip * Math.PI) / 180, a = (az * Math.PI) / 180; return [Math.sin(d) * Math.sin(a), Math.sin(d) * Math.cos(a), Math.cos(d)]; };

// Orientations that disagree with the contacts around them: the plane through the k nearest contacts of the same
// surface within `radius` (at least 4, spread in two directions and close to planar, or no verdict) against the
// orientation's own plane. Returns [{index, angle}] for angles over maxAngle.
export function orientationConflicts(points, orientations, { radius = 300, k = 6, maxAngle = 45 } = {}) {
  const out = [];
  orientations.forEach((o, index) => {
    if (!Number.isFinite(o.dip) || !Number.isFinite(o.azimuth)) return;
    const near = points.map((p) => ({ p, d: Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) })).filter((q) => q.d <= radius).sort((a, b) => a.d - b.d).slice(0, k).map((q) => q.p);
    if (near.length < 4) return;
    const pl = planeOf(near);
    if (pl.spread < 0.05 || pl.flatness > 0.2) return; // the contacts lie on a line, or are not a plane: no verdict
    const po = pole(o.dip, o.azimuth);
    const cos = Math.min(1, Math.abs(po[0] * pl.normal[0] + po[1] * pl.normal[1] + po[2] * pl.normal[2]));
    const angle = (Math.acos(cos) * 180) / Math.PI;
    if (angle > maxAngle) out.push({ index, angle });
  });
  return out.sort((a, b) => b.angle - a.angle);
}

// One surface's report: counts and up to three examples each, with hole IDs where the points carry them
export function pickReport(spec, opts = {}) {
  const pts = spec.points || [], ors = spec.orientations || [];
  if (pts.length > (opts.maxPoints ?? 5000)) return null; // a halo or grade shell's cloud, not picks
  const o = opts.origin || { x: 0, y: 0 }; // points are origin-relative in a model run: name real coordinates
  const where = (p) => p.hole_id || `${p.srcCode === "surface map" ? "map contact" : "drawn contact"} at ${Math.round(p.x + o.x)} E ${Math.round(p.y + o.y)} N`;
  const dup = duplicatePicks(pts), con = conflictingPicks(pts), ori = orientationConflicts(pts, ors);
  if (!dup.length && !con.length && !ori.length) return null;
  return {
    label: spec.label || spec.meshName, duplicates: dup.length, conflicts: con.length, orientations: ori.length, orientationsTotal: ors.length,
    duplicateExamples: dup.slice(0, 3).map(([i, j]) => (where(pts[i]) === where(pts[j]) ? where(pts[i]) : `${where(pts[i])} / ${where(pts[j])}`)),
    conflictExamples: con.slice(0, 3).map((c) => `${where(pts[c.i])} / ${where(pts[c.j])} (${Math.round(c.h)} m apart, ${Math.round(c.dz)} m in elevation)`),
    orientationExamples: ori.slice(0, 3).map((q) => `${Math.round(q.angle)}° ${ors[q.index].hole_id ? `in ${ors[q.index].hole_id}` : "on a pick"} at ${Math.round(ors[q.index].z + (o.z || 0))} m elevation`),
  };
}
