// TASKS.csv #139 — FENCE / PANEL DIAGRAM GEOMETRY.
//
// The projection math behind the hole-to-hole lithology correlation panel. Lives here, not in the
// component, for the usual reason this codebase splits things that way: a best-fit line and a set of
// projected distances have checkable right answers, so they get verified in plain Node against cases
// worked out by hand BEFORE any SVG exists (see the TASKS.csv #139 notes for the numbers).
//
// THE CENTRAL HONESTY PROBLEM: HOLES ARE NEVER COLLINEAR.
// A fence diagram flattens a 3D set of holes onto a single vertical plane. That plane is a lie of
// exactly the size of each hole's perpendicular distance from it — a hole 80 m off the section line is
// drawn as though it sat on the line, and any contact correlated across it inherits that 80 m of
// horizontal error. Software that hides this is how people end up correlating units that are nowhere
// near each other in space.
//
// So this module does three things rather than one:
//   1. Chooses the panel line honestly — by TOTAL LEAST SQUARES (the principal axis of the collar
//      cloud in plan), not ordinary least squares. OLS minimises vertical (northing) residuals only,
//      which makes the fitted line depend on which way you happen to have the map turned and blows up
//      entirely for a north-south drill line (infinite slope). The principal axis is rotation-
//      invariant and always defined, which is the only sane behaviour when "the drill line" could run
//      any direction. The user can also just type an azimuth when they know the section they want.
//   2. Returns each hole's PERPENDICULAR OFFSET from that line, signed, so the UI can show it per hole
//      and flag the ones that are being distorted most. That number is the diagram's error bar.
//   3. Projects the whole desurveyed TRACE, not just the collar. An inclined hole wanders in plan as
//      it goes down, so its offset at the toe is usually not its offset at the collar; drawing it as a
//      straight vertical bar under its collar would misplace every deep contact. Each trace vertex is
//      projected independently, so a hole drilled along the section leans across the panel the way it
//      actually does in the ground.
//
// Coordinates in: real-world easting/northing/elevation (the frame collars are in). Coordinates out:
// `s` metres along the section line and `z` metres elevation — a true-scale vertical panel, so a 45°
// hole is drawn at 45°.

const EPS = 1e-12;

/**
 * Principal axis (total-least-squares line) of a set of plan-view points.
 * @param {Array<{x:number,y:number}>} pts
 * @returns {{origin:{x,y}, dir:{x,y}, azimuth:number}|null} dir is a unit vector; azimuth is the
 *   compass bearing of dir in degrees (0 = north, 90 = east), normalised to [0,180).
 */
export function bestFitLine(pts) {
  const n = pts?.length || 0;
  if (n < 2) return null;
  let mx = 0, my = 0;
  for (const p of pts) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  // Covariance of the centred cloud. The principal eigenvector of [[sxx,sxy],[sxy,syy]] is the axis
  // that minimises the sum of SQUARED PERPENDICULAR distances — which is the line a geologist means by
  // "the drill line", and unlike a y-on-x regression it does not care how the map is rotated.
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  let dirx, diry;
  if (Math.abs(sxy) < EPS) {
    // Already axis-aligned: the principal axis is whichever of x/y has the larger spread. Handled
    // explicitly because the general formula below is 0/0 here.
    if (sxx >= syy) { dirx = 1; diry = 0; } else { dirx = 0; diry = 1; }
  } else {
    // Largest eigenvalue of a symmetric 2x2, then its eigenvector.
    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const lam = tr / 2 + Math.sqrt(Math.max(0, (tr / 2) * (tr / 2) - det));
    dirx = lam - syy; diry = sxy;
    const L = Math.hypot(dirx, diry);
    if (L < EPS) { dirx = 1; diry = 0; } else { dirx /= L; diry /= L; }
  }
  const L2 = Math.hypot(dirx, diry) || 1;
  dirx /= L2; diry /= L2;
  return { origin: { x: mx, y: my }, dir: { x: dirx, y: diry }, azimuth: dirToAzimuth(dirx, diry) };
}

/** Unit direction -> compass bearing in [0,180). A section line has no "forward", so 200° and 20° are
 *  the same section and are reported identically rather than as two different answers. */
export function dirToAzimuth(dx, dy) {
  let a = (Math.atan2(dx, dy) * 180) / Math.PI; // atan2(east, north) = compass bearing
  a = ((a % 180) + 180) % 180;
  return a;
}

/** Compass bearing (degrees, 0 = north) -> unit direction in (easting, northing). */
export function azimuthToDir(azDeg) {
  const r = (azDeg * Math.PI) / 180;
  return { x: Math.sin(r), y: Math.cos(r) };
}

/**
 * Project one plan point onto the section line.
 * @returns {{s:number, offset:number}} s = signed metres along `dir` from the line origin;
 *   offset = signed perpendicular metres (positive to the LEFT of `dir`, i.e. the standard 2D cross
 *   product sign, so the sign is meaningful and consistent, not just a magnitude).
 */
export function projectToLine(p, line) {
  const dx = p.x - line.origin.x, dy = p.y - line.origin.y;
  return {
    s: dx * line.dir.x + dy * line.dir.y,
    offset: line.dir.x * dy - line.dir.y * dx,
  };
}

/**
 * Build the whole panel: every selected hole's trace projected into (s, elevation), in drill-line
 * order, plus the numbers the UI needs to be honest about the projection.
 *
 * @param traces  [{hole_id, md[], wx[], wy[], wz[]}] — real-world desurveyed traces. Taken as arrays
 *                rather than desurveyed here on purpose: ViewerModule has already built these once for
 *                the 3D scene, and re-desurveying would be both wasted work and a second place for the
 *                answer to drift from what is drawn in 3D.
 * @param opts.azimuth  fixed section bearing in degrees; omit to fit the principal axis of the collars
 * @returns {{line, holes:[{hole_id, s, offset, maxAbsOffset, pts:[{md,s,z,offset}]}], sRange, zRange}}
 */
export function buildFencePanel(traces, opts = {}) {
  const usable = (traces || []).filter((t) => t && t.wx && t.wx.length > 0);
  if (usable.length < 1) return null;
  const collars = usable.map((t) => ({ x: t.wx[0], y: t.wy[0] }));

  let line;
  if (opts.azimuth != null && Number.isFinite(opts.azimuth)) {
    // A typed azimuth still needs an origin; use the collar centroid so `s` stays centred on the data
    // rather than running off to some arbitrary coordinate.
    const mx = collars.reduce((a, c) => a + c.x, 0) / collars.length;
    const my = collars.reduce((a, c) => a + c.y, 0) / collars.length;
    const dir = azimuthToDir(opts.azimuth);
    line = { origin: { x: mx, y: my }, dir, azimuth: dirToAzimuth(dir.x, dir.y) };
  } else {
    line = bestFitLine(collars);
    // One hole (or several stacked at one spot) has no principal axis. Fall back to due north rather
    // than returning null — a single-hole "fence" is a legitimate, if degenerate, thing to look at.
    if (!line) line = { origin: { x: collars[0].x, y: collars[0].y }, dir: { x: 0, y: 1 }, azimuth: 0 };
  }

  const holes = usable.map((t) => {
    const pts = [];
    let maxAbsOffset = 0;
    for (let i = 0; i < t.wx.length; i++) {
      const pr = projectToLine({ x: t.wx[i], y: t.wy[i] }, line);
      if (Math.abs(pr.offset) > maxAbsOffset) maxAbsOffset = Math.abs(pr.offset);
      pts.push({ md: t.md ? t.md[i] : i, s: pr.s, z: t.wz[i], offset: pr.offset });
    }
    return { hole_id: t.hole_id, s: pts[0].s, offset: pts[0].offset, maxAbsOffset, pts };
  });
  // Drill-line order — the whole point of the panel is that adjacent columns are adjacent in the
  // ground, so a correlation drawn between them is a plausible one.
  holes.sort((a, b) => a.s - b.s);

  let smin = Infinity, smax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const h of holes) for (const p of h.pts) {
    if (p.s < smin) smin = p.s; if (p.s > smax) smax = p.s;
    if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z;
  }
  return { line, holes, sRange: { min: smin, max: smax }, zRange: { min: zmin, max: zmax } };
}

/**
 * Position along a projected hole at an arbitrary downhole depth, by linear interpolation between
 * trace vertices — how a lithology interval's from/to depths become panel coordinates.
 */
export function panelPointAtDepth(hole, md) {
  const pts = hole?.pts;
  if (!pts || !pts.length) return null;
  if (md <= pts[0].md) return { s: pts[0].s, z: pts[0].z };
  const last = pts[pts.length - 1];
  if (md >= last.md) return { s: last.s, z: last.z };
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md && md <= pts[i + 1].md) {
      const span = pts[i + 1].md - pts[i].md, f = span <= 0 ? 0 : (md - pts[i].md) / span;
      return { s: pts[i].s + (pts[i + 1].s - pts[i].s) * f, z: pts[i].z + (pts[i + 1].z - pts[i].z) * f };
    }
  }
  return { s: last.s, z: last.z };
}

/**
 * Correlation bands: for each lithology code present in BOTH of two adjacent holes, the quadrilateral
 * joining the code's shallowest occurrence in one to its shallowest occurrence in the other.
 *
 * Deliberately conservative, and the reason is worth stating: a correlation line is an INTERPRETATION,
 * not a measurement. This draws only the simplest defensible one — same code, adjacent holes, first
 * (shallowest) occurrence in each — and leaves everything else to the geologist. It does not attempt to
 * match repeated occurrences of a unit (fault repetition, interbedding), because guessing which of
 * three BSL intervals in hole A corresponds to which of two in hole B is exactly the judgement call
 * this tool has no business making silently.
 *
 * @param a,b  adjacent projected holes (from buildFencePanel), in drill-line order
 * @param byHole  {hole_id: [{value, from, to}]} lithology intervals
 */
export function correlationBands(a, b, byHole) {
  const ra = (byHole[a.hole_id] || []), rb = (byHole[b.hole_id] || []);
  const firstOf = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = String(r.value ?? "").trim();
      if (!k) continue;
      if (!m.has(k) || r.from < m.get(k).from) m.set(k, r);
    }
    return m;
  };
  const ma = firstOf(ra), mb = firstOf(rb);
  const out = [];
  ma.forEach((ia, code) => {
    const ib = mb.get(code);
    if (!ib) return;
    const aTop = panelPointAtDepth(a, ia.from), aBot = panelPointAtDepth(a, ia.to);
    const bTop = panelPointAtDepth(b, ib.from), bBot = panelPointAtDepth(b, ib.to);
    if (!aTop || !bTop || !aBot || !bBot) return;
    out.push({ code, aTop, aBot, bTop, bBot });
  });
  return out;
}
