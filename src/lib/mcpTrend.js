// TASKS.csv #3932 (batch 2 addition, Main 2026-11-21) — suggest_trend, the read-only tool: the trend helper's suggestion (lib/trendCandidates.js, the engine behind 3D Modelling > Model
// settings > Trend helper) with its strength and its reasons, so an AI app can explain it before anything is built. It reads the sources the open project's store holds: the measured
// structures (picks with a dip and a dip direction), each logged unit's tops, one element's samples at or above their 90th percentile, and the drilling itself (to say when a plane is just
// the drill pattern). Modelled surfaces, outcrop readings and mapped contacts live in the Modelling tab's own state: the answer says they are not read, so the pane may offer more.
// Pure over the snapshot ({ collars, survey, layers, assays, desurveyMethod }); nothing is written.
import { trendCandidates } from "./trendCandidates.js";
import { holeTraces } from "./evidenceSources.js";
import { pointOnTrace } from "./desurvey.js";
import { excludeQAQC } from "./qaqc.js";

const MAX_DRILL = 4000, MAX_UNIT_TOPS = 400;
const has = (v) => v != null && v !== "" && Number.isFinite(Number(v)); // Number(null) is 0: a pick with no dip is not a measurement
const thin = (xs, n) => { if (xs.length <= n) return xs; const k = Math.ceil(xs.length / n), out = []; for (let i = 0; i < xs.length; i += k) out.push(xs[i]); return out; };
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

// sym: an element symbol (the grades are read) or null (only structures, unit tops and the drilling)
export function suggestTrend(snap, sym = null) {
  const traces = holeTraces(snap.collars, snap.survey, snap.desurveyMethod);
  const at = (hole, md) => { const t = traces.get(hole); return t ? pointOnTrace(t, md) : null; };
  const structures = (snap.layers?.structure || []).filter((s) => has(s.dip) && has(s.azimuth)).map((s) => ({ kind: String(s.value ?? "?"), dip: Number(s.dip), dipDir: Number(s.azimuth) }));
  // each unit's logged tops: the top of its first interval in each hole, placed on the hole's trace
  const byUnit = new Map();
  for (const r of snap.layers?.litho || []) {
    const code = String(r.value ?? ""); if (!code || !Number.isFinite(Number(r.from))) continue;
    const m = byUnit.get(code) || new Map(); const was = m.get(r.hole_id);
    if (was == null || Number(r.from) < was) m.set(r.hole_id, Number(r.from)); byUnit.set(code, m);
  }
  const units = [...byUnit].filter(([, m]) => m.size >= 3).map(([code, m]) => ({ code, pts: thin([...m].map(([h, md]) => at(h, md)).filter(Boolean), MAX_UNIT_TOPS) })).filter((u) => u.pts.length >= 3);
  const lab = excludeQAQC(snap.assays || []).filter((a) => Number.isFinite(a.from) && Number.isFinite(a.to));
  const drillingPts = thin(lab.map((a) => { const p = at(a.hole_id, (a.from + a.to) / 2); return p ? { x: p.x, y: p.y, z: p.z, hole_id: a.hole_id } : null; }).filter(Boolean), MAX_DRILL);
  // the grade: the samples at or above their 90th percentile (the Grade shell pane's proposed cut-off), placed on the traces
  let grade = null, gradeNote = null;
  if (sym) {
    const rows = lab.filter((a) => Number.isFinite(a.values?.[sym]) && a.values[sym] > 0);
    if (rows.length) {
      const v = rows.map((a) => a.values[sym]).sort((x, y) => x - y), cutoff = +v[Math.floor(0.9 * (v.length - 1))].toPrecision(3), pts = [];
      for (const a of rows) { if (a.values[sym] < cutoff) continue; const p = at(a.hole_id, (a.from + a.to) / 2); if (p) pts.push(p); }
      if (pts.length) grade = { element: sym, cutoff, unit: (snap.assayElements || []).find((e) => e.symbol === sym)?.unit || "", pts };
    } else gradeNote = `No ${sym} assay above zero: the grades give no trend.`;
  }
  const r = trendCandidates({ structures, units, grade, drillingPts });
  const view = (c) => ({ id: c.id, source: c.source, strength: c.strength, words: c.words, numbers: c.numbers, reason: c.reason, warnings: c.warnings || [], readings: c.n ?? null,
    ...(c.agreeText ? { agreement: c.agreeText } : {}), ...(c.drilling ? { drill_pattern: true } : {}), ...(c.directionOnly ? { direction_only: true } : {}), suggested: !!c.suggested,
    dip: r1(c.dip), dip_direction: r1(c.dipAzimuth) });
  return {
    ...(sym ? { element: sym } : {}),
    sources_read: [structures.length ? `${structures.length} measured structure picks` : null, units.length ? `the logged tops of ${units.length} unit(s) cut in three or more holes` : null,
      grade ? `${grade.pts.length} ${sym} samples at or above ${grade.cutoff} ${grade.unit}`.trim() : null, drillingPts.length ? `${drillingPts.length} assayed samples (the drilling)` : null].filter(Boolean),
    not_read: ["modelled surfaces", "outcrop readings", "mapped contacts", "the regional geology (the Modelling tab's trend helper also reads these)"],
    ...(gradeNote ? { grade_note: gradeNote } : {}),
    candidates: r.candidates.map(view), suggested: r.candidates.filter((c) => c.suggested).map(view)[0] || null,
    ...(r.none ? { none: r.noneText } : {}),
    note: "These are suggestions from your data, not facts: check them against what you know.",
  };
}
