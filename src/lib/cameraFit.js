// TASKS.csv #313 — camera-framing maths for the 3D viewport, pulled out of ViewerModule so it can be
// (and was) hand-verified in plain Node per CLAUDE.md's verification discipline. EVERYTHING HERE IS
// PURE: no THREE, no DOM, no React. ViewerModule owns the only THREE-facing wrappers around it.
//
// WHY fitBox()'s OWN MATHS WAS LEFT ALONE — this is the load-bearing finding of #313, and the thing
// to read before "improving" fitBox in future:
// fitBox uses `radius = boxDiagonal * 1.3`, which reads like "a conservative diagonal bound plus a
// further 30% of padding on top". It is not. 1 / (2 sin(fov/2)) at the app's 45 deg vertical fov is
// 1.3066, so `diagonal * 1.3` is the distance at which the box's BOUNDING SPHERE exactly fills the
// frustum height — no padding at all. It was checked against the exact per-corner perspective fit
// (each corner p must satisfy |p.screenAxis| <= (R - p.forward) tan(halfFov), maximised over all 8
// corners and both screen axes) swept over every orbit orientation for the harry_property extent:
// that exact fit ranges 2908 m (looking down the long axis) to 5029 m (worst angle), and the diagonal
// rule's 5007 m sits within 0.4% of the worst case. In other words `diagonal * 1.3` already IS,
// to within half a percent, the tightest radius that frames the data from every possible angle, and
// at the default view angle the exact fit would only buy 7% (5007 -> 4664 m; a lithology tube goes
// from 0.81 px to 0.87 px). Rewriting fitBox to fit the real box dimensions would therefore trade
// orientation independence — which every one of its callers, all of them explicit user "zoom to
// this" actions, benefits from — for a change nobody can see. So the entire #313 fix lives on the
// INITIAL AUTO-FIT path instead, using the two functions below.
//
// The actual problem #313 exists for is not the fit's accuracy, it is the fit's GOAL. On the bundled
// 37-hole harry_property sample, framing the whole ~3.9 km-diagonal property puts the camera ~5.0 km
// out at ~5.4 m per pixel, which draws a 4.4 m-diameter lithology tube 0.8 px wide — a bare hairline
// indistinguishable from the trace line running down its own axis. A previous session read exactly
// that picture as "the renderer is broken" and dispatched an agent after a bug that did not exist.
// "Everything is on screen" and "the data is legible" are genuinely in conflict on a property this
// size, and #313 resolves it in favour of legibility for the opening view only.

const DEG = Math.PI / 180;

// The LARGEST orbit radius at which a feature `worldDiameter` metres across still covers at least
// `minPx` pixels vertically on screen, given the camera's vertical fov and the viewport's pixel
// height. Inverse of figureScale.js's metresPerPixelAtTarget(), and exact at the same one depth (the
// orbit target) for the same reason documented there.
//   metresPerPixel = 2 * R * tan(fov/2) / pixelHeight   ->   R = d/minPx * pixelHeight / (2 tan(fov/2))
export function legibilityRadius(worldDiameter, minPx, fovDeg = 45, pixelHeight = 800) {
  if (!(worldDiameter > 0) || !(minPx > 0) || !(fovDeg > 0) || !(pixelHeight > 0)) return null;
  return (worldDiameter / minPx) * (pixelHeight / (2 * Math.tan((fovDeg * DEG) / 2)));
}

// Where the data actually IS, as opposed to where the middle of its bounding box is.
//
// Needed because #313's fix zooms the OPENING view in past "everything fits" on a large property, and
// the centre of the overall bounding box is a bad place to point a zoomed-in camera: real exploration
// drilling is clustered, and the midpoint of two clusters is the empty ground between them. On the
// bundled harry_property sample the collars form a 26-hole cluster and a 6-hole cluster ~2 km north of
// it; the bbox centre lands in the sparse gap, so a naive zoom-in would frame mostly bare terrain and
// reproduce "where is my data" in a new form.
//
// Method: bin the points into `cell`-sized boxes, take the fullest bin as a seed, then run a few
// mean-shift iterations (centroid of everything within `cell` of the seed) so a cluster that straddles
// a bin boundary is not split by the arbitrary grid origin. Deterministic, and O(iterations * n) with
// no allocation per point beyond the bin map — it runs once per project load, right after a geometry
// rebuild that costs far more.
export function densestCentre(points, cell, iterations = 4) {
  if (!points || !points.length) return null;
  if (!(cell > 0)) cell = 1;
  const bins = new Map();
  let bestKey = null, bestCount = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    const key = `${Math.floor(p.x / cell)}|${Math.floor(p.y / cell)}|${Math.floor(p.z / cell)}`;
    let b = bins.get(key);
    if (!b) { b = { n: 0, x: 0, y: 0, z: 0 }; bins.set(key, b); }
    b.n++; b.x += p.x; b.y += p.y; b.z += p.z;
    // ties resolved by first-seen bin, which is deterministic for a given point order
    if (b.n > bestCount) { bestCount = b.n; bestKey = key; }
  }
  if (!bestKey) return null;
  const b0 = bins.get(bestKey);
  let c = { x: b0.x / b0.n, y: b0.y / b0.n, z: b0.z / b0.n };
  for (let it = 0; it < iterations; it++) {
    let n = 0, sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
      if (Math.abs(p.x - c.x) > cell || Math.abs(p.y - c.y) > cell || Math.abs(p.z - c.z) > cell) continue;
      n++; sx += p.x; sy += p.y; sz += p.z;
    }
    if (!n) break;
    const next = { x: sx / n, y: sy / n, z: sz / n };
    const moved = Math.abs(next.x - c.x) + Math.abs(next.y - c.y) + Math.abs(next.z - c.z);
    c = next;
    if (moved < cell * 0.01) break;
  }
  return c;
}
