// TASKS.csv #3962 (P1) — the intercepts of one realization along a planned hole, by Best intercepts' own rules (geochem.js
// computeBestIntercepts): a run of samples at or above the cut-off; a gap is bridged only when it is at most the internal dilution and
// the intercept still averages the cut-off afterwards; an intercept shorter than the minimum length is dropped; the grade is over the
// sampled metres, and grade x length over the sampled metres ranks them. Here the samples are the realization's composites, one per
// `step` metres, and a composite with no prediction (beyond the drilling) is an unsampled gap. test/drillPlannerP1 checks it against
// computeBestIntercepts on the same rows. Kept separate because it runs 200 times per hole: no row objects, no grouping.
const EPS = 1e-6;

// from: Float64Array of composite tops (md), step: composite length, values: Float64Array (NaN = no prediction there)
// -> { best: { from, to, length, grade, gt } | null, totalM, count }
export function seriesIntercepts(from, step, values, { cutoff = 0, maxInternalDilution = 2, minLength = 0 } = {}) {
  const n = values.length;
  let best = null, totalM = 0, count = 0;
  let cur = null; // { from, to, gradeLen, assayedLen }
  let pendGrade = 0, pendAssayed = 0; // below-cut-off metres since the last sample above it
  const flush = () => {
    if (cur) {
      const length = cur.to - cur.from;
      if (length >= minLength - EPS) {
        const grade = cur.assayedLen > 0 ? cur.gradeLen / cur.assayedLen : 0, gt = grade * cur.assayedLen;
        totalM += length; count++;
        if (!best || gt > best.gt) best = { from: cur.from, to: cur.to, length, grade, gt };
      }
    }
    cur = null; pendGrade = 0; pendAssayed = 0;
  };
  for (let i = 0; i < n; i++) {
    const a = from[i], b = a + step, v = values[i], sampled = Number.isFinite(v);
    if (sampled && v >= cutoff) {
      if (cur) {
        const gap = a - cur.to;
        const newAssayed = cur.assayedLen + pendAssayed + step;
        const bridged = newAssayed > 0 ? (cur.gradeLen + pendGrade + v * step) / newAssayed : 0;
        if (gap <= maxInternalDilution + EPS && bridged >= cutoff - EPS) {
          cur.to = b; cur.gradeLen += pendGrade + v * step; cur.assayedLen = newAssayed;
          pendGrade = 0; pendAssayed = 0;
        } else { flush(); cur = { from: a, to: b, gradeLen: v * step, assayedLen: step }; }
      } else cur = { from: a, to: b, gradeLen: v * step, assayedLen: step };
    } else if (cur) {
      if (sampled) { pendGrade += v * step; pendAssayed += step; }
      if (b - cur.to > maxInternalDilution + EPS) flush();
    }
  }
  flush();
  return { best, totalM, count };
}
