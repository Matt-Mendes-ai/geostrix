// TASKS.csv #1146 — sizing a geoML run to what a computer can do, before it is sent. Treaty Creek (398 holes, PS_POR, Fast):
// 24,218 training points and about 3,000 inducing points took 5.4 GB, filled the memory (disk at 100 %: swapping) and sat at 8 %.
// A variational GP costs about points x inducing² per iteration. Measured: Harry 1,461 points, 407 inducing, 0.27 s per
// iteration, so that run was ~900 x slower: ~4 min per iteration, ~10 h for 150 iterations, before any swapping.
// A rock unit: holes far from it say nothing about it, so when a run is over budget only the holes within FOCUS_M of a hole
// that logged the unit are sent (the model then covers that area only), and if that is still too much the spacing is
// coarsened. A grade model has no unit to focus on: its composites get longer. A run within budget goes exactly as asked.
// Pure: no React, no DOM.
import { t as tr } from "./i18n.js";

export const POINT_BUDGET = 4000;     // training points: 2.7 x Harry
export const INDUCING_BUDGET = 500;   // inducing points: 1.2 x Harry; together ~1 s per iteration
export const COMPOSITE_BUDGET = 8000; // composites at the 200-500 inducing points of the quality settings
export const FOCUS_M = 1000;          // 2.5 x the 400 m range training starts from
// TASKS.csv #1158 — the add-on (0.1.3+) keeps this many of the inducing points geoML built along the holes when the unit's contacts
// would build more. Measured on Treaty Creek (Fast): PS_DK 1,779 uncapped 30 min, 4.25 GB, 39 % of logged in-unit points inside;
// thinned to 800: 5 min, 2.4 GB, 21 %; k-means instead predicted the unit nowhere. V4 thinned to 800: 7.8 min, 3.4 GB, 0 % (a poor
// model, which the run's fit check now says); V4 uncapped (about 5,970) past 5 GB on its first iterations.
export const INDUCING_CAP = 800;
// Above this an add-on with no cap is refused: it would fill the memory of the computer it runs on
export const INDUCING_LIMIT_NO_CAP = 2500;

// A rough guide to training only, on the i7 the measurements came from
export const trainSeconds = (points, inducing, iterations) => iterations * 0.27 * (points / 1461) * (inducing / 407) ** 2;
// grade: Woodjam 4,056 composites, 200 inducing, 150 iterations ~100 s of training
export const gradeSeconds = (composites, inducing, iterations) => (100 * (composites / 4056) * (inducing / 200) ** 2 * iterations) / 150;

const metresOf = (intervals) => { let m = 0; for (const r of intervals) m += Math.max(0, r.to - r.from); return m; };
const near = (a, b, d) => Number.isFinite(a.x) && Number.isFinite(b.x) && Math.hypot(a.x - b.x, a.y - b.y) <= d;

// TASKS.csv #1158 — what the add-on really builds: geoML merges each hole into runs of unit / not unit, drops points along each
// run at the spacing (at least one per run) and adds one point per contact, so a unit with many thin runs has many points at
// any spacing. Metres / spacing said 500 inducing points for Treaty Creek V4; it builds about 5,970. Checked against measured
// runs: PS_POR 3,215 and 530 points (this gives 3,263 and 560), V4 7,976 (8,391).
export function holeRuns(intervals, targets) {
  const by = new Map();
  for (const r of intervals) { const k = String(r.hole_id); (by.get(k) || by.set(k, []).get(k)).push(r); }
  const lengths = [];
  let contacts = 0;
  for (const list of by.values()) {
    list.sort((a, b) => a.from - b.from);
    let cls = null, start = 0, end = 0;
    for (const r of list) {
      const c = targets.has(String(r.value));
      if (c !== cls) { if (cls !== null) { lengths.push(end - start); contacts++; } cls = c; start = r.from; }
      end = r.to;
    }
    if (cls !== null) lengths.push(end - start);
  }
  return { lengths, contacts };
}
// TASKS.csv #1312 — dense sampling near the unit: every 2.5 m in it and at its contacts, the other rock thinned to FOCUS_OTHER. Scored on holes
// left out of training (Fast; inside / outside): PS_POR 0 / 100 -> 24 / 95, PS_DK 0 / 100 -> 17 / 97, Harry SED 23 / 94 -> 37 / 93 (mean of
// 4 folds), Woodjam VANSS 26 / 93 -> 49 / 95 (4 folds), OB unchanged; but Woodjam IMMOQ 49 / 67 -> 7 / 95. Run length does not predict that
// loss (IMMOQ 10.5 m, VANSS 12.6 m), so only units with thin runs, which none of it harmed, get it by default; any other may try it.
export const FOCUS_SPACING = 2.5, FOCUS_OTHER = 3000, THIN_RUN_M = 5;
const medianOf = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
// holeRuns' lengths with only the unit's own runs
export function unitRuns(intervals, targets) {
  const by = new Map();
  for (const r of intervals) { const k = String(r.hole_id); (by.get(k) || by.set(k, []).get(k)).push(r); }
  const lengths = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.from - b.from);
    let cur = 0;
    for (const r of list) { if (targets.has(String(r.value))) cur += r.to - r.from; else { if (cur) lengths.push(cur); cur = 0; } }
    if (cur) lengths.push(cur);
  }
  return lengths;
}
// -> { medianRunM, thin, available, points } for a plan's intervals; available: it would fit the budget and be finer than the spacing in use
export function focusPlan(intervals, targets, trainSpacing, otherPoints, contacts, deep = false) {
  const lengths = unitRuns(intervals, targets);
  const medianRunM = +medianOf(lengths).toFixed(1);
  const nearPoints = lengths.reduce((n, m) => n + Math.max(1, Math.round(m / FOCUS_SPACING)), contacts);
  const points = nearPoints + Math.min(FOCUS_OTHER, otherPoints);
  return { medianRunM, thin: medianRunM > 0 && medianRunM < THIN_RUN_M, points, available: !deep && trainSpacing > FOCUS_SPACING && lengths.length > 0 && points <= POINT_BUDGET * 1.25 };
}
export const pointsAtSpacing = ({ lengths, contacts }, spacing) => lengths.reduce((n, m) => n + Math.max(1, Math.round(m / spacing)), contacts);

// intervals: [{ hole_id, from, to, value }]; targets / exclude: code sets; trainSpacing, inducingSpacing, iterations from the
// quality setting. -> { holeIds (Set, or null = every hole), nHoles, totalHoles, focused, factor, trainSpacing, inducingSpacing,
// points, inducing, seconds, wanted: { points, inducing, seconds } }
export function planDomain({ collars, intervals, targets, exclude = new Set(), trainSpacing, inducingSpacing, iterations, focusM = FOCUS_M, dense = null, deep = false }) {
  const used = intervals.filter((r) => !exclude.has(String(r.value)));
  const size = (list) => { const m = metresOf(list); return { points: m / trainSpacing, inducing: m / inducingSpacing }; };
  const over = (s) => s.points > POINT_BUDGET || s.inducing > INDUCING_BUDGET;
  const all = size(used);
  const wanted = { points: Math.round(all.points), inducing: Math.round(all.inducing), seconds: trainSeconds(all.points, all.inducing, iterations) };
  let holeIds = null, list = used, s = all;
  if (over(all)) {
    const withUnit = new Set(used.filter((r) => targets.has(String(r.value))).map((r) => String(r.hole_id)));
    const anchors = collars.filter((c) => withUnit.has(String(c.hole_id)));
    if (anchors.length) {
      const keep = new Set(collars.filter((c) => withUnit.has(String(c.hole_id)) || anchors.some((a) => near(a, c, focusM))).map((c) => String(c.hole_id)));
      if (keep.size < collars.length) { holeIds = keep; list = used.filter((r) => keep.has(String(r.hole_id))); s = size(list); }
    }
  }
  const factor = over(s) ? Math.max(s.points / POINT_BUDGET, s.inducing / INDUCING_BUDGET) : 1;
  // TASKS.csv #1158 — the spacing is sized on the metres (as #1146), the estimate counts what will really be built. A collar-less
  // hole's intervals are dropped by the add-on, so they are not counted.
  const known = new Set(collars.map((c) => String(c.hole_id)));
  const runs = holeRuns(list.filter((r) => known.has(String(r.hole_id))), targets);
  const built = pointsAtSpacing(runs, inducingSpacing * factor), inducing = Math.min(built, INDUCING_CAP);
  const knownList = list.filter((r) => known.has(String(r.hole_id)));
  const plain = pointsAtSpacing(runs, trainSpacing * factor);
  const focus = focusPlan(knownList, targets, trainSpacing * factor, Math.round((metresOf(knownList.filter((r) => !targets.has(String(r.value))))) / FOCUS_SPACING), runs.contacts, deep);
  const denseOn = focus.available && (dense === null ? focus.thin : dense); // #1312 — null: by the rule; the geologist's tick overrides it
  const points = denseOn ? focus.points : plain;
  return {
    focus, denseOn,
    holeIds, focused: !!holeIds, nHoles: holeIds ? holeIds.size : collars.length, totalHoles: collars.length, focusM, factor,
    trainSpacing: +(trainSpacing * factor).toFixed(1), inducingSpacing: +(inducingSpacing * factor).toFixed(1),
    contacts: runs.contacts, inducingBuilt: built, capped: built > INDUCING_CAP,
    points, inducing, seconds: trainSeconds(points, inducing, iterations), secondsNoCap: trainSeconds(points, built, iterations), wanted,
  };
}

// samples: [{ from, to }]; composite, inducing, iterations from the quality setting.
// -> { composite, composites, factor, seconds, wanted: { composites, seconds } }
export function planGrade({ samples, composite, inducing, iterations }) {
  const n = metresOf(samples) / composite;
  const factor = n > COMPOSITE_BUDGET ? n / COMPOSITE_BUDGET : 1;
  const c = factor > 1 ? Math.ceil(composite * factor) : composite, composites = metresOf(samples) / c;
  return { composite: c, composites: Math.round(composites), factor, seconds: gradeSeconds(composites, inducing, iterations), wanted: { composites: Math.round(n), seconds: gradeSeconds(n, inducing, iterations) } };
}

// "about 3 min" / "about 10 h": an estimate should not look exact
export function roughTime(seconds) {
  const s = Math.max(0, seconds || 0);
  if (s < 90) return tr("about a minute");
  if (s < 3600) return tr("about {n} min", { n: Math.round(s / 60) });
  return tr("about {n} h", { n: +(s / 3600).toFixed(s < 36000 ? 1 : 0) });
}
