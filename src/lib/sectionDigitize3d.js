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
