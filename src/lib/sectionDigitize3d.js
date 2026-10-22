// TASKS.csv #824 — digitizing a georeferenced cross-section image IN THE 3D VIEW. Matt: "I wanna have the ability to
// have a CAD-like tool in the explicit modelling. and be able to import hand draw cross sections (we already have that)
// and draw the contacts on the section then from those contacts generate surfaces and then blocks. Basically digitize
// the cross sections in the 3d view". The image is a quad with world corners (TL, TR, BR, BL; #630); a click is the ray
// meeting the image's plane (exact, whatever else the ray passes through), so a drawn contact lies ON the section.
// The drawn polylines become hard lines of an explicit surface (#811); "Solid blocks from surfaces" (#802) makes blocks.
// World coordinates throughout ({ x: E, y: N, z: elevation }); the 3D view's scene axes are (E, elevation, -N).
// Pure: no three.js, no React.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// corners: [[E, N, Z] x 4] TL, TR, BR, BL -> { o (TL), u (unit, along the top edge), v (unit, down the left edge), n (unit
// normal), w, h (metres), centre }
export function imagePlane(corners) {
  const [tl, tr, , bl] = corners;
  const U = sub(tr, tl), V = sub(bl, tl);
  const n = unit(cross(U, V));
  const br = corners[2];
  return { o: tl, u: unit(U), v: unit(V), n, w: len(U), h: len(V), centre: [(tl[0] + br[0]) / 2, (tl[1] + br[1]) / 2, (tl[2] + br[2]) / 2] };
}

// a ray (world origin + direction) meeting the plane: the world point, or null (parallel, or behind the origin)
export function rayPlane(origin, dir, plane) {
  const d = dot(dir, plane.n);
  if (Math.abs(d) < 1e-9) return null;
  const t = dot(sub(plane.o, origin), plane.n) / d;
  if (t < 0) return null;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

// where a world point sits on the image: s along the top edge, t down (0..1 inside the image)
export function imageCoords(p, plane) {
  const q = sub(p, plane.o);
  return { s: dot(q, plane.u) / plane.w, t: dot(q, plane.v) / plane.h };
}

// The orbit camera (ViewerModule camState: eye = target + radius x (sin phi sin theta, cos phi, sin phi cos theta), scene
// axes (E, Z, -N)) square on to the image, from the side where the image reads left to right (not mirrored), the whole
// image in view with 10 % to spare. -> { theta, phi, radius, target: [E, N, Z] }
export function facingCamera(plane, { fovDeg = 45, aspect = 1.6 } = {}) {
  const toScene = ([e, nn, z]) => [e, z, -nn];
  let d = toScene(plane.n);
  const u = toScene(plane.u);
  // screen-right of a camera looking along -d is up x d (three's lookAt): it should run along the image's top edge
  if (dot(cross([0, 1, 0], d), u) < 0) d = [-d[0], -d[1], -d[2]];
  const phi = Math.acos(Math.max(-1, Math.min(1, d[1])));
  const theta = Math.atan2(d[0], d[2]);
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const radius = 1.1 * Math.max(plane.h / 2 / tanHalf, plane.w / 2 / (tanHalf * aspect));
  return { theta, phi, radius, target: plane.centre };
}

// a polyline with a point every <= step metres (its own vertices kept): what an explicit surface is built through
export function densify3(pts, step = 10) {
  const out = [];
  pts.forEach((p, i) => {
    out.push(p);
    const q = pts[i + 1];
    if (!q) return;
    const L = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z), k = Math.ceil(L / step);
    for (let j = 1; j < k; j++) { const t = j / k; out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t }); }
  });
  return out;
}

// The apparent dip (degrees) of a line drawn on a section: of its principal direction (PCA of its points), so a wiggly
// contact reads by its overall trend. Contacts drawn on near-parallel sections close together spread their points along
// the sections and up and down, so a best-fit plane through ALL of them can stand on edge across the sections; the
// lines' own dips say whether the surface is really steep. medianApparentDip(lines) -> degrees, or null without lines.
export function apparentDip(pts) {
  if (pts.length < 2) return null;
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p.x; c[1] += p.y; c[2] += p.z; }
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  // power iteration on the 3x3 covariance: the principal direction
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) { const d = [p.x - c[0], p.y - c[1], p.z - c[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const a = pts[pts.length - 1];
  let v = [a.x - pts[0].x, a.y - pts[0].y, a.z - pts[0].z];
  v = len(v) > 0 ? unit(v) : [1, 0, 0];
  for (let k = 0; k < 50; k++) v = unit([C[0][0] * v[0] + C[0][1] * v[1] + C[0][2] * v[2], C[1][0] * v[0] + C[1][1] * v[1] + C[1][2] * v[2], C[2][0] * v[0] + C[2][1] * v[1] + C[2][2] * v[2]]);
  return (Math.asin(Math.min(1, Math.abs(v[2]))) * 180) / Math.PI;
}
export function medianApparentDip(lines) {
  const d = lines.map((l) => apparentDip(l.pts || l)).filter((x) => x != null).sort((p, q) => p - q);
  return d.length ? d[d.length >> 1] : null;
}

// TASKS.csv #825 — CAD snapping on a section image. sectionSnapTargets(plane, traces, litho, { maxOffM, margin }) ->
// [{ p: { x, y, z }, kind: "contact" | "crossing", hole, md, label }]:
//   contact: a logged lithology boundary (where one interval's unit changes to the next) on a hole within maxOffM of the
//     image's plane, moved onto the plane - holes drilled along the section line are where hand-drawn contacts tie in;
//   crossing: where a hole passes through the plane.
// Only targets on the image (with `margin` of its size to spare). traces: [{ hole_id, pts: [{ md }], wx, wy, wz }] (world);
// litho: [{ hole_id, from, to, value }].
export function sectionSnapTargets(plane, traces, litho = [], { maxOffM = 15, margin = 0.05 } = {}) {
  const out = [];
  const onImage = (q) => { const c = imageCoords(q, plane); return c.s >= -margin && c.s <= 1 + margin && c.t >= -margin && c.t <= 1 + margin; };
  const off = (q) => dot(sub(q, plane.o), plane.n);
  const byHole = new Map();
  for (const r of litho || []) { if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []); byHole.get(r.hole_id).push(r); }
  for (const t of traces || []) {
    const n = t.pts?.length || 0;
    if (n < 2) continue;
    const W = (i) => [t.wx[i], t.wy[i], t.wz[i]];
    const at = (md) => {
      for (let i = 0; i < n - 1; i++) {
        const a = t.pts[i].md, b = t.pts[i + 1].md;
        if (md >= a - 0.01 && md <= b + 0.01) { const f = b > a ? (md - a) / (b - a) : 0; const p = W(i), q = W(i + 1); return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f]; }
      }
      return null;
    };
    for (let i = 0; i < n - 1; i++) { // crossings
      const p = W(i), q = W(i + 1), d0 = off(p), d1 = off(q);
      if ((d0 < 0 && d1 >= 0) || (d0 >= 0 && d1 < 0)) {
        const f = d0 / (d0 - d1), c = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f];
        if (onImage(c)) out.push({ p: { x: c[0], y: c[1], z: c[2] }, kind: "crossing", hole: t.hole_id, md: t.pts[i].md + (t.pts[i + 1].md - t.pts[i].md) * f, label: t.hole_id });
      }
    }
    const rows = (byHole.get(t.hole_id) || []).filter((r) => Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to))).sort((a, b) => a.from - b.from);
    for (let k = 1; k < rows.length; k++) { // contacts: where the unit changes, at the top of the lower interval
      const above = rows[k - 1], below = rows[k];
      if (String(above.value) === String(below.value) || Math.abs(Number(above.to) - Number(below.from)) > 0.5) continue;
      const w = at(Number(below.from));
      if (!w) continue;
      const d = off(w);
      if (Math.abs(d) > maxOffM) continue;
      const c = [w[0] - d * plane.n[0], w[1] - d * plane.n[1], w[2] - d * plane.n[2]];
      if (onImage(c)) out.push({ p: { x: c[0], y: c[1], z: c[2] }, kind: "contact", hole: t.hole_id, md: Number(below.from), label: `${t.hole_id} ${above.value} | ${below.value} @ ${Number(below.from).toFixed(1)} m` });
    }
  }
  return out;
}

// Shift held: the new segment from `prev` is turned to the nearest multiple of `stepDeg` on the image (0 = along the
// section, 90 = vertical), keeping its length along that direction.
export function constrainOnImage(prev, p, plane, stepDeg = 45) {
  const d = [p.x - prev.x, p.y - prev.y, p.z - prev.z];
  const a = dot(d, plane.u), b = dot(d, plane.v);
  const ang = Math.atan2(b, a), step = (stepDeg * Math.PI) / 180, snapped = Math.round(ang / step) * step;
  const dir = [Math.cos(snapped), Math.sin(snapped)], l = a * dir[0] + b * dir[1];
  return { x: prev.x + (plane.u[0] * dir[0] + plane.v[0] * dir[1]) * l, y: prev.y + (plane.u[1] * dir[0] + plane.v[1] * dir[1]) * l, z: prev.z + (plane.u[2] * dir[0] + plane.v[2] * dir[1]) * l };
}

// ---- TASKS.csv #828 — CAD line editing on a section image (pure; points are world { x, y, z } on the image plane) ----

// Where the ground crosses a vertical section image: the terrain profile along the image's top edge, as world points on
// the plane (n samples across its width). [] for an image that is not near-vertical or a terrain that does not reach it.
export function groundProfileOnImage(plane, groundAt, n = 200) {
  if (Math.abs(plane.n[2]) > 0.1 || !groundAt) return [];
  const out = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n, e = plane.o[0] + plane.u[0] * s * plane.w, nn = plane.o[1] + plane.u[1] * s * plane.w;
    const z = groundAt(e, nn);
    if (Number.isFinite(z)) out.push({ x: e, y: nn, z });
  }
  return out.length >= 2 ? out : [];
}

// nearest point on a 2D polyline [[x, y]] to q: { i (segment), t (0..1 along it), d (distance) } or null
export function nearestOnPolyline(pts, q) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0;
    const d = Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1]);
    if (!best || d < best.d) best = { i, t, d };
  }
  return best;
}
const lerp3 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
export const pointOnSegment = (pts, i, t) => lerp3(pts[i], pts[i + 1], t);

// insert p after segment i
export const insertPoint = (pts, i, p) => [...pts.slice(0, i + 1), p, ...pts.slice(i + 1)];

// split at an interior vertex: two lines sharing that vertex; null at an end (nothing to split)
export function splitAt(pts, vi) {
  if (vi <= 0 || vi >= pts.length - 1) return null;
  return [pts.slice(0, vi + 1), pts.slice(vi)];
}

// join line a at its end endA ("start" | "end") to line b at endB: one line running from a's far end through to b's far
// end; the two touching points merge when they are within tol metres
export function joinLines(a, endA, b, endB, tol = 0.01) {
  const A = endA === "end" ? a : [...a].reverse(); // A ends at the join
  const B = endB === "start" ? b : [...b].reverse(); // B starts at the join
  const p = A[A.length - 1], q = B[0];
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) <= tol ? [...A, ...B.slice(1)] : [...A, ...B];
}

// Extend (or trim) line `pts` at `end` along its end segment until it meets `target` (another line), in the image's own
// 2D frame: the hit of that ray (forwards, or backwards no further than the previous point) nearest the end point.
// When the ray misses, the end point moves to the nearest point of the target. Returns the new points.
export function extendTo(pts, end, target, plane) {
  const P = end === "end" ? pts : [...pts].reverse();
  const to2 = (p) => { const d = sub([p.x, p.y, p.z], plane.o); return [dot(d, plane.u), dot(d, plane.v)]; };
  const from2 = ([s, t]) => ({ x: plane.o[0] + plane.u[0] * s + plane.v[0] * t, y: plane.o[1] + plane.u[1] * s + plane.v[1] * t, z: plane.o[2] + plane.u[2] * s + plane.v[2] * t });
  const e = to2(P[P.length - 1]), f = to2(P[P.length - 2] || P[P.length - 1]);
  const dir = [e[0] - f[0], e[1] - f[1]], T = target.map(to2);
  let hit = null;
  if (Math.hypot(dir[0], dir[1]) > 1e-9) {
    for (let i = 0; i < T.length - 1; i++) {
      const a = T[i], b = T[i + 1], s = [b[0] - a[0], b[1] - a[1]];
      const den = dir[0] * s[1] - dir[1] * s[0];
      if (Math.abs(den) < 1e-12) continue;
      const w = [a[0] - e[0], a[1] - e[1]];
      const k = (w[0] * s[1] - w[1] * s[0]) / den, u = (w[0] * dir[1] - w[1] * dir[0]) / den; // e + k dir = a + u s
      if (u < -1e-9 || u > 1 + 1e-9 || k < -1) continue;
      const len = Math.abs(k) * Math.hypot(dir[0], dir[1]);
      if (!hit || len < hit.len) hit = { p: [e[0] + k * dir[0], e[1] + k * dir[1]], len };
    }
  }
  if (!hit) { const nn = nearestOnPolyline(T, e); hit = { p: [T[nn.i][0] + (T[nn.i + 1][0] - T[nn.i][0]) * nn.t, T[nn.i][1] + (T[nn.i + 1][1] - T[nn.i][1]) * nn.t] }; }
  const out = [...P.slice(0, -1), from2(hit.p)];
  return end === "end" ? out : out.reverse();
}
