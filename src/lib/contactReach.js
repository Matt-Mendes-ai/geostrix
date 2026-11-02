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
