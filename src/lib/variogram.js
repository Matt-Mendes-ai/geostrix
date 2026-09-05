// TASKS.csv #147 — experimental variogram / spatial-continuity analysis per domain.
//
// WHY THIS EXISTS. estimation.js's own header says, in as many words, that GeoStrix does NOT do
// ordinary kriging because "kriging needs a fitted variogram model (nugget/sill/range from an
// experimental variogram the user would build and fit interactively) as a genuine prerequisite step",
// and GradeEstimationModal repeats that to the user. This module is that missing prerequisite: it
// computes the experimental variogram so a user can actually SEE, and read numbers off, the spatial
// continuity of a domain's grades before choosing any estimation parameter.
//
// BE CLEAR ABOUT WHAT THIS IS AND IS NOT. Computing an experimental variogram, and fitting a
// nugget/sill/range model to it, does NOT make this app a kriging engine — nothing here is wired into
// makeCellEstimator, and the estimators remain NN/IDW. What it DOES give, immediately and honestly:
//   * a defensible search radius (the range is where correlation dies — beyond it a sample tells you
//     nothing about a block, so a search radius much larger than the range is asserting continuity the
//     data does not show),
//   * a nugget/sill ratio, i.e. how much of the variability is pure short-scale noise — a high nugget
//     is the single best argument against trusting a smooth interpolated shell,
//   * directional ranges: comparing the range ALONG a structural trend with the range ACROSS it is the
//     quantitative version of the anisotropy ratio the Modeling tab already asks the user to type in
//     from geological judgement alone.
//
// COMPOSITES, NOT RAW INTERVALS. Every caller should composite first (geochem.js compositeDownhole),
// for exactly the reasons TASKS.csv #262/#267 document: a variogram over ragged 0.3 m and 3.0 m
// intervals weights each pair equally regardless of the support behind it, and short intervals cluster
// in mineralisation, so the bias runs the same direction as everywhere else in this codebase — upward
// where it matters. This module deliberately does NOT length-weight pairs itself: a variogram assumes
// a COMMON SUPPORT (all samples the same volume), which is what compositing to a fixed length gives
// you. Length-weighting ragged data here would paper over the support problem rather than fix it.
//
// Coordinate convention: points are {x: easting, y: northing, z: elevation (up)}, i.e. exactly what
// estimation.js's samplePointsFromIntervals returns and the same (east, north, up) frame
// ViewerModule's searchEllipsoidBasis / anisoWarpPoint already use — so a direction typed as
// azimuth/dip here means the same thing it means in the anisotropy fields.

const toRad = (d) => (d * Math.PI) / 180;

// Unit vector for an azimuth (degrees clockwise from north) + dip (degrees below horizontal), in
// (east, north, up). Identical construction to ViewerModule's searchEllipsoidBasis().major — kept
// byte-for-byte equivalent on purpose so "azimuth 45 / dip 60" points the same way in both tools.
export function directionVector(azimuth, dip) {
  const az = toRad(azimuth), dp = toRad(dip);
  return { x: Math.sin(az) * Math.cos(dp), y: Math.cos(az) * Math.cos(dp), z: -Math.sin(dp) };
}

// Deterministic subsample: variogram cost is O(n^2) in sample points, so a 6,000-composite dataset is
// 18M pairs — fine, but 40,000 would not be. Stride sampling (not a random shuffle) keeps the result
// reproducible run-to-run, which matters when the number a user reads off drives a search radius.
function subsample(points, maxPoints) {
  if (!maxPoints || points.length <= maxPoints) return { pts: points, subsampled: false };
  const stride = points.length / maxPoints;
  const out = [];
  for (let i = 0; out.length < maxPoints && Math.floor(i) < points.length; i += stride) out.push(points[Math.floor(i)]);
  return { pts: out, subsampled: true };
}

// ---------------------------------------------------------------------------------------------
// TASKS.csv #147 — value transforms, and why this module has to offer them.
//
// This is not a convenience feature; without it the tool is unusable on the kind of data it exists to
// characterise. Verified on sample_data/harry_property (Zn, 6,229 2 m composites, raw ppm): the raw
// experimental variogram is flat noise oscillating between 88,000 and 145,000 with a fitted r^2 of
// 0.025 — the Matheron estimator squares differences, so a handful of massive-sulphide composites
// (Zn p50 = 81 ppm, max = 12,332 ppm) dominate every lag bin they land in and drown the structure.
// The SAME points under log10(x+1) give a clean monotonic rise, r^2 = 0.947, nugget ratio 0.40. The
// spatial continuity was always there; the raw-space variogram simply could not see it.
//
// HONESTY CONSTRAINT (the point the QP review was making): a transformed variogram's nugget and sill
// are in TRANSFORMED units. The RANGE is the number that carries over usefully — a correlation length
// in metres is a correlation length in metres — but a log-space sill is NOT a grade variance and must
// not be quoted as one, and back-transforming it properly needs a lognormal correction this module
// does not do. The UI says exactly that whenever a transform is active.
export const VALUE_TRANSFORMS = {
  none: { label: "None (raw grade)", note: "Variogram of grade itself. Sill and nugget are in (grade unit)^2." },
  log: {
    label: "log10(value + 1)",
    note: "For skewed grade (most precious/base metals). Reveals structure that outliers hide. Range is still metres; sill/nugget are in log units and are NOT a grade variance.",
  },
  cap: {
    label: "Cap at percentile",
    note: "Keeps raw units by pulling extreme values back to a percentile, the same top-cut idea as the estimation cap. Less distorting than a log, less effective on very skewed data.",
  },
};

// Applies a transform to a point set, returning NEW point objects (never mutating the caller's).
// `capPercentile` is 0-100 and only used by the "cap" transform.
export function applyValueTransform(points, transform = "none", capPercentile = 98) {
  const pts = (points || []).filter((p) => Number.isFinite(p.value));
  if (transform === "log") {
    // +1 rather than a small epsilon: assays legitimately include exact zeros (below detection, already
    // substituted upstream), and log(eps) would turn each of those into a huge negative outlier — the
    // exact failure mode the transform exists to avoid.
    return { points: pts.map((p) => ({ ...p, value: Math.log10(Math.max(0, p.value) + 1) })), capValue: null };
  }
  if (transform === "cap") {
    const sorted = pts.map((p) => p.value).sort((a, b) => a - b);
    if (!sorted.length) return { points: pts, capValue: null };
    const q = Math.min(100, Math.max(0, capPercentile)) / 100;
    const capValue = sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
    return { points: pts.map((p) => (p.value > capValue ? { ...p, value: capValue } : p)), capValue };
  }
  return { points: pts, capValue: null };
}

// ---------------------------------------------------------------------------------------------
// The experimental variogram itself.
//
//   gamma(h) = (1 / 2N(h)) * sum over pairs separated by ~h of (z_i - z_j)^2
//
// i.e. the mean of HALF the squared difference over the pairs falling in each lag bin. That is the
// textbook Matheron estimator, and it is the whole of the math here — everything else in this
// function is which pairs land in which bin.
//
// opts:
//   lagDistance   bin width (m). Rule of thumb: ~ the average nearest-neighbour spacing.
//   nLags         number of bins; nLags * lagDistance should be about half the field's extent — past
//                 that, pair counts collapse and the "variogram" is noise (see maxReliableLag below).
//   lagTolerance  half-width of a bin as a FRACTION of lagDistance (0.5 = contiguous bins, the default
//                 and what almost every package does).
//   direction     null = omnidirectional; else {azimuth, dip, angleTol (deg), bandwidth (m|null)}.
//   holeMode      "all" (default) | "downhole" (pairs within one hole only — the classic way to see
//                 the nugget, since only downhole samples get close enough to resolve it) |
//                 "between" (pairs from different holes only).
//   maxPoints     subsample cap (default 6000).
//
// Returns { bins, nPairsUsed, nPoints, variance, mean, subsampled, maxReliableLag }.
export function experimentalVariogram(points, opts = {}) {
  const lagDistance = Number(opts.lagDistance) > 0 ? Number(opts.lagDistance) : 10;
  const nLags = Math.max(1, Math.round(opts.nLags ?? 12));
  const lagTolFrac = opts.lagTolerance != null ? Number(opts.lagTolerance) : 0.5;
  const lagTol = lagDistance * (lagTolFrac > 0 ? lagTolFrac : 0.5);
  const holeMode = opts.holeMode || "all";
  const dir = opts.direction || null;

  const clean = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.value));
  const { pts, subsampled } = subsample(clean, opts.maxPoints ?? 6000);
  const n = pts.length;

  // Reference variance (population, /n) — the level a variogram of a stationary variable should
  // flatten out at. Reported so the panel can draw it as the "expected sill" line: a variogram that
  // never reaches it, or climbs straight past it, is telling the user there's a trend, not a sill.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += pts[i].value;
  mean = n ? mean / n : 0;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (pts[i].value - mean) ** 2;
  variance = n ? variance / n : 0;

  const maxDist = nLags * lagDistance + lagTol;
  const maxDist2 = maxDist * maxDist;

  const sum = new Float64Array(nLags + 1);   // sum of squared differences per bin
  const cnt = new Float64Array(nLags + 1);   // pair count per bin
  const hSum = new Float64Array(nLags + 1);  // sum of actual separations, for the bin's mean distance

  const dirV = dir ? directionVector(dir.azimuth, dir.dip) : null;
  const cosTol = dir ? Math.cos(toRad(Math.min(89.9, Math.max(0.1, dir.angleTol ?? 22.5)))) : 0;
  const bandwidth = dir && Number(dir.bandwidth) > 0 ? Number(dir.bandwidth) : null;

  let nPairsUsed = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    for (let j = i + 1; j < n; j++) {
      const b = pts[j];
      if (holeMode === "downhole" && a.hole_id !== b.hole_id) continue;
      if (holeMode === "between" && a.hole_id === b.hole_id) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxDist2 || d2 === 0) continue;
      const h = Math.sqrt(d2);
      const k = Math.round(h / lagDistance);
      if (k < 1 || k > nLags) continue;
      if (Math.abs(h - k * lagDistance) > lagTol) continue;
      if (dirV) {
        // A pair vector has no sign (the pair (i,j) is the pair (j,i)), so the angular test uses
        // |cos| — a direction and its reciprocal are the same direction for a variogram.
        const dot = dx * dirV.x + dy * dirV.y + dz * dirV.z;
        if (Math.abs(dot) < cosTol * h) continue;
        if (bandwidth != null) {
          // Bandwidth caps the perpendicular offset from the direction line, which is what stops a
          // wide angular cone from swallowing far-off-axis pairs at long lags — the standard fix.
          const perp2 = d2 - dot * dot;
          if (perp2 > bandwidth * bandwidth) continue;
        }
      }
      const dv = a.value - b.value;
      sum[k] += dv * dv;
      cnt[k] += 1;
      hSum[k] += h;
      nPairsUsed++;
    }
  }

  const bins = [];
  for (let k = 1; k <= nLags; k++) {
    if (cnt[k] === 0) { bins.push({ lag: k * lagDistance, h: k * lagDistance, gamma: null, nPairs: 0 }); continue; }
    bins.push({
      lag: k * lagDistance,
      h: hSum[k] / cnt[k],              // the bin's MEAN separation — what gamma should be plotted at
      gamma: sum[k] / (2 * cnt[k]),     // Matheron: mean of half the squared differences
      nPairs: cnt[k],
    });
  }

  return {
    bins, nPairsUsed, nPoints: n, mean, variance, subsampled,
    // Journel & Huijbregts' standard caution, surfaced rather than assumed: a lag with fewer than ~30
    // pairs is not a measurement, and a variogram should not be interpreted past about half the
    // field's extent. maxReliableLag is the largest lag that clears the 30-pair bar contiguously.
    maxReliableLag: (() => {
      let last = 0;
      for (const b of bins) { if (b.nPairs >= 30) last = b.lag; else break; }
      return last;
    })(),
  };
}

// ---------------------------------------------------------------------------------------------
// Model shapes. `nugget` c0, `sill` is the TOTAL sill (c0 + partial sill) — the value the model
// flattens out at — and `range` is the distance at which it does (for exponential/gaussian, the
// PRACTICAL range, i.e. 95% of the sill, which is the convention every mining package uses and the
// only one a user reading a plot can check by eye).
export const VARIOGRAM_MODELS = {
  spherical: {
    label: "Spherical",
    shape: (h, a) => (h <= 0 ? 0 : h >= a ? 1 : 1.5 * (h / a) - 0.5 * (h / a) ** 3),
    note: "Reaches its sill exactly at the range — the usual first choice for grade in a defined domain.",
  },
  exponential: {
    label: "Exponential",
    shape: (h, a) => (h <= 0 ? 0 : 1 - Math.exp((-3 * h) / a)),
    note: "Approaches the sill asymptotically; 'range' is the practical range (95% of sill). Fits noisier, less structured grade.",
  },
  gaussian: {
    label: "Gaussian",
    shape: (h, a) => (h <= 0 ? 0 : 1 - Math.exp((-3 * h * h) / (a * a))),
    note: "Parabolic near the origin — implies a very smooth, almost continuous variable. Rare for grade; usually a sign of over-smoothed data.",
  },
};

export function variogramModelValue(h, { model = "spherical", nugget = 0, sill = 1, range = 1 } = {}) {
  const m = VARIOGRAM_MODELS[model] || VARIOGRAM_MODELS.spherical;
  if (h <= 0) return 0;
  return nugget + Math.max(0, sill - nugget) * m.shape(h, Math.max(1e-9, range));
}

// Least-squares fit of (nugget, sill, range) to the experimental points — offered as a STARTING POINT
// the user then overrides, not as an answer. Structure: for a FIXED range the model is linear in its
// two other parameters (gamma = c0 * 1 + c1 * shape(h/a)), so the range is found by scanning candidate
// ranges and solving the 2-parameter weighted normal equations exactly at each one. Weighted by pair
// count (a lag built from 4,000 pairs should not count the same as one built from 12) — the standard
// weighting, and the honest one given how fast pair counts fall off at long lags.
export function fitVariogramModel(bins, opts = {}) {
  const model = opts.model || "spherical";
  const shape = (VARIOGRAM_MODELS[model] || VARIOGRAM_MODELS.spherical).shape;
  const usable = (bins || []).filter((b) => b.gamma != null && b.nPairs > 0 && Number.isFinite(b.h));
  if (usable.length < 3) return null;

  const hMax = Math.max(...usable.map((b) => b.h));
  const solveAt = (a) => {
    // Weighted normal equations for gamma_i ~= c0 + c1 * g_i, with g_i = shape(h_i, a).
    let s11 = 0, s1g = 0, sgg = 0, s1y = 0, sgy = 0, sw = 0;
    for (const b of usable) {
      const w = b.nPairs, g = shape(b.h, a), y = b.gamma;
      s11 += w; s1g += w * g; sgg += w * g * g; s1y += w * y; sgy += w * g * y; sw += w;
    }
    const det = s11 * sgg - s1g * s1g;
    let c0, c1;
    if (Math.abs(det) < 1e-12) { c0 = s1y / (sw || 1); c1 = 0; }
    else { c0 = (s1y * sgg - sgy * s1g) / det; c1 = (s11 * sgy - s1g * s1y) / det; }
    // A negative nugget or a negative partial sill is not a variogram — clamp and re-solve the single
    // remaining free parameter exactly rather than returning a nonsense fit with a good residual.
    if (c0 < 0 || c1 < 0) {
      if (c0 < 0) { c0 = 0; c1 = sgg > 0 ? sgy / sgg : 0; if (c1 < 0) c1 = 0; }
      else { c1 = 0; c0 = s1y / (sw || 1); }
    }
    let wss = 0;
    for (const b of usable) { const r = b.gamma - (c0 + c1 * shape(b.h, a)); wss += b.nPairs * r * r; }
    return { range: a, nugget: c0, sill: c0 + c1, wss };
  };

  // Coarse scan then a local refine — the WSS-vs-range curve is smooth but not convex (a spherical
  // model's shape function has a kink at h = a), so a gradient method would happily settle in the
  // wrong basin. 200 coarse steps over (0, 1.5 * hMax] then 40 refine steps is cheap and reliable.
  let best = null;
  for (let i = 1; i <= 200; i++) {
    const a = (1.5 * hMax * i) / 200;
    const cand = solveAt(a);
    if (!best || cand.wss < best.wss) best = cand;
  }
  const step = (1.5 * hMax) / 200;
  for (let i = -20; i <= 20; i++) {
    const a = best.range + (i * step) / 20;
    if (a <= 0) continue;
    const cand = solveAt(a);
    if (cand.wss < best.wss) best = cand;
  }
  const totalW = usable.reduce((t, b) => t + b.nPairs, 0);
  const meanY = usable.reduce((t, b) => t + b.nPairs * b.gamma, 0) / (totalW || 1);
  const tss = usable.reduce((t, b) => t + b.nPairs * (b.gamma - meanY) ** 2, 0);
  return {
    model,
    nugget: best.nugget,
    sill: best.sill,
    range: best.range,
    // Fraction of the total sill that is pure nugget — the number that decides whether any smooth
    // interpolation of this variable is defensible at all.
    nuggetRatio: best.sill > 0 ? best.nugget / best.sill : null,
    rSquared: tss > 0 ? 1 - best.wss / tss : null,
    nBinsUsed: usable.length,
  };
}

// Convenience for the per-domain workflow: bucket sample points by their `domain` field (set by
// compositeDownhole when a domain layer is passed, and carried through by
// samplePointsFromIntervals). Points with no domain land under a null key, kept separate rather than
// lumped in — "unassigned" is not a domain.
export function groupPointsByDomain(points) {
  const m = new Map();
  (points || []).forEach((p) => {
    const key = p.domain == null || p.domain === "" ? null : String(p.domain);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(p);
  });
  return m;
}

// A sane default lag distance for a point set: the median nearest-neighbour distance, which is the
// finest structure the data can actually resolve. Guessing this badly is the most common way to get a
// meaningless-looking variogram (too small = empty bins and noise, too large = every structure
// smoothed into the first bin), so the UI proposes it instead of making the user find it by trial.
export function suggestLagDistance(points) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (pts.length < 2) return null;
  const { pts: sub } = subsample(pts, 600); // O(n^2) again — 600 is plenty for a median
  const nn = [];
  for (let i = 0; i < sub.length; i++) {
    let best = Infinity;
    for (let j = 0; j < sub.length; j++) {
      if (i === j) continue;
      const dx = sub[j].x - sub[i].x, dy = sub[j].y - sub[i].y, dz = sub[j].z - sub[i].z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 0 && d2 < best) best = d2;
    }
    if (best < Infinity) nn.push(Math.sqrt(best));
  }
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}
