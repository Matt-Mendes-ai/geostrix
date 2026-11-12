import { arrMax } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
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
//     quantitative version of the anisotropy ratio the Modelling tab already asks the user to type in
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

// TASKS.csv #1572 (review #1497, Lawyers) — the downhole variogram exists to resolve the nugget, and the stride above kept
// every 8.4th composite of a hole (50,653 / 6,000), so no pair was closer than 16 m and the nugget it was computed for
// was never measured. Downhole pairs are cheap (only pairs within one hole), so they are taken over ALL composites; when
// even that is too many pairs, WHOLE holes are kept (a seeded choice, the same every run) up to the pair budget, so the
// kept holes still carry every short lag. Returns { groups: [points of one hole], holesUsed, holesTotal, subsampled }.
export const DOWNHOLE_PAIR_BUDGET = 20e6;
export function downholeGroups(points, maxPairs = DOWNHOLE_PAIR_BUDGET, seed = 1) {
  const byHole = new Map();
  for (const p of points) { const k = p.hole_id ?? ""; let g = byHole.get(k); if (!g) byHole.set(k, (g = [])); g.push(p); }
  const groups = [...byHole.values()];
  const pairsOf = (g) => (g.length * (g.length - 1)) / 2;
  let total = 0; for (const g of groups) total += pairsOf(g);
  if (total <= maxPairs) return { groups, holesUsed: groups.length, holesTotal: groups.length, subsampled: false };
  const order = Uint32Array.from(groups, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < order.length - 1; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = i + (s % (order.length - i)); const t = order[i]; order[i] = order[j]; order[j] = t; }
  const kept = []; let used = 0;
  for (const i of order) { const g = groups[i]; if (used + pairsOf(g) > maxPairs && kept.length) continue; kept.push(g); used += pairsOf(g); }
  return { groups: kept, holesUsed: kept.length, holesTotal: groups.length, subsampled: true };
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
// labels and notes stay English here and are translated where they are shown (TASKS.csv #786): translating at module
// load would freeze them in the language of the first import
export const VALUE_TRANSFORMS = {
  none: { label: "None (raw grade)", note: "Variogram of grade itself. Sill and nugget are in (grade unit)^2." },
  log: {
    label: "log10(value + 1)",
    note: "For skewed grade (most precious/base metals). Reveals structure that outliers hide. Range is still metres; sill/nugget are in log units and are NOT a grade variance.",
  },
  // TASKS.csv #1746 (review #1645, Copley) — 99 % of Copley's Au is below 0.08 g/t, where log10(x + 1) is about 0.43 x: the 'log'
  // variogram was the raw one rescaled. This one takes the log of the value itself, with a floor for zeros.
  logfloor: {
    label: "log10(value), zeros at half the smallest value",
    note: "For skewed grade whose values are mostly below 1 (gold in g/t, most elements in %), where + 1 barely changes them. Zeros and values below half the smallest positive value are set to that half (a stand-in for below detection). Range is still metres; sill/nugget are in log units and are NOT a grade variance.",
  },
  cap: {
    label: "Cap at percentile",
    note: "Keeps raw units by pulling extreme values back to a percentile, the same top-cut idea as the estimation cap. Less distorting than a log, less effective on very skewed data.",
  },
};

// TASKS.csv #1843 (review #1754, Kodiak) — a downhole variogram needs only the distance down each hole: composites of holes that could
// not be placed in 3D (no collar, or past the trace) go on a vertical line per hole at their mid depth, each hole far from the others
// (downhole pairs never cross holes). skipHoles: the holes already placed. Same point shape as samplePointsFromIntervals.
export function downholeLinePoints(intervals, skipHoles = new Set()) {
  const out = [], idx = new Map();
  for (const iv of intervals || []) {
    if (skipHoles.has(iv.hole_id) || iv.from == null || iv.to == null || !Number.isFinite(iv.avgGrade)) continue;
    if (!idx.has(iv.hole_id)) idx.set(iv.hole_id, idx.size);
    const length = iv.length != null ? iv.length : iv.to - iv.from;
    out.push({ x: idx.get(iv.hole_id) * 1e6, y: 0, z: -(Number(iv.from) + Number(iv.to)) / 2, value: Math.max(0, iv.avgGrade), hole_id: iv.hole_id, from: iv.from, to: iv.to,
      length: Number.isFinite(length) && length > 0 ? length : null, coverage: iv.coverage != null ? iv.coverage : null, domain: iv.domain != null ? iv.domain : null, byDepth: true });
  }
  return { points: out, holes: idx.size };
}

// Applies a transform to a point set, returning NEW point objects (never mutating the caller's).
// `capPercentile` is 0-100 and only used by the "cap" transform.
export function applyValueTransform(points, transform = "none", capPercentile = 98) {
  const pts = (points || []).filter((p) => Number.isFinite(p.value));
  if (transform === "log") {
    // +1 rather than a small epsilon: assays legitimately include exact zeros (below detection, already
    // substituted upstream), and log(eps) would turn each of those into a huge negative outlier — the
    // exact failure mode the transform exists to avoid.
    // #1746 — p95: when it is well below 1, log10(x + 1) is nearly linear (0.43 x) and the panel says so
    const v = pts.map((p) => Math.max(0, p.value)).sort((a, b) => a - b);
    const p95 = v.length ? v[Math.min(v.length - 1, Math.floor(0.95 * (v.length - 1)))] : null;
    return { points: pts.map((p) => ({ ...p, value: Math.log10(Math.max(0, p.value) + 1) })), capValue: null, p95 };
  }
  if (transform === "logfloor") { // #1746 — log10 of the value; zeros and anything below half the smallest positive value at that half
    let minPos = Infinity;
    for (const p of pts) if (p.value > 0 && p.value < minPos) minPos = p.value;
    if (!Number.isFinite(minPos)) return { points: [], capValue: null, floor: null };
    const floor = minPos / 2;
    return { points: pts.map((p) => ({ ...p, value: Math.log10(Math.max(floor, p.value)) })), capValue: null, floor };
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
//                 TASKS.csv #2424 — or { plane: { normal: {x, y, z}, halfWidth (m) } }: every azimuth within the plane, a pair kept
//                 when its offset across the plane is at most halfWidth (bedding: the horizontal range a layered deposit's search needs).
//   holeMode      "all" (default) | "downhole" (pairs within one hole only — the classic way to see
//                 the nugget, since only downhole samples get close enough to resolve it) |
//                 "between" (pairs from different holes only).
//   maxPoints     subsample cap (default 6000).
//   estimator     TASKS.csv #1996 — "matheron" (default: the mean of half the squared differences), "cressie" (Cressie & Hawkins
//                 1980: (mean of |dv|^0.5)^4 / (2 (0.457 + 0.494 / N + 0.045 / N^2)), robust to a few extreme pairs) or "dowd" (Dowd
//                 1984: 2.198 × median(|dv|)^2 / 2). A few massive-sulphide composites dictate a Matheron sill; these two are not
//                 led by them. scikit-gstat (MIT) is the reference implementation; nothing is borrowed from it.
//
// Returns { bins, nPairsUsed, nPoints, variance, mean, subsampled, maxReliableLag }.
// #1996 — the median of a typed array (sorted in place: it is the bin's own scratch copy)
function medianOf(a) { if (!a.length) return NaN; a.sort(); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
export function experimentalVariogram(points, opts = {}) {
  const lagDistance = Number(opts.lagDistance) > 0 ? Number(opts.lagDistance) : 10;
  const nLags = Math.max(1, Math.round(opts.nLags ?? 12));
  const lagTolFrac = opts.lagTolerance != null ? Number(opts.lagTolerance) : 0.5;
  const lagTol = lagDistance * (lagTolFrac > 0 ? lagTolFrac : 0.5);
  const holeMode = opts.holeMode || "all";
  const dir = opts.direction || null;

  const clean = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && Number.isFinite(p.value));
  // #1572 — downhole pairs over every composite (whole holes when a budget bites); other modes keep the stride subsample
  const dh = holeMode === "downhole" ? downholeGroups(clean, opts.maxPairs ?? DOWNHOLE_PAIR_BUDGET) : null;
  const { pts, subsampled } = dh ? { pts: dh.groups.flat(), subsampled: dh.subsampled } : subsample(clean, opts.maxPoints ?? 6000);
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
  const estimator = opts.estimator === "cressie" || opts.estimator === "dowd" ? opts.estimator : "matheron"; // #1996
  const sumRoot = estimator === "cressie" ? new Float64Array(nLags + 1) : null; // sum of |dv|^0.5 per bin
  const absBins = estimator === "dowd" ? Array.from({ length: nLags + 1 }, () => ({ a: new Float32Array(64), n: 0 })) : null; // every |dv| per bin, for its median
  const cnt = new Float64Array(nLags + 1);   // pair count per bin
  const hSum = new Float64Array(nLags + 1);  // sum of actual separations, for the bin's mean distance

  const plane = dir?.plane?.normal ? (() => { const q = dir.plane.normal, l = Math.hypot(q.x, q.y, q.z); return l > 0 ? { x: q.x / l, y: q.y / l, z: q.z / l, w: Math.max(0, Number(dir.plane.halfWidth) || 0) } : null; })() : null; // #2424
  const dirV = dir && !plane ? directionVector(dir.azimuth, dir.dip) : null;
  const cosTol = dirV ? Math.cos(toRad(Math.min(89.9, Math.max(0.1, dir.angleTol ?? 22.5)))) : 0;
  const bandwidth = dirV && Number(dir.bandwidth) > 0 ? Number(dir.bandwidth) : null;

  let nPairsUsed = 0;
  // #1572 — in downhole mode the points are grouped by hole, so each hole's block of the loop is its own pair set
  const starts = dh ? dh.groups.map((g, i, arr) => arr.slice(0, i).reduce((s, x) => s + x.length, 0)) : null;
  let gi = 0, gEnd = dh ? (dh.groups[0]?.length ?? 0) : n;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    if (dh && i >= gEnd) { gi++; gEnd = starts[gi] + dh.groups[gi].length; }
    for (let j = i + 1; j < gEnd; j++) {
      const b = pts[j];
      if (holeMode === "between" && a.hole_id === b.hole_id) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxDist2 || d2 === 0) continue;
      const h = Math.sqrt(d2);
      const k = Math.round(h / lagDistance);
      if (k < 1 || k > nLags) continue;
      if (Math.abs(h - k * lagDistance) > lagTol) continue;
      if (plane && Math.abs(dx * plane.x + dy * plane.y + dz * plane.z) > plane.w) continue; // #2424 — off the plane by more than the half-width
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
      if (sumRoot) sumRoot[k] += Math.sqrt(Math.abs(dv));
      else if (absBins) { const B = absBins[k]; if (B.n === B.a.length) { const g = new Float32Array(B.a.length * 2); g.set(B.a); B.a = g; } B.a[B.n++] = Math.abs(dv); }
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
      gamma: estimator === "cressie" ? (sumRoot[k] / cnt[k]) ** 4 / (2 * (0.457 + 0.494 / cnt[k] + 0.045 / (cnt[k] * cnt[k]))) // #1996
        : estimator === "dowd" ? 1.099 * medianOf(absBins[k].a.subarray(0, absBins[k].n)) ** 2 // #1996: 2.198 × median² / 2
        : sum[k] / (2 * cnt[k]),     // Matheron: mean of half the squared differences
      nPairs: cnt[k],
    });
  }

  // #1572 — what the stride subsample cannot see: the shortest lag that holds any pair (the caption says so)
  const firstPairLag = bins.find((b) => b.nPairs > 0)?.h ?? null;
  return {
    bins, nPairsUsed, nPoints: n, mean, variance, subsampled, firstPairLag, estimator, // estimator: #1996
    holesUsed: dh ? dh.holesUsed : null, holesTotal: dh ? dh.holesTotal : null,
    // Journel & Huijbregts' standard caution, surfaced rather than assumed: a lag with fewer than ~30
    // pairs is not a measurement, and a variogram should not be interpreted past about half the
    // field's extent. maxReliableLag is the largest lag that clears the 30-pair bar contiguously.
    // TASKS.csv #1420 (review #1352, Silvertip) — counted from the first bin that has pairs: an empty first bin (no pairs
    // that close, e.g. a horizontal direction between holes) made it '0 m' while the 21.6 m bin held 39 pairs
    // TASKS.csv #2065 (review #2013, Woodjam) — the run starts at the first bin that CLEARS 30 pairs (not merely the first with pairs):
    // 'Between holes only' had a few pairs in its first bins and read 'only out to 0 m'; reliableFromLag says where the run starts
    ...(() => {
      let from = 0, last = 0;
      for (const b of bins) { if (!from) { if (b.nPairs >= 30) { from = b.lag; last = b.lag; } continue; } if (b.nPairs >= 30) last = b.lag; else break; }
      return { maxReliableLag: last, reliableFromLag: from };
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
// TASKS.csv #1576 (review #1497, Lawyers) — a fit is only a variogram if the data have a sill. On Lawyers' log Au at a 25 m lag the points
// rose steadily past the population variance and the fitted range moved 2.3x with the composite length (Ag 130 m at 1 m, 293 m at 5 m),
// with no warning beyond 'check it against the Variogram tool'. Two flags, over the reliable lags (30 pairs or more, up to maxReliableLag):
//   noSill       the last three reliable lags average more than 15 % above the variance (Lawyers' log Au levels off at 1.27x): a trend or
//                mixed domains; rising: and they still climb
//   rangeBeyond  the fitted range lies past the furthest reliable lag: extrapolated, not measured
// vg: experimentalVariogram's result; fit: fitVariogramModel's (or { range }). -> { noSill, rising, endRatio, rangeBeyond, reliableLagM }
export function variogramStationarity(vg, fit) {
  const out = { noSill: false, rising: false, endRatio: null, rangeBeyond: false, reliableLagM: null };
  const variance = Number(vg?.variance);
  const limit = vg?.maxReliableLag > 0 ? vg.maxReliableLag : Infinity;
  const rel = (vg?.bins || []).filter((b) => b.nPairs >= 30 && b.gamma != null && Number.isFinite(b.h) && b.lag <= limit);
  if (rel.length) out.reliableLagM = rel[rel.length - 1].h;
  if (variance > 0 && rel.length >= 4) {
    const last = rel.slice(-3), mean = last.reduce((s, b) => s + b.gamma, 0) / 3;
    out.endRatio = mean / variance;
    out.rising = last[2].gamma > last[0].gamma * 1.02 && last[1].gamma >= last[0].gamma * 0.98;
    out.noSill = out.endRatio > 1.15;
  }
  if (fit?.range > 0 && out.reliableLagM > 0) out.rangeBeyond = fit.range > out.reliableLagM * 1.05;
  return out;
}

// TASKS.csv #1996 — the directional variogram table: the same experimental variogram in 13 directions (azimuth 0-150° every 30° at dips
// 0° and 45°, and vertical), each fitted, so the direction of longest continuity is read off one table instead of 13 runs by hand.
// The pair cone is ±22.5° (the dialog's default). One direction per call, so the dialog can paint between them. -> { azimuth, dip,
// nPairs, range, nugget, sill, rSquared, maxReliableLag } (range null when no model could be fitted)
export const DIRECTION_TABLE = [...[0, 30, 60, 90, 120, 150].map((azimuth) => ({ azimuth, dip: 0 })), ...[0, 30, 60, 90, 120, 150].map((azimuth) => ({ azimuth, dip: 45 })), { azimuth: 0, dip: 90 }];
export function directionRow(points, base, dir, model = "spherical") {
  const vg = experimentalVariogram(points, { ...base, direction: { azimuth: dir.azimuth, dip: dir.dip, angleTol: 22.5, bandwidth: null } });
  const fit = vg.nPairsUsed >= 30 ? fitVariogramModel(vg.bins, { model }) : null;
  return { azimuth: dir.azimuth, dip: dir.dip, nPairs: vg.nPairsUsed, range: fit && fit.range > 0 ? fit.range : null, nugget: fit ? fit.nugget : null, sill: fit ? fit.sill : null, rSquared: fit ? fit.rSquared : null, maxReliableLag: vg.maxReliableLag };
}

// the direction to read the long axis from: the longest range among the fits that mean something (r² of 0.5 or more, 30 pairs, and a
// range within 1.5 × that direction's reliable lags); null when none does. On Woodjam Cu the longest raw range (993 m) had r² 0.10.
export function longestDirection(rows) {
  return (rows || []).filter((r) => r.range != null && r.nPairs >= 30 && r.rSquared >= 0.5 && !(r.maxReliableLag > 0 && r.range > 1.5 * r.maxReliableLag)).sort((a, b) => b.range - a.range)[0] || null;
}

export function fitVariogramModel(bins, opts = {}) {
  const model = opts.model || "spherical";
  const shape = (VARIOGRAM_MODELS[model] || VARIOGRAM_MODELS.spherical).shape;
  const usable = (bins || []).filter((b) => b.gamma != null && b.nPairs > 0 && Number.isFinite(b.h));
  if (usable.length < 3) return null;

  const hMax = arrMax(usable.map((b) => b.h));
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
    // TASKS.csv #1420 — the scan reaches 1.5x the furthest lag: a range past it was never measured (215.9 m on a 144 m axis)
    maxLag: hMax, beyondData: best.range > hMax,
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

// TASKS.csv #1027 (review #1016, resource geologist) — a seeded random subsample (the same points every run). A stride
// through composites stored hole by hole, down the hole, picks every k-th composite of the same hole (k = n / max), so a
// "nearest neighbour" measured on it was the downhole spacing times k: the lag grew with the number of holes loaded.
// TASKS.csv #3009 (WA iron review) — each query point's nearest accepted point among `pts`, by rings of a plan grid (a hole's composites
// share a column, so a 2D grid holds them together; the 3D distance is checked, and a ring is only searched while it can still be nearer):
// the same distances as the 600 x n scan, which took 2.9 s on the main thread on 147,000 composites. accept(a, b, d2) -> boolean.
// -> the distances found (unsorted)
export function nearestAmong(queries, pts, accept) {
  if (!pts.length || !queries.length) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const cell = Math.max(1e-6, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / pts.length) * 4);
  const key = (i, j) => i * 67108864 + j, grid = new Map();
  for (const p of pts) { const k = key(Math.floor((p.x - x0) / cell), Math.floor((p.y - y0) / cell)); const l = grid.get(k); if (l) l.push(p); else grid.set(k, [p]); }
  const span = Math.ceil(Math.max(x1 - x0, y1 - y0) / cell) + 2, out = [];
  for (const a of queries) {
    const i0 = Math.floor((a.x - x0) / cell), j0 = Math.floor((a.y - y0) / cell);
    let best = Infinity;
    const visit = (i, j) => { const l = grid.get(key(i, j)); if (!l) return; for (const b of l) { const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 < best && accept(a, b, d2)) best = d2; } };
    for (let r = 0; r <= span; r++) {
      if (r === 0) visit(i0, j0);
      else { for (let d = -r; d <= r; d++) { visit(i0 + d, j0 - r); visit(i0 + d, j0 + r); } for (let d = -r + 1; d <= r - 1; d++) { visit(i0 - r, j0 + d); visit(i0 + r, j0 + d); } }
      if (best <= (r * cell) ** 2) break; // a point in a farther ring is more than r cells away in plan
    }
    if (best < Infinity) out.push(Math.sqrt(best));
  }
  return out;
}

// TASKS.csv #3015 (WA iron review) — the share of holes within `maxTiltDeg` of vertical (collar and every survey station; dip positive
// down or negative down, either sign read as its size). -> 0..1 (0 with no hole)
export function verticalShare(collars, survey, maxTiltDeg = 5) {
  const bad = new Set(), lim = 90 - maxTiltDeg;
  for (const s of survey || []) { const d = Math.abs(Number(s?.dip)); if (Number.isFinite(d) && d < lim) bad.add(s.hole_id); }
  let n = 0, v = 0;
  for (const c of collars || []) { const d = Math.abs(Number(c?.dip)); n++; if ((!Number.isFinite(d) || d >= lim) && !bad.has(c.hole_id)) v++; }
  return n ? v / n : 0;
}

function randomSubsample(points, maxPoints, seed = 1) {
  if (points.length <= maxPoints) return points;
  const idx = Uint32Array.from(points, (_, i) => i);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < maxPoints; i++) { // partial Fisher-Yates
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = i + (s % (idx.length - i));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return Array.from(idx.subarray(0, maxPoints), (i) => points[i]);
}

// TASKS.csv #1027 — the spacing BETWEEN holes: for a random 600 of the composites, the distance to the nearest composite
// in another hole (searched over all of them), median. This is the scale a block estimate interpolates across, so it
// is the lag an automatic fit needs; the downhole spacing only resolves the nugget. null without hole ids or with one hole.
export function suggestBetweenHoleLag(points) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) && p.hole_id != null);
  if (new Set(pts.map((p) => p.hole_id)).size < 2) return null;
  const nn = nearestAmong(randomSubsample(pts, 600), pts, (a, b) => b.hole_id !== a.hole_id); // #3009 — grid-searched, the same distances
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}

// TASKS.csv #2221 (review #2174, WA gold) — 'Between holes only' suggested 4.6 m on a deposit whose drill sites are 27-226 m apart: holes
// fanned from one underground site are under a metre apart at the collar, so the nearest composite in ANOTHER hole is close by. Between
// holes, the scale is the spacing of the drill SITES (holeSpacing.js: collars within 25 m are one site): half the typical (median
// nearest-site) spacing, and as many lags as reach the farthest site's nearest neighbour. -> { lag, nLags, spacing } | null
export function siteSpacingLag(spacing, maxLags = 30) {
  if (!spacing || !(spacing.medianM > 0)) return null;
  const lag = Math.max(1, Math.round(spacing.medianM / 2));
  return { lag, nLags: Math.min(maxLags, Math.max(6, Math.ceil(spacing.farthestM / lag))), spacing };
}
// the lags stop short of the drill spacing: the variogram cannot show continuity between holes
export const lagsShortOfSpacing = (lag, nLags, spacing) => !!spacing && lag * nLags < spacing.medianM;

// A sane default lag distance for a point set: the median nearest-neighbour distance, which is the
// finest structure the data can actually resolve. Guessing this badly is the most common way to get a
// meaningless-looking variogram (too small = empty bins and noise, too large = every structure
// smoothed into the first bin), so the UI proposes it instead of making the user find it by trial.
export function suggestLagDistance(points) {
  const pts = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (pts.length < 2) return null;
  // #1027 — a random 600 of the points, each one's nearest neighbour among ALL the points (600 x n): the median of a
  // stride subsample's own neighbours was a multiple of the real spacing that grew with n
  const nn = nearestAmong(randomSubsample(pts, 600), pts, (a, b, d2) => d2 > 0); // #3009 — grid-searched, the same distances
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}
