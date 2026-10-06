// TASKS.csv #451 / #327 — each imported geophysics survey as its own entry. Points still live in the one
// geophys_pts layer (every existing project, import path, the IDW gridder and the inversion read it), each
// tagged with its survey by `_src` (the file it came from, #364). What a survey IS — method, units, what
// its z values mean — is kept once per survey in the project's `geophysSurveys` map, not on 20,000 rows.
// With more than one survey loaded, each is coloured on its OWN value range (a mag survey in nT and a
// gravity survey in mGal on one ramp said nothing about either).
import { colorForVoxelValue } from "./layers.js";

export const SURVEY_METHODS = {
  mag: { label: "Magnetics (TMI)", units: "nT" },
  grav: { label: "Gravity", units: "mGal" },
  rad_k: { label: "Radiometrics: K", units: "%" },
  rad_th: { label: "Radiometrics: eTh", units: "ppm" },
  rad_u: { label: "Radiometrics: eU", units: "ppm" },
  rad_tc: { label: "Radiometrics: total count", units: "cps" },
  ip: { label: "IP chargeability", units: "mV/V" },
  res: { label: "Resistivity", units: "Ω·m" },
  other: { label: "Other", units: "" },
};
// What a survey's z column means. "agl" = height above ground (a helicopter survey's radar altimeter):
// converted to elevation = terrain + height, with the original kept on each row as zAgl.
export const Z_MEANINGS = { elevation: "z is elevation", agl: "z is height above ground (radar altimeter)", none: "no z (grid nodes / unknown)" };

export const surveyKey = (r) => r._src || "(unnamed import)";

export function surveyStats(rows) {
  const by = new Map();
  for (const r of rows || []) {
    const k = surveyKey(r);
    let s = by.get(k);
    if (!s) { s = { key: k, count: 0, withZ: 0, withAgl: 0, lines: new Set(), min: Infinity, max: -Infinity }; by.set(k, s); }
    s.count++;
    if (Number.isFinite(r.z)) s.withZ++;
    if (Number.isFinite(r.zAgl)) s.withAgl++;
    if (r.line != null && r.line !== "") s.lines.add(String(r.line));
    if (Number.isFinite(r.value)) { if (r.value < s.min) s.min = r.value; if (r.value > s.max) s.max = r.value; }
  }
  return [...by.values()].map((s) => ({ ...s, lines: s.lines.size }));
}

// row -> { color, t } where t (0..1) is the row's place in its survey's range (drives the symbol size).
// One survey: the user's legend (stops / colour mode / min / max) applies, as before. Several: each survey
// on its own min/max with the default ramp — user stops are in ONE survey's units and would mislead others.
// TASKS.csv #600 (40958Z) — the DEFAULT colour range is the 2nd–98th percentile, not min–max: one raw walk-mag
// day (7,797 readings, real field ~56,000 nT) has spikes from 132 to 167,445 nT, and a min–max stretch put every
// real reading on one flat colour. Values outside the range take the end colours. A range the user sets wins.
export function robustRange(values, lo = 0.02, hi = 0.98) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return { min: NaN, max: NaN };
  if (v.length < 20) return { min: v[0], max: v[v.length - 1] };
  const q = (p) => v[Math.round(p * (v.length - 1))];
  const r = { min: q(lo), max: q(hi) };
  return r.max > r.min ? r : { min: v[0], max: v[v.length - 1] };
}
const tIn = (m, v) => (m.max > m.min ? Math.min(1, Math.max(0, (v - m.min) / (m.max - m.min))) : 0.3);
export function makeSurveyColorer(rows, { stops, colorMode, min, max } = {}) {
  const keys = new Set((rows || []).map(surveyKey));
  if (keys.size <= 1) {
    const rr = robustRange((rows || []).map((r) => r.value));
    const model = { stops, colorMode, min: min ?? rr.min, max: max ?? rr.max };
    return { perSurvey: false, models: new Map([[[...keys][0], model]]), colorOf: (r) => ({ color: colorForVoxelValue(model, r.value), t: tIn(model, r.value) }) };
  }
  const values = new Map();
  for (const r of rows) { const k = surveyKey(r); if (!values.has(k)) values.set(k, []); values.get(k).push(r.value); }
  const models = new Map();
  for (const [k, v] of values) models.set(k, robustRange(v));
  return {
    perSurvey: true, models,
    colorOf: (r) => {
      const m = models.get(surveyKey(r));
      return { color: colorForVoxelValue(m, r.value), t: tIn(m, r.value) };
    },
  };
}

// Radar-altimeter heights -> elevations (terrainAt(x, y) -> elevation or NaN). Rows keep the original
// height as zAgl, so converting again (e.g. after loading a better terrain) starts from the measurement.
export function aglToElevation(rows, key, terrainAt) {
  let done = 0, outside = 0;
  const out = rows.map((r) => {
    if (surveyKey(r) !== key) return r;
    const h = Number.isFinite(r.zAgl) ? r.zAgl : r.z;
    if (!Number.isFinite(h)) return r;
    const g = terrainAt(r.x, r.y);
    if (!Number.isFinite(g)) { outside++; return { ...r, zAgl: h, z: null }; }
    done++;
    return { ...r, zAgl: h, z: g + h };
  });
  return { rows: out, done, outside };
}
