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

// ============================================================
// TASKS.csv #236 — mean vector / Fisher statistics for a set of structural picks. This was the
// Stereonet's own original justification (see #141/#178: "is a declared anisotropy trend actually
// representative of the picks, or an outlier?") and was the one sub-item of #236 left unimplemented.
//
// CRITICAL SUBTLETY, and the reason this isn't just "average the pole vectors": poles to planes are
// AXIAL data, not directed vectors — a pole and its exact antipode describe the SAME plane, so a naive
// vector mean is wrong and can collapse toward zero for a perfectly well-clustered population. The
// classic failure case: two planes both dipping ~89° in nearly opposite dip directions are nearly the
// same plane, but their lower-hemisphere pole vectors sit on opposite sides of the net and would
// cancel out under vector averaging. The correct standard treatment for axial data is the ORIENTATION
// TENSOR (a.k.a. the "moment of inertia"/scatter matrix method — Scheidegger 1965, Watson 1966, and
// the standard reference here, Allmendinger et al. "Structural Geology Algorithms" ch. 7): build
// T = Σ vᵢ⊗vᵢ (a 3×3 symmetric matrix, which is invariant to flipping any vᵢ → −vᵢ, exactly the
// property axial data needs), and take its principal eigenvector as the mean axis.
//
// Fisher's own k / α95 ARE still reported (they're what a geologist expects to see, and are what
// quantify "how tight is this cluster"), but computed only AFTER flipping every vector into the same
// hemisphere as that eigenvector-derived mean axis — the standard way Fisher statistics are applied to
// axial data. Reported honestly as such rather than pretending raw directed-vector Fisher applies.
function jacobiEigenSymmetric3(m) {
  // Jacobi rotation for a symmetric 3×3. Chosen over an analytical/closed-form cubic solution because
  // it's numerically stable for the degenerate cases this actually hits in practice (a perfectly
  // clustered population gives two near-equal eigenvalues; a girdle gives a different near-degenerate
  // pair), and over power iteration because we want ALL three eigenvalues — the eigenvalue RATIOS are
  // what distinguish a point cluster from a girdle (see the shape reporting in fisherStats below).
  let a = [[m[0][0], m[0][1], m[0][2]], [m[1][0], m[1][1], m[1][2]], [m[2][0], m[2][1], m[2][2]]];
  let v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const out = [0, 1, 2].map((i) => ({ value: a[i][i], vector: { x: v[0][i], y: v[1][i], z: v[2][i] } }));
  out.sort((p, q) => q.value - p.value); // descending: [0] = principal
  return out;
}

// picks: [{ dip, azimuth }] where azimuth is DIP DIRECTION (same convention as everything above).
// Returns null when there aren't at least 2 usable picks (statistics on 0 or 1 orientation are
// meaningless, and a caller showing "k = ∞, α95 = 0°" off a single pick would be actively misleading).
export function fisherStats(picks) {
  const vecs = [];
  (picks || []).forEach((p) => {
    if (p.dip == null || p.azimuth == null || isNaN(p.dip) || isNaN(p.azimuth)) return;
    const { trend, plunge } = poleTrendPlunge(Number(p.azimuth), Number(p.dip));
    vecs.push(trendPlungeToVec(trend, plunge));
  });
  const n = vecs.length;
  if (n < 2) return null;

  // Orientation tensor T = Σ vᵢ⊗vᵢ — invariant to vᵢ → −vᵢ, which is what makes this valid for axial data.
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  vecs.forEach((v) => {
    const c = [v.x, v.y, v.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[i][j] += c[i] * c[j];
  });
  const eig = jacobiEigenSymmetric3(T);
  // Normalized eigenvalues sum to 1 (since trace(T) = Σ|vᵢ|² = n for unit vectors) — these are the
  // standard S1≥S2≥S3 shape parameters: S1≈1 is a tight point cluster (one dominant orientation);
  // S1≈S2≫S3 is a girdle (picks spread along a great circle, i.e. a fold axis situation); all three
  // roughly equal is an isotropic/random spread with no meaningful mean.
  const [s1, s2, s3] = eig.map((e) => e.value / n);

  // Mean axis, forced to the lower hemisphere so it's directly comparable to the plotted poles (an
  // eigenvector's sign is arbitrary — for axial data both signs are equally valid answers).
  let mv = eig[0].vector;
  if (mv.z > 0) mv = { x: -mv.x, y: -mv.y, z: -mv.z };
  const mean = vecToTrendPlunge(mv);

  // Fisher k / α95 on hemisphere-aligned vectors (see this section's header comment for why the
  // alignment step is required before Fisher's directed-vector statistics can be applied here).
  let Rx = 0, Ry = 0, Rz = 0;
  vecs.forEach((v) => {
    const dot = v.x * mv.x + v.y * mv.y + v.z * mv.z;
    const s = dot < 0 ? -1 : 1; // flip into the mean's hemisphere
    Rx += s * v.x; Ry += s * v.y; Rz += s * v.z;
  });
  const R = Math.hypot(Rx, Ry, Rz);
  const Rbar = R / n; // 0 = no preferred orientation, 1 = all picks identical
  // Fisher (1953) concentration parameter. The (n-1)/(n-R) estimator is the standard one; guarded
  // because a perfectly clustered population gives R === n exactly, which would divide by zero.
  const k = n - R > 1e-9 ? (n - 1) / (n - R) : Infinity;
  // 95% confidence cone half-angle about the mean direction (Fisher 1953). Same guard reasoning:
  // R === n means zero scatter, so the cone collapses to 0°.
  let alpha95 = 0;
  if (R > 1e-9 && n - R > 1e-9) {
    const inner = ((n - R) / R) * (Math.pow(1 / 0.05, 1 / (n - 1)) - 1);
    const cosA = 1 - inner;
    alpha95 = cosA <= -1 ? 180 : cosA >= 1 ? 0 : toDeg(Math.acos(cosA));
  }

  // The mean PLANE that this mean pole represents — inverse of poleTrendPlunge — since a structural
  // geologist reading a pole plot ultimately wants the plane's own dip direction/dip back out (and
  // it's what the anisotropy-trend tools this feature exists to sanity-check actually consume).
  const meanDipDir = (mean.trend + 180) % 360;
  const meanDip = 90 - mean.plunge;

  return {
    n,
    meanTrend: mean.trend, meanPlunge: mean.plunge,
    meanDipDir, meanDip,
    R, Rbar, k, alpha95,
    s1, s2, s3,
  };
}
