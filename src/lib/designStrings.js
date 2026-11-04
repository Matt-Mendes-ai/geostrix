// TASKS.csv #1876 — DESIGN STRINGS: free 3D polylines and polygons (Matt: "we should have more CAD like tools in that module").
// A string is { id, name, color, closed, visible, vertices: [[E, N, Z], ...] } in world coordinates; the drawing, snapping and
// editing live in DesignStringsPane, the geometry here. Pure: no three.js, no React.
import { parseDXF } from "./dxf.js";

const RAD = Math.PI / 180;
export const norm360 = (a) => ((a % 360) + 360) % 360;
const fin = (v) => Number.isFinite(v);
const ok = (p) => p && fin(p[0]) && fin(p[1]) && fin(p[2]);

// plan length, 3D length, the closed area in plan (shoelace) and the box
export function stringStats(vertices, closed = false) {
  const v = (vertices || []).filter(ok), n = v.length;
  let length2d = 0, length3d = 0, area2 = 0;
  const seg = (a, b) => { length2d += Math.hypot(b[0] - a[0], b[1] - a[1]); length3d += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); };
  for (let i = 1; i < n; i++) seg(v[i - 1], v[i]);
  if (closed && n > 2) { seg(v[n - 1], v[0]); for (let i = 0; i < n; i++) { const a = v[i], b = v[(i + 1) % n]; area2 += a[0] * b[1] - b[0] * a[1]; } }
  const box = n ? [Math.min(...v.map((p) => p[0])), Math.min(...v.map((p) => p[1])), Math.min(...v.map((p) => p[2])), Math.max(...v.map((p) => p[0])), Math.max(...v.map((p) => p[1])), Math.max(...v.map((p) => p[2]))] : null;
  return { n, length2d, length3d, area: closed ? Math.abs(area2) / 2 : 0, ccw: area2 > 0, box };
}

// a plan OFFSET copy: every segment moved d metres sideways, consecutive offset lines meeting at their mitre. +d is to the
// right of the direction of travel on an open string and OUTWARD on a closed one (whatever its winding). A corner sharper than
// about 30 degrees gets a bevel (two points) instead of a long mitre spike; Z is carried from each vertex. The limit of any plain
// offset: an inside corner tighter than d folds the copy back on itself there, and that loop is left as it is (the pane says so).
export function offsetString(vertices, d, closed = false) {
  const v = dedupe(vertices.filter(ok)), n = v.length;
  if (n < 2 || !fin(d) || d === 0) return v.map((p) => [...p]);
  const sign = closed && n > 2 && !stringStats(v, true).ccw ? -1 : 1; // a CW ring: right of travel is inside, so flip
  const dd = d * sign;
  const segs = []; // offset segments: [ax, ay, bx, by]
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = v[i], b = v[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const nx = dy / L, ny = -dx / L; // right-hand normal
    segs.push([a[0] + nx * dd, a[1] + ny * dd, b[0] + nx * dd, b[1] + ny * dd, i]);
  }
  if (!segs.length) return v.map((p) => [...p]);
  const out = [];
  const corner = (s, t, zv) => { // where offset segment s meets the next one t
    const [ax, ay, bx, by] = s, [cx, cy, ex, ey] = t;
    const r = [bx - ax, by - ay], q = [ex - cx, ey - cy], den = r[0] * q[1] - r[1] * q[0];
    const cos = (r[0] * q[0] + r[1] * q[1]) / (Math.hypot(...r) * Math.hypot(...q));
    if (Math.abs(den) < 1e-9 || cos < -0.866) { out.push([bx, by, zv]); out.push([cx, cy, zv]); return; } // parallel or a sharp turn: bevel
    const u = ((cx - ax) * q[1] - (cy - ay) * q[0]) / den;
    out.push([ax + u * r[0], ay + u * r[1], zv]);
  };
  if (closed) {
    for (let k = 0; k < segs.length; k++) corner(segs[k], segs[(k + 1) % segs.length], v[(segs[k][4] + 1) % n][2]);
    // the loop starts at the first vertex's corner: rotate so the copy's first point matches the original's first vertex
    out.unshift(out.pop());
  } else {
    out.push([segs[0][0], segs[0][1], v[segs[0][4]][2]]);
    for (let k = 0; k < segs.length - 1; k++) corner(segs[k], segs[k + 1], v[segs[k][4] + 1][2]);
    const last = segs[segs.length - 1];
    out.push([last[2], last[3], v[(last[4] + 1) % n][2]]);
  }
  return out;
}

export function dedupe(vertices) {
  const out = [];
  for (const p of vertices) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-6) out.push(p); }
  if (out.length > 2) { const a = out[0], b = out[out.length - 1]; if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= 1e-6) out.pop(); }
  return out;
}

// join b onto a: whichever of b's ends is nearest one of a's ends, the result running on from a (reversed if its start was the near end)
export function joinStrings(a, b) {
  const A = a.filter(ok), B = b.filter(ok);
  if (!A.length) return B.map((p) => [...p]); if (!B.length) return A.map((p) => [...p]);
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const combos = [
    { gap: d(A[A.length - 1], B[0]), A, B },
    { gap: d(A[A.length - 1], B[B.length - 1]), A, B: [...B].reverse() },
    { gap: d(A[0], B[0]), A: [...A].reverse(), B },
    { gap: d(A[0], B[B.length - 1]), A: [...A].reverse(), B: [...B].reverse() },
  ].sort((p, q) => p.gap - q.gap);
  const c = combos[0], joined = [...c.A.map((p) => [...p]), ...c.B.map((p) => [...p])];
  return c.gap <= 1e-6 ? dedupe(joined) : joined;
}

export const splitString = (vertices, i) => (i <= 0 || i >= vertices.length - 1 ? null : [vertices.slice(0, i + 1).map((p) => [...p]), vertices.slice(i).map((p) => [...p])]);
export const reverseString = (vertices) => [...vertices].reverse().map((p) => [...p]);

// the next vertex from the last one: a distance in plan on a bearing (degrees clockwise from north), climbing at a grade (%)
export function fromDistanceBearing(last, { distance, bearing, grade = 0 }) {
  const a = norm360(bearing) * RAD, run = Math.max(0, distance);
  return [last[0] + run * Math.sin(a), last[1] + run * Math.cos(a), last[2] + run * ((Number(grade) || 0) / 100)];
}
export const bearingOf = (a, b) => norm360(Math.atan2(b[0] - a[0], b[1] - a[1]) / RAD);
// Shift while drawing: the point moved onto the nearest of the four grid directions from the last vertex, at the same plan distance
export function orthoPoint(last, p) {
  const dx = p[0] - last[0], dy = p[1] - last[1], L = Math.hypot(dx, dy);
  if (L < 1e-9) return [...p];
  const az = Math.round(bearingOf(last, p) / 90) * 90 * RAD;
  return [last[0] + L * Math.sin(az), last[1] + L * Math.cos(az), p[2]];
}
export const snapToGrid = (p, g) => (g > 0 ? [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g, p[2]] : [...p]);
// the nearest of the candidate points within `radius` (3D), or null
export function nearestPoint(p, candidates, radius) {
  let best = null, bd = radius;
  for (const q of candidates) { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d <= bd) { bd = d; best = q; } }
  return best ? [...best] : null;
}
// the point of a string (vertex or along a segment) nearest p in plan, with its segment index: for inserting a vertex on a segment
export function nearestOnString(vertices, p, closed = false) {
  const v = vertices.filter(ok), n = v.length;
  if (!n) return null;
  let best = null;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = v[i], b = v[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    const q = [a[0] + t * dx, a[1] + t * dy, a[2] + t * (b[2] - a[2])], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!best || d < best.d) best = { d, point: q, segment: i, t };
  }
  return best;
}

// export: rows, one per vertex, and DXF features (a closed string repeats its first vertex)
export function stringRows(strings) {
  const out = [];
  strings.forEach((s) => s.vertices.forEach((p, i) => out.push({ string: s.name, closed: s.closed ? "yes" : "", vertex: i + 1, x: +p[0].toFixed(3), y: +p[1].toFixed(3), z: +p[2].toFixed(3) })));
  return out;
}
export const stringFeatures = (strings) => strings.filter((s) => s.vertices.length > 1).map((s) => ({ attributes: { name: s.name, color: s.color, closed: !!s.closed }, geometry: s.closed && s.vertices.length > 2 ? [...s.vertices, s.vertices[0]] : s.vertices }));

// import: every polyline of a DXF (lib/dxf.js parseDXF keeps Z and the closed flag) as a string named after its layer; a 2D
// polyline takes `zDefault`. Coordinates are taken as the project's CRS: the caller checks that.
export function stringsFromDxf(text, { zDefault = 0, baseName = "DXF" } = {}) {
  const { polylines, layers, closed, has3D, skipped } = parseDXF(text);
  const count = new Map();
  const strings = polylines.map((pl, k) => {
    const layer = layers[k] || "0", n = (count.get(layer) || 0) + 1; count.set(layer, n);
    const vertices = dedupe(pl.map((q) => [q.x, q.y, fin(q.z) ? q.z : zDefault]).filter(ok));
    return { name: polylines.length === 1 ? baseName : `${layer} ${n}`, closed: !!closed[k] && vertices.length > 2, vertices, layer };
  }).filter((s) => s.vertices.length > 1);
  return { strings, has3D, skipped };
}
