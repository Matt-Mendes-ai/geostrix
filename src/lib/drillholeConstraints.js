// TASKS.csv #323 — drillhole logs (magnetic susceptibility / specific gravity) as inversion constraints.
// Turns log rows into [x, y, z, value] samples in project CRS and MODEL units, which the sidecar pins onto
// the mesh (each cell a hole passes through gets the logged mean as reference and mean ± tolerance as its
// bounds; see potential.py drillhole_constraints). Nothing is assumed: the susceptibility unit of the log
// and the background density the contrast is taken from are both the user's to state.
import { desurveyHole, pointOnTrace } from "./desurvey.js";

// Log units for susceptibility → SI (what the inversion models). Handheld meters (KT-10 etc.) usually
// report ×10⁻³ SI; old cgs values are not offered (a unit conversion by 4π that users should do knowingly).
export const SUSC_UNITS = {
  si: { label: "SI", factor: 1 },
  e3: { label: "×10⁻³ SI", factor: 1e-3 },
  e5: { label: "×10⁻⁵ SI", factor: 1e-5 },
};

// TASKS.csv #1435 (review #1352, Silvertip) — the log's unit was left to the user with no hint, although Silvertip's readings (0-100,
// median 0.111) cannot be SI. From the readings: { n, median, max, likely } — likely is the unit the numbers point to: SI only when
// nothing passes 10 (no rock does) and the median is under 0.01; a handheld meter's x10^-3 SI for medians up to 50; x10^-5 SI above.
// PHYSICAL_MAX_SI: the warning when the chosen unit puts the log above any rock (massive magnetite is a few SI).
export const PHYSICAL_MAX_SI = 10;
export function suscUnitHint(values) {
  const v = (values || []).map(Number).filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const median = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2, max = v[v.length - 1];
  const likely = max <= PHYSICAL_MAX_SI && median < 0.01 ? "si" : median <= 50 ? "e3" : "e5";
  return { n: v.length, min: v[0], median, max, likely };
}

// rows: {hole_id, value, depth} or {hole_id, value, from, to}. An interval is sampled every `step` metres
// (at least its midpoint), so a long interval constrains every cell it crosses, not just one.
// method "mag": value * SUSC_UNITS[units].factor; method "grav": value (g/cc) - background.
// Returns { points, holes, skipped: { noTrace, badValue, beyondTrace } }.
export function constraintSamples({ collars, survey, rows, method, units, background, desurveyMethod, step = 5 }) {
  const out = { points: [], holes: 0, skipped: { noTrace: 0, badValue: 0, beyondTrace: 0 } };
  const convert = method === "mag"
    ? (v) => v * (SUSC_UNITS[units]?.factor ?? NaN)
    : (v) => v - background;
  const surveyBy = new Map();
  (survey || []).forEach((s) => { if (!surveyBy.has(s.hole_id)) surveyBy.set(s.hole_id, []); surveyBy.get(s.hole_id).push(s); });
  const traceBy = new Map();
  const traceOf = (id) => {
    if (traceBy.has(id)) return traceBy.get(id);
    const c = (collars || []).find((k) => k.hole_id === id);
    const t = c && [c.x, c.y, c.z].every(Number.isFinite) ? desurveyHole(c, surveyBy.get(id) || [], desurveyMethod) : null;
    traceBy.set(id, t && t.length ? t : null);
    return traceBy.get(id);
  };
  const used = new Set();
  for (const r of rows || []) {
    const v = convert(Number(r.value));
    if (r.value === "" || r.value == null || !Number.isFinite(v)) { out.skipped.badValue++; continue; }
    const t = traceOf(r.hole_id);
    if (!t) { out.skipped.noTrace++; continue; }
    const mds = [];
    if (Number.isFinite(r.depth)) mds.push(r.depth);
    // TASKS.csv #1352 review (Silvertip) — a point reading is stored with from = to: it is a sample at that depth, not a bad value
    // (all 6,264 mag-susc readings were refused, with a message blaming the collars)
    else if (Number.isFinite(r.from) && Number.isFinite(r.to) && Math.abs(r.to - r.from) < 1e-9) mds.push(r.from);
    else if (Number.isFinite(r.from) && Number.isFinite(r.to) && r.to > r.from) {
      const n = Math.max(1, Math.round((r.to - r.from) / step));
      for (let k = 0; k < n; k++) mds.push(r.from + ((k + 0.5) * (r.to - r.from)) / n);
    } else { out.skipped.badValue++; continue; }
    const top = t[0].md, bottom = t[t.length - 1].md;
    for (const md of mds) {
      if (md < top || md > bottom) { out.skipped.beyondTrace++; continue; }
      const p = pointOnTrace(t, md);
      out.points.push([p.x, p.y, p.z, v]);
      used.add(r.hole_id);
    }
  }
  out.holes = used.size;
  return out;
}
