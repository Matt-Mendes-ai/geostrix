// TASKS.csv #1318 — Matt: geoML "still leaves intercepts out of the model", and no setting reaches all of them (#1317), so say which. Each logged
// run of the unit is sampled along the trace the app draws, the add-on returns the model's probability there, and an intercept counts as reached when
// any of its points is over 50%, the same line the blocks are shown at.
import { median } from "./arrayStats.js"; // TASKS.csv #4019 — the shared median (#1114)
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
// blockM (TASKS.csv #4019): the run's block, for each row's reason (thin / near / far); export text stays English
export function missedInterceptsCsv(missed, blockM = null) {
  const why = { thin: "thinner than a block", near: "near the 50% line", far: "far from the model" };
  const rows = missed.map((m) => [csvText(m.hole_id), +m.from.toFixed(2), +m.to.toFixed(2), +(m.to - m.from).toFixed(2), +m.best.toFixed(3), why[missReason(m, blockM)]].join(","));
  return ["hole_id,from_m,to_m,length_m,highest_probability,reason", ...rows].join("\r\n") + "\r\n";
}

// TASKS.csv #4019 (Matt: "why are so many intercepts missed?") — the reasons, from the run's own numbers. Each missed intercept: 'thin' when it is
// shorter than the run's block (a block-sized cell cannot hold it), else 'near' when its highest probability came within NEAR_LINE of the 50 % line
// the model is drawn at, else 'far'. No deposit type in any of it: the block is the run's, the line is the model's own.
export const NEAR_LINE = 0.3; // 30 % to 50 %: the model saw the unit there, below its line
export const WEAK_IN_UNIT = 0.85, WEAK_BOTH = 1.7; // the training fit: under 85 % of the unit's points inside, or inside + outside under 170 %
export const SHAPE_RATIO = 4; // two codes whose intercepts differ four-fold in median length read as different shapes
export function missReason(m, blockM) {
  if (Number.isFinite(blockM) && blockM > 0 && m.to - m.from < blockM) return "thin";
  return m.best >= NEAR_LINE ? "near" : "far";
}
export function reasonCounts(missed, blockM) {
  const n = { thin: 0, near: 0, far: 0 };
  for (const m of missed || []) n[missReason(m, blockM)]++;
  return n;
}
// The codes of one run that differ: in different litho groups, with different roles in Modelling codes, or whose intercepts read as different
// shapes (median lengths SHAPE_RATIO apart, each code with three or more). -> { mixed, groups?: [names], roles?: [roles], shapes?: [{ code, n, medianM }], largest }
export function unitMix({ codes, intervals, lithoGroups = [], modellingCodes = null }) {
  const list = [...(codes || [])].map(String);
  const metres = new Map(list.map((c) => [c, 0]));
  for (const r of intervals || []) { const k = String(r.value); if (metres.has(k)) metres.set(k, metres.get(k) + Math.max(0, r.to - r.from)); }
  const largest = list.slice().sort((a, b) => metres.get(b) - metres.get(a))[0] || null;
  if (list.length < 2) return { mixed: false, largest };
  const out = { mixed: false, largest };
  const groups = [...new Set(list.map((c) => (lithoGroups || []).find((g) => (g.codes || []).map(String).includes(c))?.name).filter(Boolean))];
  if (groups.length > 1) { out.groups = groups; out.mixed = true; }
  const roles = [...new Set(list.map((c) => (modellingCodes?.codes || []).find((x) => String(x.name) === c)?.role).filter(Boolean))];
  if (roles.length > 1) { out.roles = roles; out.mixed = true; }
  const shapes = list.map((c) => { const iv = unitIntercepts(intervals || [], new Set([c])); return { code: c, n: iv.length, medianM: median(iv.map((x) => x.to - x.from)) }; }).filter((s) => s.n >= 3);
  if (shapes.length > 1) {
    const lo = shapes.reduce((a, b) => (b.medianM < a.medianM ? b : a)), hi = shapes.reduce((a, b) => (b.medianM > a.medianM ? b : a));
    if (lo.medianM > 0 && hi.medianM / lo.medianM >= SHAPE_RATIO) { out.shapes = [hi, lo]; out.mixed = true; }
  }
  return out;
}
// After a run: is its fit to the logs weak, why (only the causes the run shows), and what to change. fit: { in_unit, other } (0-1) or null;
// intercepts: scoreIntercepts' answer; blockM: the run's block; secs: its time; quality: "fast" | "standard" | "detailed"; heldOut: it was scored
// on held-back holes. -> { weak, counts, causes: [key], fixes: [{ key, blockM?, secs? }] }
export function runAdvice({ fit, intercepts, blockM, secs, quality, heldOut, mix }) {
  const counts = reasonCounts(intercepts?.missed, blockM);
  const weak = !!fit && (fit.in_unit < WEAK_IN_UNIT || fit.in_unit + fit.other < WEAK_BOTH);
  const missedAny = (intercepts?.missed?.length || 0) > 0;
  if (!weak && !missedAny && !mix?.mixed) return { weak, counts, causes: [], fixes: [] };
  const causes = [], fixes = [];
  if (mix?.mixed) { causes.push("mixed"); fixes.push({ key: "oneUnit", unit: mix.largest }); }
  if (counts.thin) causes.push("thin");
  if (counts.near) causes.push("near");
  if (quality === "fast") causes.push("fast");
  if (weak && !causes.length) causes.push("shape"); // none of the above: the unit's own shape (folds, thickness changes) is more than the model follows
  if ((counts.thin || counts.near) && blockM > 10) {
    const smaller = Math.max(10, Math.round(blockM / 2 / 5) * 5);
    if (smaller < blockM) fixes.push({ key: "smaller", blockM: smaller, secs: Number.isFinite(secs) ? secs * (blockM / smaller) ** 3 : null }); // the blocks to predict grow with the cube
  }
  if (quality === "fast") fixes.push({ key: "standard" });
  if (!heldOut) fixes.push({ key: "heldOut" });
  return { weak, counts, causes, fixes };
}
