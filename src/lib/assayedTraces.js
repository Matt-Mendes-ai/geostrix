// TASKS.csv #3345 (review #3195, Galore Creek) — 'Distance to drilling' and Undrilled zones counted every trace as testing the ground: 24 of the 70
// holes had no assay at all, and the unassayed top of a hole counted too, while the grade cards and weights of evidence read only assayed
// holes. The assayed parts of the holes, for a choice in both. Pure.
import { pointOnTrace } from "./desurvey.js";

// assays -> Map(hole_id -> [[from, to], ...]): each hole's assayed intervals, sorted and merged where they touch (a gap under `join` m closes)
export function assayedSpans(assays, join = 0.01) {
  const by = new Map();
  for (const a of assays || []) {
    const f = Number(a?.from), t = Number(a?.to);
    if (a?.hole_id == null || !Number.isFinite(f) || !(t > f)) continue;
    (by.get(a.hole_id) || by.set(a.hole_id, []).get(a.hole_id)).push([f, t]);
  }
  for (const [h, list] of by) {
    list.sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const s of list) { const last = out[out.length - 1]; if (last && s[0] <= last[1] + join) last[1] = Math.max(last[1], s[1]); else out.push([s[0], s[1]]); }
    by.set(h, out);
  }
  return by;
}
// the part of a trace (points with md) between depths a and b, its ends interpolated -> points (empty when the span misses the trace)
export function cutTrace(pts, a, b) {
  if (!pts?.length || !(b > a)) return [];
  const p0 = pointOnTrace(pts, a), p1 = pointOnTrace(pts, b);
  if (!p0 || !p1) return [];
  const mid = pts.filter((p) => (p.md ?? 0) > a && (p.md ?? 0) < b);
  return [{ ...p0, md: a }, ...mid, { ...p1, md: b }];
}
// traces: Map(hole_id -> points) -> { traces: Map(hole_id -> [part, ...]), holes (with an assay and a trace), none (drilled holes with no assay) }
export function assayedTraceParts(traces, spans) {
  const out = new Map();
  let none = 0;
  for (const [h, pts] of traces || []) {
    const sp = spans.get(h);
    if (!sp?.length) { none++; continue; }
    const parts = sp.map(([a, b]) => cutTrace(pts, a, b)).filter((p) => p.length > 1);
    if (parts.length) out.set(h, parts);
  }
  return { traces: out, holes: out.size, none };
}
