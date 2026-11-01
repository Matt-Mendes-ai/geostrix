// TASKS.csv #1318 — Matt: geoML "still leaves intercepts out of the model", and no setting reaches all of them (#1317), so say which. Each logged
// run of the unit is sampled along the trace the app draws, the add-on returns the model's probability there, and an intercept counts as reached when
// any of its points is over 50%, the same line the blocks are shown at.
export const CHECK_STEP_M = 2.5, CHECK_MAX_PER_INTERCEPT = 40;

// intervals: [{ hole_id, from, to, value }]; targets: a Set of codes -> [{ hole_id, from, to }], touching intervals of the unit as one
export function unitIntercepts(intervals, targets) {
  const by = new Map();
  for (const r of intervals) { const k = String(r.hole_id); (by.get(k) || by.set(k, []).get(k)).push(r); }
  const out = [];
  for (const [hole_id, list] of by) {
    list.sort((a, b) => a.from - b.from);
    let cur = null;
    for (const r of list) {
      if (!targets.has(String(r.value))) { cur = null; continue; }
      if (cur && r.from <= cur.to + 0.01) cur.to = Math.max(cur.to, r.to);
      else out.push(cur = { hole_id, from: r.from, to: r.to });
    }
  }
  return out;
}

// -> { points: [[x, y, z]], spans: [{ hole_id, from, to, start, count }] }; a hole with no collar or trace has no span
export function interceptCheckPoints(intercepts, collars, survey, desurveyHole, pointOnTrace, method) {
  const collarOf = new Map(collars.map((c) => [String(c.hole_id), c])), surveyOf = new Map(), traces = new Map();
  for (const s of survey || []) { const k = String(s.hole_id); (surveyOf.get(k) || surveyOf.set(k, []).get(k)).push(s); }
  const trace = (k) => {
    if (!traces.has(k)) traces.set(k, collarOf.has(k) ? desurveyHole(collarOf.get(k), surveyOf.get(k) || [], method) : null);
    return traces.get(k);
  };
  const points = [], spans = [];
  for (const iv of intercepts) {
    const t = trace(String(iv.hole_id));
    if (!t?.length) continue;
    const count = Math.max(1, Math.min(CHECK_MAX_PER_INTERCEPT, Math.ceil((iv.to - iv.from) / CHECK_STEP_M)));
    spans.push({ ...iv, start: points.length, count });
    for (let i = 0; i < count; i++) {
      const q = pointOnTrace(t, iv.from + ((i + 0.5) / count) * (iv.to - iv.from));
      points.push([+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]);
    }
  }
  return { points, spans };
}

// -> { logged, reached, missed: [{ hole_id, from, to, best }] }, or null from an add-on that did not answer (older than 0.1.5, or the check failed)
export function scoreIntercepts(spans, probabilities) {
  if (!Array.isArray(probabilities) || !spans.length || probabilities.length !== spans[spans.length - 1].start + spans[spans.length - 1].count) return null;
  const missed = [];
  for (const s of spans) {
    let best = 0;
    for (let i = s.start; i < s.start + s.count; i++) best = Math.max(best, probabilities[i]);
    if (!(best > 0.5)) missed.push({ hole_id: s.hole_id, from: s.from, to: s.to, best });
  }
  missed.sort((a, b) => a.hole_id.localeCompare(b.hole_id, undefined, { numeric: true }) || a.from - b.from);
  return { logged: spans.length, reached: spans.length - missed.length, missed };
}

const csvText = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export function missedInterceptsCsv(missed) {
  const rows = missed.map((m) => [csvText(m.hole_id), +m.from.toFixed(2), +m.to.toFixed(2), +(m.to - m.from).toFixed(2), +m.best.toFixed(3)].join(","));
  return ["hole_id,from_m,to_m,length_m,highest_probability", ...rows].join("\r\n") + "\r\n";
}
