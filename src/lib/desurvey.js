const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const clamp1 = (v) => Math.min(1, Math.max(-1, v));

// TASKS.csv #135 — selectable desurvey method. Older/legacy datasets and some drilling contractors
// deliver a survey file alongside coordinates that were desurveyed with a SPECIFIC method, and the
// only way to reproduce those reported collar-to-toe coordinates exactly is to run the same method.
// Minimum curvature stays the default (what this app has always named its method, and what
// essentially every commercial package uses); the other three are opt-in per project via
// project.desurveyMethod (store.jsx).
//
// !! EXISTING PROJECTS' HOLE COORDINATES DO MOVE SLIGHTLY. Read this before assuming otherwise. !!
// The pre-#135 code was labelled minimum curvature but was NOT textbook minimum curvature: it
// interpolated the survey angles LINEARLY onto a fixed 3 m grid and applied the MC step to each 3 m
// piece. Sub-stepping with linearly-interpolated angles converges to the RADIUS-OF-CURVATURE model,
// not to the station-to-station circular arc — measured, the old output sat closer to this file's
// `radiusOfCurvature` than to its `minimumCurvature` on every hole tested. This version applies the
// method once per REAL station pair, which is the actual textbook definition and the only way to
// reproduce a contractor's reported coordinates.
// Measured change (see #135's TASKS.csv notes for the full table):
//   - sample_data (6 holes, stations every 50 m): max 0.040 m, mean ~0.016 m
//   - sample_data/harry_property (37 real collars, no survey rows -> straight holes): 9.3e-10 m
//   - a deliberately sparse synthetic (one 500 m interval turning 60 deg): 56.5 m
// So: nil for straight holes, centimetres for normally-surveyed holes (far below survey accuracy),
// but potentially large for a hole with very sparse, strongly-deviated stations. This is a
// correction, not a regression — but it is a real change and must not be described as a no-op.
//
// All four operate on the same station list and the same internal frame: I = inclination measured
// FROM VERTICAL (deg, so 0 = straight down), Az = compass bearing (deg), and the returned deltas are
// (dN north, dE east, dTVD depth-below-collar, positive down).
export const DESURVEY_METHODS = [
  { id: "minimumCurvature", label: "Minimum curvature", hint: "Circular-arc between stations. Industry standard and this app's default — matches Leapfrog/Micromine/Datamine." },
  { id: "balancedTangential", label: "Balanced tangential", hint: "Half the interval along the upper station's direction, half along the lower's. Minimum curvature without the ratio factor." },
  { id: "radiusOfCurvature", label: "Radius of curvature", hint: "Assumes inclination and azimuth both vary linearly with depth along the interval." },
  { id: "tangential", label: "Tangential", hint: "Whole interval along the LOWER station's direction. Oldest and least accurate — only pick it to reproduce legacy coordinates computed this way." },
];
export const DEFAULT_DESURVEY_METHOD = "minimumCurvature";
export const normalizeDesurveyMethod = (m) => (DESURVEY_METHODS.some((x) => x.id === m) ? m : DEFAULT_DESURVEY_METHOD);
export const desurveyMethodLabel = (m) => (DESURVEY_METHODS.find((x) => x.id === normalizeDesurveyMethod(m))?.label || "Minimum curvature");

// Unit tangent vector for a station attitude, in the same (N, E, TVD-down) frame the step functions
// accumulate in.
function dirNET(I, Az) {
  const i = toRad(I), a = toRad(Az);
  return { n: Math.sin(i) * Math.cos(a), e: Math.sin(i) * Math.sin(a), d: Math.cos(i) };
}

// Shortest signed azimuth delta in (-180, 180] — see the #218 note on interpAtStation below for why
// raw degree subtraction is wrong for a compass bearing (355 -> 5 must be +10, not -350). Every
// method below consumes an UNWRAPPED lower-station azimuth (Az1 + shortAzDelta) so this only has to
// be got right in one place.
const shortAzDelta = (from, to) => ((((to - from) % 360) + 540) % 360) - 180;

function mcStep(md1, I1, Az1, md2, I2, Az2) {
  const dMD = md2 - md1;
  if (dMD <= 0) return { dN: 0, dE: 0, dTVD: 0 };
  const i1 = toRad(I1), i2 = toRad(I2), a1 = toRad(Az1), a2 = toRad(Az2);
  const cosDL = Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1));
  const dogleg = Math.acos(clamp1(cosDL));
  const RF = dogleg < 1e-9 ? 1 : (2 / dogleg) * Math.tan(dogleg / 2);
  const dN = (dMD / 2) * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)) * RF;
  const dE = (dMD / 2) * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)) * RF;
  const dTVD = (dMD / 2) * (Math.cos(i1) + Math.cos(i2)) * RF;
  return { dN, dE, dTVD };
}

// Radius of curvature: integrates the tangent assuming I and Az each vary LINEARLY with measured
// depth over the interval, which gives closed-form ratios of trig differences. Each ratio is a
// 0/0 removable singularity when the angle doesn't change over the interval, so each one falls back
// to its own analytic limit (the derivative) rather than dividing by ~0 — without that, a perfectly
// straight hole (by far the most common case in this dataset) would produce NaN.
function rcStep(dMD, I1, Az1, I2, Az2) {
  if (dMD <= 0) return { dN: 0, dE: 0, dTVD: 0 };
  const i1 = toRad(I1), i2 = toRad(I2), a1 = toRad(Az1), a2 = toRad(Az2);
  const dI = i2 - i1, dA = a2 - a1;
  const EPS = 1e-9;
  const fTVD = Math.abs(dI) < EPS ? Math.cos(i1) : (Math.sin(i2) - Math.sin(i1)) / dI;   // -> cos I
  const fHor = Math.abs(dI) < EPS ? Math.sin(i1) : (Math.cos(i1) - Math.cos(i2)) / dI;   // -> sin I
  const fN = Math.abs(dA) < EPS ? Math.cos(a1) : (Math.sin(a2) - Math.sin(a1)) / dA;     // -> cos Az
  const fE = Math.abs(dA) < EPS ? Math.sin(a1) : (Math.cos(a1) - Math.cos(a2)) / dA;     // -> sin Az
  return { dN: dMD * fHor * fN, dE: dMD * fHor * fE, dTVD: dMD * fTVD };
}

// Exact station-to-station delta for one interval, for whichever method is selected. `Az2` must
// already be unwrapped relative to `Az1` (see shortAzDelta).
function methodStep(method, dMD, I1, Az1, I2, Az2) {
  if (dMD <= 0) return { dN: 0, dE: 0, dTVD: 0 };
  if (method === "tangential") {
    const d = dirNET(I2, Az2);
    return { dN: d.n * dMD, dE: d.e * dMD, dTVD: d.d * dMD };
  }
  if (method === "balancedTangential") {
    const d1 = dirNET(I1, Az1), d2 = dirNET(I2, Az2), h = dMD / 2;
    return { dN: (d1.n + d2.n) * h, dE: (d1.e + d2.e) * h, dTVD: (d1.d + d2.d) * h };
  }
  if (method === "radiusOfCurvature") return rcStep(dMD, I1, Az1, I2, Az2);
  return mcStep(0, I1, Az1, dMD, I2, Az2);
}

// Render/sample spacing along the trace. Intermediate points exist purely so the 3D view (and the
// interval-tube / point-on-trace consumers) have a reasonably dense polyline; they are NOT extra
// desurvey stations. Each method therefore generates its intermediates from its OWN trajectory model
// so that the point at the end of every interval is bit-for-bit the exact station-to-station answer:
//  - tangential        : a straight line along the lower station's direction — interpolate linearly.
//  - balancedTangential: literally two straight half-intervals — exact by construction.
//  - radiusOfCurvature : the model already assumes linear-in-MD angles, so sub-stepping with linearly
//                        interpolated angles reproduces the same curve exactly.
//  - minimumCurvature  : the model is a circular arc, so the tangent is SLERPed (not linearly
//                        interpolated) — a sub-step of fraction f sweeps exactly f x the dogleg and
//                        so lands exactly on the same arc.
// (Before #135 this file interpolated angles linearly on a fixed 3 m grid and applied the minimum-
// curvature step to each 3 m piece. That is NOT a close approximation of the station-to-station arc —
// it converges to the radius-of-curvature model instead. See this file's header and #135's TASKS.csv
// notes for the measured difference.)
const SAMPLE_SPACING = 3;

function segmentSamples(method, dMD, I1, Az1, I2, Az2) {
  const nSub = Math.max(1, Math.ceil(dMD / SAMPLE_SPACING));
  const out = [];
  if (method === "tangential" || method === "balancedTangential") {
    const d1 = dirNET(I1, Az1), d2 = dirNET(I2, Az2), h = dMD / 2;
    for (let k = 1; k <= nSub; k++) {
      const s = (dMD * k) / nSub;
      // tangential: all of it along d2. balanced: first half along d1, second half along d2.
      const s1 = method === "tangential" ? 0 : Math.min(s, h);
      const s2 = method === "tangential" ? s : Math.max(0, s - h);
      out.push({ md: s, dN: d1.n * s1 + d2.n * s2, dE: d1.e * s1 + d2.e * s2, dTVD: d1.d * s1 + d2.d * s2 });
    }
    return out;
  }
  if (method === "radiusOfCurvature") {
    for (let k = 1; k <= nSub; k++) {
      const f = k / nSub;
      out.push({ md: dMD * f, ...rcStep(dMD * f, I1, Az1, I1 + (I2 - I1) * f, Az1 + (Az2 - Az1) * f) });
    }
    return out;
  }
  const t1 = dirNET(I1, Az1), t2 = dirNET(I2, Az2);
  const phi = Math.acos(clamp1(t1.n * t2.n + t1.e * t2.e + t1.d * t2.d)); // the dogleg angle
  for (let k = 1; k <= nSub; k++) {
    const f = k / nSub;
    let I = I1, Az = Az1;
    if (phi >= 1e-9) {
      const w1 = Math.sin((1 - f) * phi) / Math.sin(phi), w2 = Math.sin(f * phi) / Math.sin(phi);
      const n = t1.n * w1 + t2.n * w2, e = t1.e * w1 + t2.e * w2, d = t1.d * w1 + t2.d * w2;
      I = toDeg(Math.acos(clamp1(d)));
      Az = toDeg(Math.atan2(e, n)); // may be negative; mcStep only ever uses azimuth differences/trig
    }
    out.push({ md: dMD * f, ...mcStep(0, I1, Az1, dMD * f, I, Az) });
  }
  return out;
}

// Builds the {md, I (inclination from vertical), Az} station list desurveyHole/surveyAzimuthDipAt both
// interpolate against — the "collar-only, no survey rows" straight-hole fallback lives here once so
// both callers see the exact same effective survey.
function stationsWithInclination(collar, survey) {
  let stations = survey && survey.length ? [...survey].sort((a, b) => a.depth - b.depth) : [];
  if (!stations.length) {
    if (collar.azimuth == null || collar.dip == null || isNaN(collar.azimuth) || isNaN(collar.dip)) return [];
    const md = collar.length && !isNaN(collar.length) ? collar.length : 300;
    stations = [{ depth: 0, azimuth: collar.azimuth, dip: collar.dip }, { depth: md, azimuth: collar.azimuth, dip: collar.dip }];
  }
  if (stations[0].depth > 0) stations.unshift({ depth: 0, azimuth: stations[0].azimuth, dip: stations[0].dip });
  return stations.map((s) => ({ md: s.depth, I: 90 - s.dip, Az: s.azimuth }));
}

// Interpolates {md, I, Az} at an arbitrary MD along a stationsWithInclination() list.
function interpAtStation(withI, md) {
  let lo = withI[0], hi = withI[withI.length - 1];
  for (let i = 0; i < withI.length - 1; i++) if (md >= withI[i].md && md <= withI[i + 1].md) { lo = withI[i]; hi = withI[i + 1]; break; }
  const span = hi.md - lo.md, t = span <= 0 ? 0 : (md - lo.md) / span;
  // TASKS.csv #218 — azimuth is a compass bearing, not a plain number: interpolating the raw degree
  // values (e.g. 355 -> 5) took the LONG way around through 180 instead of the short way through
  // 0/360, producing large positional errors on any north-trending hole. Unwrap to the shortest
  // signed delta in (-180, 180] before interpolating, then normalize the result back to [0, 360).
  const rawDelta = hi.Az - lo.Az;
  const shortDelta = ((rawDelta % 360) + 540) % 360 - 180;
  let az = lo.Az + shortDelta * t;
  az = ((az % 360) + 360) % 360;
  return { md, I: lo.I + (hi.I - lo.I) * t, Az: az };
}

// Hole azimuth/dip (deg below horizontal, same convention as a survey row's own `dip`) interpolated at
// an arbitrary depth — used by the core-orientation calculator to auto-fill a hole's true attitude at
// the depth of a structural pick, instead of requiring it typed in by hand. Returns null for a hole
// with no usable survey/collar dip data (mirrors desurveyHole's own empty-array case).
export function surveyAzimuthDipAt(collar, survey, depth) {
  const withI = stationsWithInclination(collar, survey);
  if (!withI.length) return null;
  const { I, Az } = interpAtStation(withI, depth);
  return { azimuth: Az, dip: 90 - I };
}

// survey: [{depth, azimuth, dip}] dip = deg below horizontal. Returns world {md,x,y,z} polyline.
// `method` is one of DESURVEY_METHODS' ids (TASKS.csv #135); anything else (including the undefined
// every pre-#135 call site passes) falls back to minimum curvature, i.e. exactly the old behaviour.
//
// The accumulation now walks the REAL survey stations, not a fixed 3 m grid, so the position at each
// station is precisely what the chosen method's textbook formula gives for that station — which is
// the whole point of the feature (reproducing a client's reported coordinates). Intermediate points
// are generated inside each interval by segmentSamples() and always land on the chosen method's own
// trajectory, so they can be sampled freely without pulling the result off-method.
export function desurveyHole(collar, survey, method) {
  const m = normalizeDesurveyMethod(method);
  const withI = stationsWithInclination(collar, survey);
  if (!withI.length) return [];
  let N = 0, E = 0, TVD = 0;
  const pts = [{ md: withI[0].md, N: 0, E: 0, TVD: 0 }];
  for (let i = 1; i < withI.length; i++) {
    const a = withI[i - 1], b = withI[i];
    const dMD = b.md - a.md;
    if (!(dMD > 0)) continue;
    const az2 = a.Az + shortAzDelta(a.Az, b.Az);
    const samples = segmentSamples(m, dMD, a.I, a.Az, b.I, az2);
    for (const s of samples) pts.push({ md: a.md + s.md, N: N + s.dN, E: E + s.dE, TVD: TVD + s.dTVD });
    const last = samples[samples.length - 1];
    N += last.dN; E += last.dE; TVD += last.dTVD;
  }
  return pts.map((p) => ({ md: p.md, x: collar.x + p.E, y: collar.y + p.N, z: collar.z - p.TVD }));
}

// Station-to-station positions only (no render subdivision): exactly one point per real survey
// station, each the chosen method's textbook formula applied straight across that interval with no
// intermediate sampling in the way.
//
// Nothing in the UI calls this yet — it exists as the method's *reference* answer, and that is its
// point: #135's Node verification uses it to check desurveyHole's sampled trace lands bit-for-bit on
// the station-to-station result for every method (worst observed mismatch 2.3e-13 m), which is what
// makes it safe for the rest of the app to sample desurveyHole's dense polyline freely. Keep them
// agreeing — if a future change makes desurveyHole's intermediate points drift off the chosen
// method's own trajectory, this is the function that will catch it.
export function desurveyStations(collar, survey, method) {
  const m = normalizeDesurveyMethod(method);
  const withI = stationsWithInclination(collar, survey);
  if (!withI.length) return [];
  let N = 0, E = 0, TVD = 0;
  const out = [{ md: withI[0].md, x: collar.x, y: collar.y, z: collar.z }];
  for (let i = 1; i < withI.length; i++) {
    const a = withI[i - 1], b = withI[i];
    const az2 = a.Az + shortAzDelta(a.Az, b.Az);
    const { dN, dE, dTVD } = methodStep(m, b.md - a.md, a.I, a.Az, b.I, az2);
    N += dN; E += dE; TVD += dTVD;
    out.push({ md: b.md, x: collar.x + E, y: collar.y + N, z: collar.z - TVD });
  }
  return out;
}

// Interpolate a world-space {x,y,z} position at an arbitrary MD along an already-desurveyed trace
// (the array desurveyHole() returns). Pulled out as its own export — several callers (section views,
// the strip-log/3D-view rendering in ViewerModule, and now the grade-estimation sample-point builder
// in estimation.js) all need "where is the hole at depth D" and previously each grew its own inline
// copy of this same interpolation; sharing one here keeps the (deliberately simple, linear-between-
// stations) interpolation behavior consistent everywhere it's used.
export function pointOnTrace(pts, md) {
  if (!pts || !pts.length) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md - 0.01 && md <= pts[i + 1].md + 0.01) {
      const span = pts[i + 1].md - pts[i].md, t = span <= 0 ? 0 : (md - pts[i].md) / span;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t };
    }
  }
  const edge = md <= pts[0].md ? pts[0] : pts[pts.length - 1];
  return { x: edge.x, y: edge.y, z: edge.z };
}
