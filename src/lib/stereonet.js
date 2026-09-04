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

// Exported (TASKS.csv #230) so the true-width calculation can build a structure's pole vector in this
// SAME east/north/up frame — desurveyHole's world output uses the identical convention (x = easting,
// y = northing, z = elevation/up), so a dot product between the two is directly meaningful.
export function trendPlungeToVec(trendDeg, plungeDeg) {
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

// Inverse of projectLowerHemisphere (TASKS.csv #141, density contouring): a point {x, y} inside the
// unit-radius net disk back to the trend/plunge of the lower-hemisphere direction it represents. Needed
// so the contour grid can be sampled on a regular grid of NET (2D) positions — which is what actually
// gets painted — and each cell asked "which direction on the sphere are you?". Radius is clamped to
// [0,1] so a cell centre that sits a hair outside the primitive (grid cells straddling the net edge)
// resolves to plunge 0 instead of NaN. Round-trip verified against projectLowerHemisphere in the
// Node hand-test for both projections (see that task's notes).
export function netToTrendPlunge(x, y, projection = "equalArea") {
  const r = Math.min(1, Math.hypot(x, y));
  const plunge = projection === "equalAngle"
    ? Math.PI / 2 - 2 * Math.atan(r)
    : Math.PI / 2 - 2 * Math.asin(Math.min(1, r / Math.SQRT2));
  let trend = toDeg(Math.atan2(x, y));
  if (trend < 0) trend += 360;
  return { trend, plunge: toDeg(plunge) };
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

// ============================================================
// TASKS.csv #280 — TERZAGHI SAMPLING-BIAS CORRECTION.
//
// THE PROBLEM. Every structure pick in GeoStrix comes from a drillhole intersection, never from
// outcrop mapping. A drillhole is a 1-D sample line through a 3-D rock mass, and a line samples a set
// of parallel planes at a rate proportional to sin(α), where α is the acute angle between the line and
// the planes (this is just the geometry of how many planes of a given spacing a line of given length
// can cross: a hole normal to a fracture set — α = 90° — crosses one plane per spacing, while a hole
// running nearly along the set — α → 0° — crosses almost none, even though the set may be the most
// abundant fabric in the rock). So a raw drillhole pole plot systematically UNDER-represents structures
// sub-parallel to the hole and OVER-represents those near-perpendicular to it, and the "dominant"
// orientation a raw stereonet shows can genuinely be an artefact of hole orientation rather than of
// geology — the exact failure mode this correction exists to remove.
//
// THE FIX (Terzaghi 1965, "Sources of error in joint surveys", Géotechnique 15). Weight each
// observation by the reciprocal of its sampling probability, w = 1/sin(α), so a structure the hole was
// half as likely to intersect counts twice. This is the standard correction in every rock-mechanics
// and structural package (Dips, Stereonet, FracMan) and is applied identically here to BOTH the
// orientation tensor (fisherStats) and the density count (kambContourGrid).
//
// THE CAP, and why it is not optional. As α → 0 the weight diverges (1/sin 0 = ∞): a single pick made
// at a blind angle to the hole would otherwise swamp the entire population. Terzaghi's own paper
// already notes this, and every implementation caps it. `maxWeight` (default 8, i.e. every structure
// within α ≈ 7.2° of parallel to its hole is treated as 8 observations and no more) is the cap;
// the alternative convention of a "minimum α" is exactly equivalent — α_min = asin(1/maxWeight) — and
// is reported back to the caller so the UI can state the blind-zone angle honestly. Nothing inside the
// blind zone is recoverable by weighting: if a structural set is genuinely parallel to every hole on
// the property, no arithmetic will conjure it into the data, and the correct answer is to drill a hole
// at a different orientation. The UI says so rather than implying the correction is a cure.
//
// α is computed here from the same definition verified correct in coreOrientation.js's
// alphaBetaFromPole: α = asin(|pole · holeAxis|) — the pole/axis angle's complement, i.e. the angle
// between the PLANE and the hole axis, in [0°, 90°].
export const DEFAULT_TERZAGHI_MAX_WEIGHT = 8;

// Downhole unit vector in this module's east/north/up frame, from a hole's azimuth (compass bearing)
// and dip (degrees below horizontal) — identical to coreOrientation.js's holeDirection, restated here
// so this module stays free-standing pure trend/plunge math (it is also just trendPlungeToVec with the
// hole's own trend/plunge, since a hole's azimuth/dip IS a downward-directed line).
export function holeAxisVec(holeAzDeg, holeDipDeg) {
  return trendPlungeToVec(holeAzDeg, holeDipDeg);
}

// Acute angle (deg, 0-90) between a structure plane (dipDir/dip) and a drillhole axis (az/dip). This is
// the core-logging "alpha" angle. 90° = plane perpendicular to the hole (best sampled); 0° = plane
// parallel to the hole (never intersected).
export function alphaAngle(dipDirDeg, dipDeg, holeAzDeg, holeDipDeg) {
  const pl = poleTrendPlunge(Number(dipDirDeg), Number(dipDeg));
  const p = trendPlungeToVec(pl.trend, pl.plunge);
  const h = holeAxisVec(Number(holeAzDeg), Number(holeDipDeg));
  const d = Math.abs(p.x * h.x + p.y * h.y + p.z * h.z);
  return toDeg(Math.asin(Math.max(0, Math.min(1, d))));
}

// Terzaghi weight 1/sin(α), capped at maxWeight. Returns exactly 1 at α = 90° (a perpendicular
// intersection is the unbiased reference case) and never returns less than 1.
export function terzaghiWeight(alphaDeg, maxWeight = DEFAULT_TERZAGHI_MAX_WEIGHT) {
  const s = Math.sin(toRad(Math.max(0, Math.min(90, alphaDeg))));
  if (!(s > 0)) return maxWeight;
  return Math.min(maxWeight, 1 / s);
}

// Shared by fisherStats and kambContourGrid: turn picks into { vecs, weights } in one place so the two
// can never drift apart on which picks they accept or how they weight them.
//
// terzaghi options: { enabled, maxWeight }. A pick only gets a Terzaghi weight if it carries the hole
// attitude at its own depth (holeAz/holeDip, filled in by the caller from surveyAzimuthDipAt) — picks
// without it fall back to weight 1 rather than being silently dropped, and the count of those is
// reported so the UI can say how much of the population the correction actually reached.
function poleVectorsAndWeights(picks, terzaghi) {
  const on = !!(terzaghi && terzaghi.enabled);
  const maxWeight = (terzaghi && terzaghi.maxWeight) || DEFAULT_TERZAGHI_MAX_WEIGHT;
  const vecs = [], weights = [];
  let weighted = 0, unweighted = 0, cappedCount = 0, minAlpha = Infinity, maxW = 1;
  (picks || []).forEach((p) => {
    if (p.dip == null || p.azimuth == null || isNaN(p.dip) || isNaN(p.azimuth)) return;
    const { trend, plunge } = poleTrendPlunge(Number(p.azimuth), Number(p.dip));
    vecs.push(trendPlungeToVec(trend, plunge));
    let w = 1;
    if (on) {
      const hasHole = p.holeAz != null && p.holeDip != null && !isNaN(p.holeAz) && !isNaN(p.holeDip);
      if (hasHole) {
        const a = alphaAngle(p.azimuth, p.dip, p.holeAz, p.holeDip);
        w = terzaghiWeight(a, maxWeight);
        if (a < minAlpha) minAlpha = a;
        if (w >= maxWeight - 1e-9) cappedCount++;
        weighted++;
      } else unweighted++;
    }
    if (w > maxW) maxW = w;
    weights.push(w);
  });
  return {
    vecs, weights,
    terzaghi: on
      ? { applied: true, maxWeight, minAlphaDeg: minAlpha === Infinity ? null : minAlpha, blindZoneDeg: toDeg(Math.asin(Math.min(1, 1 / maxWeight))), weighted, unweighted, cappedCount, maxAppliedWeight: maxW }
      : { applied: false },
  };
}

// picks: [{ dip, azimuth }] where azimuth is DIP DIRECTION (same convention as everything above).
// Optionally [{ ..., holeAz, holeDip }] for the Terzaghi correction (TASKS.csv #280) — see
// poleVectorsAndWeights above.
// Returns null when there aren't at least 2 usable picks (statistics on 0 or 1 orientation are
// meaningless, and a caller showing "k = ∞, α95 = 0°" off a single pick would be actively misleading).
export function fisherStats(picks, { terzaghi = null } = {}) {
  const { vecs, weights, terzaghi: tzInfo } = poleVectorsAndWeights(picks, terzaghi);
  const n = vecs.length;
  if (n < 2) return null;

  // Sum of weights, and the KISH EFFECTIVE SAMPLE SIZE nEff = (Σw)²/Σw². Weighting changes the shape
  // of the distribution (which is the point), but it must NOT be allowed to inflate the apparent amount
  // of evidence: a population of 20 picks in which one carries weight 8 is still 20 measurements, and
  // reporting k/α95 as if Σw = 27 observations had been made would understate the true uncertainty.
  // nEff is the standard survey-statistics answer to exactly that, and collapses to n when every weight
  // is 1 (the uncorrected case), so nothing about the existing behaviour changes when the box is off.
  let sumW = 0, sumW2 = 0;
  for (let i = 0; i < n; i++) { sumW += weights[i]; sumW2 += weights[i] * weights[i]; }
  const nEff = sumW2 > 0 ? (sumW * sumW) / sumW2 : n;

  // Orientation tensor T = Σ wᵢ·vᵢ⊗vᵢ — invariant to vᵢ → −vᵢ, which is what makes this valid for axial data.
  const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  vecs.forEach((v, vi) => {
    const w = weights[vi];
    const c = [v.x, v.y, v.z];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[i][j] += w * c[i] * c[j];
  });
  const eig = jacobiEigenSymmetric3(T);
  // Normalized eigenvalues sum to 1 (since trace(T) = Σ|vᵢ|² = n for unit vectors) — these are the
  // standard S1≥S2≥S3 shape parameters: S1≈1 is a tight point cluster (one dominant orientation);
  // S1≈S2≫S3 is a girdle (picks spread along a great circle, i.e. a fold axis situation); all three
  // roughly equal is an isotropic/random spread with no meaningful mean.
  // Normalized by trace(T) = Σwᵢ|vᵢ|² = Σw (= n in the unweighted case), so S1+S2+S3 = 1 either way.
  const [s1, s2, s3] = eig.map((e) => e.value / (sumW || n));

  // Mean axis, forced to the lower hemisphere so it's directly comparable to the plotted poles (an
  // eigenvector's sign is arbitrary — for axial data both signs are equally valid answers).
  let mv = eig[0].vector;
  if (mv.z > 0) mv = { x: -mv.x, y: -mv.y, z: -mv.z };
  const mean = vecToTrendPlunge(mv);

  // TASKS.csv #279 — FOLD (BETA) AXIS. For a cylindrically folded surface, the poles to that surface do
  // not cluster: they spread along a great circle (the "π-circle"), and the pole to THAT circle is the
  // fold axis — the line the folding rotates about, which is the single most useful number to take away
  // from a folded population and the one thing a girdle-shaped stereonet is actually telling you.
  // The orientation tensor already hands this over for free: the girdle's own pole is the eigenvector
  // of the SMALLEST eigenvalue (eig[2]), i.e. the direction the data least occupies. It was being
  // computed and thrown away on every call. Reported as a LINE (trend/plunge, forced to the lower
  // hemisphere like the mean axis), plus the π-circle's own plane as dip/dipdir so it can be drawn.
  // Only meaningful when the population is actually a girdle (S1≈S2≫S3) — the caller decides when to
  // show it, using the same shape test that already drives the girdle interpretation text.
  let bv = eig[2].vector;
  if (bv.z > 0) bv = { x: -bv.x, y: -bv.y, z: -bv.z };
  const beta = vecToTrendPlunge(bv);

  // Fisher k / α95 on hemisphere-aligned vectors (see this section's header comment for why the
  // alignment step is required before Fisher's directed-vector statistics can be applied here).
  let Rx = 0, Ry = 0, Rz = 0;
  vecs.forEach((v, vi) => {
    const dot = v.x * mv.x + v.y * mv.y + v.z * mv.z;
    const s = (dot < 0 ? -1 : 1) * weights[vi]; // flip into the mean's hemisphere, carrying its weight
    Rx += s * v.x; Ry += s * v.y; Rz += s * v.z;
  });
  const Rw = Math.hypot(Rx, Ry, Rz);
  const Rbar = Rw / (sumW || n); // 0 = no preferred orientation, 1 = all picks identical
  // Fisher's k and α95 are defined for a count of observations, so they're evaluated at the EFFECTIVE
  // sample size nEff with the resultant rescaled to match (R = Rbar·nEff) — Rbar, the actual measure of
  // dispersion, is preserved exactly, while the "how many measurements back this up" input stays
  // honest. With weighting off, nEff === n and R === Rw, so these are bit-for-bit the original formulas.
  const nS = nEff, R = Rbar * nEff;
  // Fisher (1953) concentration parameter. The (n-1)/(n-R) estimator is the standard one; guarded
  // because a perfectly clustered population gives R === n exactly, which would divide by zero.
  const k = nS - R > 1e-9 ? (nS - 1) / (nS - R) : Infinity;
  // 95% confidence cone half-angle about the mean direction (Fisher 1953). Same guard reasoning:
  // R === n means zero scatter, so the cone collapses to 0°.
  let alpha95 = 0;
  if (R > 1e-9 && nS - R > 1e-9 && nS > 1 + 1e-9) {
    const inner = ((nS - R) / R) * (Math.pow(1 / 0.05, 1 / (nS - 1)) - 1);
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
    // TASKS.csv #279 — fold/beta axis as a line, and the best-fit girdle (π-)plane it is the pole to.
    betaTrend: beta.trend, betaPlunge: beta.plunge,
    girdleDipDir: (beta.trend + 180) % 360, girdleDip: 90 - beta.plunge,
    // TASKS.csv #280 — Terzaghi provenance, so the UI can never show a corrected number without saying so.
    nEff, sumW, terzaghi: tzInfo,
  };
}

// ============================================================
// TASKS.csv #278 — ROSE DIAGRAM binning. The stereonet's standard companion: a circular frequency
// histogram of azimuths, which is how vein/fault-corridor trends are read at a glance (a stereonet
// shows the full 3-D orientation but makes "which way do these things run, and how many of them"
// genuinely hard to eyeball). No new projection math is needed — this is pure angular binning of
// values the module already produces.
//
// `mode`:
//   "strike"  — strike azimuth (dipDir − 90), plotted BIDIRECTIONALLY. A strike line has no arrowhead:
//               a plane striking 040 also strikes 220, and they are the same statement. So each pick
//               contributes to BOTH bins and the resulting diagram is symmetric through the centre —
//               the standard convention for planar-fabric roses, and the one to use for vein trends.
//   "dipdir"  — dip direction, plotted UNIDIRECTIONALLY (0-360). A dip direction genuinely does have a
//               sense (it points downhill), so this one is not symmetrized. Useful for asking whether
//               a set dips consistently one way or is a conjugate/fanned pair.
//
// Petal RADIUS is returned as sqrt(count/maxCount), not count/maxCount, deliberately: a petal's visual
// weight is its AREA, and a linear radius scale makes a bin with twice the picks look four times as
// abundant. Square-root scaling makes petal area proportional to frequency, which is the standard
// equal-area rose convention. Raw counts are returned alongside so a caller can label or rescale.
// `weights` (TASKS.csv #280) applies the same Terzaghi correction the stereonet uses, so the two views
// never disagree about which trend dominates.
export function roseDiagramBins(picks, { binSizeDeg = 10, mode = "strike", terzaghi = null } = {}) {
  const size = Math.max(1, Math.min(90, Number(binSizeDeg) || 10));
  const nBins = Math.round(360 / size);
  if (Math.abs(nBins * size - 360) > 1e-9) return null; // bin size must divide 360 evenly
  const counts = new Array(nBins).fill(0);
  const on = !!(terzaghi && terzaghi.enabled);
  const maxWeight = (terzaghi && terzaghi.maxWeight) || DEFAULT_TERZAGHI_MAX_WEIGHT;
  let n = 0;
  (picks || []).forEach((p) => {
    if (p.dip == null || p.azimuth == null || isNaN(p.dip) || isNaN(p.azimuth)) return;
    n++;
    let w = 1;
    if (on && p.holeAz != null && p.holeDip != null && !isNaN(p.holeAz) && !isNaN(p.holeDip)) {
      w = terzaghiWeight(alphaAngle(p.azimuth, p.dip, p.holeAz, p.holeDip), maxWeight);
    }
    const base = mode === "dipdir" ? Number(p.azimuth) : Number(p.azimuth) - 90;
    const a = ((base % 360) + 360) % 360;
    counts[Math.min(nBins - 1, Math.floor(a / size))] += w;
    if (mode !== "dipdir") {
      const b = ((a + 180) % 360);
      counts[Math.min(nBins - 1, Math.floor(b / size))] += w;
    }
  });
  if (!n) return null;
  const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);
  const bins = counts.map((c, i) => ({
    from: i * size, to: (i + 1) * size, mid: i * size + size / 2,
    count: c,
    radius: maxCount > 0 ? Math.sqrt(c / maxCount) : 0, // area ∝ frequency (see header)
  }));
  return { bins, binSizeDeg: size, nBins, n, maxCount, mode, bidirectional: mode !== "dipdir" };
}

// ============================================================
// TASKS.csv #141 (follow-up) — Kamb (1959) counting-circle density contouring. This is the "materially
// bigger piece of math" that StereonetModal's header comment deferred: a pole plot shows the raw
// scatter, but with a few hundred picks the dots pile up and the eye can't tell a 30-pick cluster from
// a 300-pick one. Density contouring is how every standard structural tool (Stereonet, OSXStereonet,
// Orient, Leapfrog's own stereonet) answers "where is the fabric actually concentrated".
//
// THE METHOD (Kamb 1959, as implemented in e.g. Vollmer 1995 "C program for automatic contouring of
// spherical orientation data using a modified Kamb method", Computers & Geosciences 21):
//   * N poles as unit vectors. At each grid node g (also a unit vector, on the lower hemisphere), count
//     the poles falling inside a "counting circle" — a spherical cap of angular radius θ centred on g —
//     i.e. those with |v·g| ≥ cos θ. The ABSOLUTE dot product is deliberate: poles to planes are axial
//     data (a pole and its antipode are the same plane — see fisherStats above), so a counting circle
//     near the net edge that spills into the upper hemisphere must pick up the antipodes of the poles
//     that were plotted on the far side of the net. Without this, every cluster near the primitive
//     would read as half its true density.
//   * Under a UNIFORM (random) distribution, a cap covering fraction A of the hemisphere's area holds
//     a binomially-distributed count with mean E = N·A and variance σ² = N·A·(1−A). Kamb's choice of
//     cap size is the one where the expected count is exactly 3 standard deviations above zero,
//     E = 3σ, which solves to A = 9/(N+9). Since a cap of angular radius θ covers fraction 1−cos θ of
//     the hemisphere, cos θ = N/(N+9): the circle shrinks as N grows (large samples support finer
//     detail), and the constants are fully determined by N — nothing is hand-tuned. It follows that
//     E = 9N/(N+9) and σ = 3N/(N+9) = E/3.
//   * The value reported at each node is (count − E)/σ: HOW MANY STANDARD DEVIATIONS ABOVE THE DENSITY
//     A RANDOM DISTRIBUTION WOULD GIVE. This is the standard Kamb convention — a node at 0σ is "no
//     more crowded than random", 2σ is the conventional lowest contour worth drawing, and a well-defined
//     structural fabric sits at anything from ~4σ (broad) to 10σ+ (tight). Expressed in σ rather than
//     "% per 1% area" precisely so that it's comparable across populations of different size.
//
// Sampled on a regular gridSize×gridSize grid of NET positions (the 2D disk the modal draws), inverse-
// projected to sphere directions via netToTrendPlunge, so the caller can paint cells directly with no
// further projection. Cells whose centre lies outside the primitive (beyond the tiny straddle margin)
// are null. Cost is gridSize²·N dot products — 48² × ~600 picks ≈ 1.4M multiply-adds, sub-millisecond
// territory on anything, so no need for the spatial-index tricks the classic C implementations use.
//
// picks: [{ dip, azimuth }] (azimuth = dip direction, as everywhere in this module). Returns null for
// fewer than 3 valid picks — a density estimate over 1-2 points is meaningless, and drawing a "contour"
// around a single dot would be actively misleading.
// TASKS.csv #280 — the Terzaghi weighting extends this cleanly. With per-pole weights wᵢ the counting
// circle's content becomes C = Σ wᵢ·Xᵢ with Xᵢ ~ Bernoulli(A) under a uniform distribution, so
// E = A·Σw and σ² = A(1−A)·Σw² exactly (independent Bernoullis, weights fixed). Kamb's defining
// requirement is E = 3σ, which now reads √(A/(1−A))·Σw/√(Σw²) = 3; substituting the Kish effective
// sample size nEff = (Σw)²/Σw² makes that √(A/(1−A))·√(nEff) = 3, i.e. A = 9/(nEff+9) — the SAME
// formula as before with n replaced by nEff, and E = 3σ holds exactly rather than approximately
// (verified algebraically, and numerically in this task's Node hand-test). With weighting off every
// wᵢ = 1, nEff = n, Σw = n, Σw² = n, and every line below reduces to the original unweighted code.
export function kambContourGrid(picks, { gridSize = 48, projection = "equalArea", terzaghi = null } = {}) {
  const { vecs, weights, terzaghi: tzInfo } = poleVectorsAndWeights(picks, terzaghi);
  const n = vecs.length;
  if (n < 3) return null;

  let sumW = 0, sumW2 = 0;
  for (let i = 0; i < n; i++) { sumW += weights[i]; sumW2 += weights[i] * weights[i]; }
  const nEff = sumW2 > 0 ? (sumW * sumW) / sumW2 : n;

  const A = 9 / (nEff + 9);       // fraction of hemisphere area inside the counting circle
  const cosTheta = 1 - A;         // = nEff/(nEff+9)
  const expected = sumW * A;      // E[weighted count] under a uniform spread
  const sigma = Math.sqrt(sumW2 * A * (1 - A)); // = expected/3 by the derivation above
  const countingAngleDeg = toDeg(Math.acos(cosTheta));

  // Flat arrays for speed (this runs on every filter/projection change in the modal).
  const vx = new Float64Array(n), vy = new Float64Array(n), vz = new Float64Array(n), vw = new Float64Array(n);
  vecs.forEach((v, i) => { vx[i] = v.x; vy[i] = v.y; vz[i] = v.z; vw[i] = weights[i]; });

  const cell = 2 / gridSize;                 // net units per cell (disk spans [-1,1])
  const straddle = cell * Math.SQRT1_2;      // half a cell diagonal — keep edge cells that partly overlap the disk
  const values = new Array(gridSize * gridSize).fill(null);
  let maxSigma = -Infinity;
  for (let j = 0; j < gridSize; j++) {
    const y = -1 + (j + 0.5) * cell;
    for (let i = 0; i < gridSize; i++) {
      const x = -1 + (i + 0.5) * cell;
      if (Math.hypot(x, y) > 1 + straddle) continue;
      const { trend, plunge } = netToTrendPlunge(x, y, projection);
      const g = trendPlungeToVec(trend, plunge);
      let count = 0;
      for (let k = 0; k < n; k++) {
        const d = vx[k] * g.x + vy[k] * g.y + vz[k] * g.z;
        if (Math.abs(d) >= cosTheta) count += vw[k];
      }
      const s = (count - expected) / sigma;
      values[j * gridSize + i] = s;
      if (s > maxSigma) maxSigma = s;
    }
  }
  return { gridSize, values, n, nEff, countingAngleDeg, expected, sigma, maxSigma, terzaghi: tzInfo };
}
