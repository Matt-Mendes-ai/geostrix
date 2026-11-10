// TASKS.csv #1335 — how far a modelled surface may run past its own contacts. GemPy's surface is a level set of a field
// defined across the whole model box, so a unit logged in a few holes came back as a sheet across the property (Matt,
// Treaty Creek: a code on one cluster of holes "expands way beyond drilling"). The footprint is the convex hull of the
// contacts in their own best-fit plane, so it also limits a steep contact down-dip, which a hull seen from above cannot.
// A point is outside when it projects farther than the margin from that hull. Loaded on demand. Pure.
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// the largest eigenvector of a symmetric 3x3, by power iteration, skipping the directions in `not`
function principal(C, not) {
  let v = [0.57, 0.61, 0.55];
  for (let it = 0; it < 80; it++) {
    for (const n of not) { const d = dot(v, n); v = [v[0] - d * n[0], v[1] - d * n[1], v[2] - d * n[2]]; }
    const w = [dot(C[0], v), dot(C[1], v), dot(C[2], v)];
    const len = Math.hypot(w[0], w[1], w[2]);
    if (!(len > 1e-12)) break;
    v = [w[0] / len, w[1] / len, w[2] / len];
  }
  for (const n of not) { const d = dot(v, n); v = [v[0] - d * n[0], v[1] - d * n[1], v[2] - d * n[2]]; }
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len > 1e-9) return [v[0] / len, v[1] / len, v[2] / len];
  // no spread left (a single point, or a line for the second axis): any direction square to the others
  const axis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => {
    let u = a;
    for (const n of not) { const d = dot(u, n); u = [u[0] - d * n[0], u[1] - d * n[1], u[2] - d * n[2]]; }
    return u;
  }).sort((p, q) => dot(q, q) - dot(p, p))[0];
  const l = Math.hypot(axis[0], axis[1], axis[2]);
  return [axis[0] / l, axis[1] / l, axis[2] / l];
}

function convexHull(pts) {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  const hull = [...half(s), ...half(s.slice().reverse())];
  return hull.length ? hull : s.slice(0, 1);
}

// points: [{x, y, z}] in metres, in any right-handed or left-handed frame.
// The automatic margin follows the explicit surface tool's rule (#1013): 15 % of the shorter span, at least a quarter of
// the longer span's 15 %, and MIN_MARGIN_M so one hole or a tight fan still gets a surface.
export const MIN_MARGIN_M = 50;
export function contactFootprint(points, marginM = 0) {
  const P = (points || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));
  if (!P.length) return null;
  const c = [0, 0, 0];
  P.forEach((p) => { c[0] += p.x; c[1] += p.y; c[2] += p.z; });
  c[0] /= P.length; c[1] /= P.length; c[2] /= P.length;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  P.forEach((p) => {
    const d = [p.x - c[0], p.y - c[1], p.z - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j];
  });
  const e1 = principal(C, []);
  const e2 = principal(C, [e1]);
  const uv = P.map((p) => { const d = [p.x - c[0], p.y - c[1], p.z - c[2]]; return [dot(d, e1), dot(d, e2)]; });
  const span = (k) => { let lo = Infinity, hi = -Infinity; uv.forEach((q) => { if (q[k] < lo) lo = q[k]; if (q[k] > hi) hi = q[k]; }); return hi - lo; };
  const a = span(0), b = span(1);
  const autoM = Math.max(MIN_MARGIN_M, 0.15 * Math.max(Math.min(a, b), Math.max(a, b) / 4));
  const margin = marginM > 0 ? marginM : autoM;
  const hull = convexHull(uv);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  hull.forEach(([u, v]) => { if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; });
  const m2 = margin * margin;
  const n = hull.length;
  const isOutside = (q) => {
    const d = [q.x - c[0], q.y - c[1], q.z - c[2]];
    const u = dot(d, e1), v = dot(d, e2);
    if (u < u0 - margin || u > u1 + margin || v < v0 - margin || v > v1 + margin) return true;
    if (n >= 3) { // counter-clockwise hull: inside when left of every edge
      let inside = true;
      for (let i = 0; i < n && inside; i++) {
        const [x0, y0] = hull[i], [x1, y1] = hull[(i + 1) % n];
        if ((x1 - x0) * (v - y0) - (y1 - y0) * (u - x0) < 0) inside = false;
      }
      if (inside) return false;
    }
    for (let i = 0; i < n; i++) {
      const [x0, y0] = hull[i], [x1, y1] = hull[(i + 1) % n];
      const ex = x1 - x0, ey = y1 - y0, l2 = ex * ex + ey * ey;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((u - x0) * ex + (v - y0) * ey) / l2)) : 0;
      const px = u - x0 - t * ex, py = v - y0 - t * ey;
      if (px * px + py * py <= m2) return false;
    }
    return true;
  };
  return { margin, autoMargin: autoM, isOutside };
}

// The model box's padding on one axis when it is sized to the contacts: never less than the room the surface is allowed
// past them, and room to bend on an axis the contacts barely span (a flat-lying unit has almost no height range).
export function reachPad(span, longestSpan, marginM, capM) {
  return Math.max(Math.min(Math.max(1, span) * 0.15, capM), Math.min(longestSpan * 0.25, capM), marginM);
}
// TASKS.csv #2377 (review #2325, WA uranium) — the VERTICAL pad, from the drilled column (the trace points' height range), never from the
// lateral span or the lateral reach margin: reachPad on z gave an 80 m column 2.3-2.5 km of height (a 36-cell solve, cells 64-70 m thick,
// surfaces from RL -30 to 805 m, 'LIG 168.59 km3'). Half the drilled column, at least 20 m and at least 15 % of the contacts' own height,
// capped as the lateral pad. columnM: the drilling's height; null (no traces) -> null, the caller keeps reachPad.
// TASKS.csv #2528 (review #2486, WA lithium) — the drilled column under the model's own footprint: the height range of the trace points
// inside the lateral box. #2377 took every trace in the project, so a model of 15-20 m bench holes in one corner got a box from the
// project's highest collar to its deepest toe plus half that again (RL -557 to 626, 1,183 m). null when no trace point lies inside.
// TASKS.csv #2616 (re-test of #2528) — the points are the Model area's holes only, each trace cut at its logged end (clipTrace): a hole 118 m
// outside the area, surveyed 347 m past its logged depth, set the floor (RL -415 to 536 for holes drilling RL 271 to 22). A point may carry
// `hole`; the result names the holes at the top and the bottom (minHole / maxHole).
export function drilledColumn(points, box) {
  let lo = Infinity, hi = -Infinity, minHole = null, maxHole = null;
  for (const p of points || []) {
    if (!(p.x >= box.xmin && p.x <= box.xmax && p.y >= box.ymin && p.y <= box.ymax) || !Number.isFinite(p.z)) continue;
    if (p.z < lo) { lo = p.z; minHole = p.hole ?? null; } if (p.z > hi) { hi = p.z; maxHole = p.hole ?? null; }
  }
  return Number.isFinite(lo) ? { min: lo, max: hi, minHole, maxHole } : null;
}
// a trace (points from the collar down) cut at `length` metres along it, the hole's logged end; no length: as it is
export function clipTrace(pts, length) {
  if (!(Number(length) > 0) || !pts || pts.length < 2) return pts || [];
  const out = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (run + d >= length) { const f = d > 0 ? (length - run) / d : 0; out.push({ ...b, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }); return out; }
    run += d; out.push(b);
  }
  return out;
}
export function verticalPad(zSpan, columnM, capM) {
  if (!(Number.isFinite(columnM) && columnM > 0)) return null;
  return Math.min(Math.max(20, 0.5 * columnM, Math.max(1, zSpan) * 0.15), capM);
}
