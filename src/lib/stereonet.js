// Stereonet math for structural pick QC (TASKS.csv #141). Leapfrog-specialist audit finding: structure
// picks (dip/azimuth) feed the anisotropy and structural-surface tools, but there was no pole-plot/
// great-circle plot to actually interpret those orientations before committing to a trend. Users were
// flying blind on whether a declared anisotropy azimuth/dip, or a structural-tool target, is actually
// representative of the underlying picks or an outlier.
//
// All conventions here follow the standard structural-geology "right-hand rule" dip-direction/dip
// convention already used throughout this codebase (see searchEllipsoidBasis, anisoWarpDirection):
// dip direction (a.k.a. dip azimuth) is a compass bearing 0-360 (0/360 = north, 90 = east) giving the
// direction of steepest descent of the plane; dip is the angle 0-90 below horizontal. A LINE (trend/
// plunge) uses the same trend convention with plunge 0-90 measured downward from horizontal.
//
// Coordinate frame used internally: X = east, Y = north, Z = up (a standard right-handed ENU frame,
// unrelated to and not to be confused with GeoStrix's own internal 3D-scene coordinate frame elsewhere
// in this codebase — this module is pure trend/plunge/dip-direction math, no scene coordinates involved
// at all). A line with trend T and plunge P converts to this frame as:
//   x = sin(T)*cos(P), y = cos(T)*cos(P), z = -sin(P)
// (z negative = pointing down, matching P measured positive-downward — verified this is a unit vector
// for any T/P: x^2+y^2+z^2 = cos^2(P)*(sin^2(T)+cos^2(T)) + sin^2(P) = cos^2(P)+sin^2(P) = 1.)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function trendPlungeToVec(trendDeg, plungeDeg) {
  const t = toRad(trendDeg), p = toRad(plungeDeg);
  return { x: Math.sin(t) * Math.cos(p), y: Math.cos(t) * Math.cos(p), z: -Math.sin(p) };
}

function vecToTrendPlunge(v) {
  // Normalize defensively (callers pass unit vectors, but floating point drift is cheap to correct).
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  const x = v.x / n, y = v.y / n, z = v.z / n;
  const plunge = toDeg(Math.asin(Math.max(-1, Math.min(1, -z)))); // -z since z is up, plunge is down
  let trend = toDeg(Math.atan2(x, y));
  if (trend < 0) trend += 360;
  return { trend, plunge };
}

// Pole to a plane, in trend/plunge (standard structural-geology relation, e.g. Allmendinger et al.,
// "Structural Geology Algorithms"): the pole's trend is the dip direction rotated 180°, and its plunge
// is the complement of the dip. Verified by hand against two textbook cases: a horizontal plane
// (dip 0) has a vertical pole (plunge 90, trend irrelevant/undefined at the pole point — this formula
// still returns a consistent trend, which is fine since trend has no visual effect exactly at the net
// center); and a plane dipping 30° due north (dipDir 0) gives pole trend 180 (due south), pole plunge
// 60 — cross-checked independently via d x s vector algebra (dip vector cross strike vector) before
// this formula was written, not derived from the formula itself.
export function poleTrendPlunge(dipDirDeg, dipDeg) {
  return { trend: (dipDirDeg + 180) % 360, plunge: 90 - dipDeg };
}

// Stereographic projection of a trend/plunge direction onto the net, LOWER HEMISPHERE, returned as
// {x, y} in a unit-radius disk (x = east, y = north, matching how the net is normally drawn with north
// at the top). `projection` is "equalArea" (Schmidt/Lambert — the structural-geology standard, used for
// unbiased density when picks are later contoured) or "equalAngle" (Wulff — preserves angles/circles,
// used less often for pole plots but included since it's a one-line difference and some geologists
// prefer it for great-circle intersections). Both reduce to r=1 at plunge 0 (net edge) and r=0 at
// plunge 90 (net center) — verified directly at those two boundary values below (in stereonet's own
// hand tests), not just derived from the general formula.
export function projectLowerHemisphere(trendDeg, plungeDeg, projection = "equalArea") {
  const p = toRad(Math.max(0, Math.min(90, plungeDeg)));
  const r = projection === "equalAngle"
    ? Math.tan(Math.PI / 4 - p / 2)
    : Math.SQRT2 * Math.sin(Math.PI / 4 - p / 2);
  const t = toRad(trendDeg);
  return { x: r * Math.sin(t), y: r * Math.cos(t) };
}

// Convenience: project a plane's POLE directly from dip direction/dip.
export function projectPole(dipDirDeg, dipDeg, projection = "equalArea") {
  const { trend, plunge } = poleTrendPlunge(dipDirDeg, dipDeg);
  return projectLowerHemisphere(trend, plunge, projection);
}

// Great-circle trace of a plane (dip direction/dip) on the lower-hemisphere net, as an ordered array of
// {x,y} points ready to draw as a polyline (NOT closed — a plane's great circle only has a full
// lower-hemisphere arc, from one strike endpoint to the other through the point of maximum dip; the
// other half of the full circle is the upper-hemisphere mirror and isn't drawn, matching standard
// stereonet convention).
//
// Method: build two orthonormal unit vectors that lie IN the plane — the dip vector d (trend=dipDir,
// plunge=dip; the line of maximum dip) and the strike vector s (horizontal, trend=dipDir-90, plunge 0;
// perpendicular to d since sin/cos of a 90°-shifted angle are swapped-and-negated). Every point on the
// plane's great circle is v(θ) = cos(θ)·d + sin(θ)·s for θ in [0°,360°). Restricting θ to [-90°,90°]
// keeps v on the lower hemisphere throughout (v_z(θ) = -sin(dip)·cos(θ), which is ≤0 for any dip in
// [0,90] and any θ in [-90,90] — verified algebraically, not just by sampling: cos(θ)≥0 on that range
// and sin(dip)≥0 for a valid dip, so their product's negation is always ≤0). At θ=0 this passes through
// the dip vector itself (deepest point of the arc, plunge = the plane's own dip); at θ=±90 it reaches
// the two strike-line endpoints on the net's outer edge (plunge 0).
export function greatCirclePoints(dipDirDeg, dipDeg, projection = "equalArea", steps = 60) {
  const d = trendPlungeToVec(dipDirDeg, dipDeg);
  const s = trendPlungeToVec(dipDirDeg - 90, 0);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const theta = toRad(-90 + (180 * i) / steps);
    const c = Math.cos(theta), sn = Math.sin(theta);
    const v = { x: c * d.x + sn * s.x, y: c * d.y + sn * s.y, z: c * d.z + sn * s.z };
    const { trend, plunge } = vecToTrendPlunge(v);
    pts.push(projectLowerHemisphere(trend, plunge, projection));
  }
  return pts;
}
