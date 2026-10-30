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

// A rough guide to training only, on the i7 the measurements came from
export const trainSeconds = (points, inducing, iterations) => iterations * 0.27 * (points / 1461) * (inducing / 407) ** 2;
// grade: Woodjam 4,056 composites, 200 inducing, 150 iterations ~100 s of training
export const gradeSeconds = (composites, inducing, iterations) => (100 * (composites / 4056) * (inducing / 200) ** 2 * iterations) / 150;

const metresOf = (intervals) => { let m = 0; for (const r of intervals) m += Math.max(0, r.to - r.from); return m; };
const near = (a, b, d) => Number.isFinite(a.x) && Number.isFinite(b.x) && Math.hypot(a.x - b.x, a.y - b.y) <= d;

// intervals: [{ hole_id, from, to, value }]; targets / exclude: code sets; trainSpacing, inducingSpacing, iterations from the
// quality setting. -> { holeIds (Set, or null = every hole), nHoles, totalHoles, focused, factor, trainSpacing, inducingSpacing,
// points, inducing, seconds, wanted: { points, inducing, seconds } }
export function planDomain({ collars, intervals, targets, exclude = new Set(), trainSpacing, inducingSpacing, iterations, focusM = FOCUS_M }) {
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
  const points = s.points / factor, inducing = s.inducing / factor;
  return {
    holeIds, focused: !!holeIds, nHoles: holeIds ? holeIds.size : collars.length, totalHoles: collars.length, focusM, factor,
    trainSpacing: +(trainSpacing * factor).toFixed(1), inducingSpacing: +(inducingSpacing * factor).toFixed(1),
    points: Math.round(points), inducing: Math.round(inducing), seconds: trainSeconds(points, inducing, iterations), wanted,
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
