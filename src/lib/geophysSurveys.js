// TASKS.csv #451 / #327 — each imported geophysics survey as its own entry. Points still live in the one
// geophys_pts layer (every existing project, import path, the IDW gridder and the inversion read it), each
// tagged with its survey by `_src` (the file it came from, #364). What a survey IS — method, units, what
// its z values mean — is kept once per survey in the project's `geophysSurveys` map, not on 20,000 rows.
// With more than one survey loaded, each is coloured on its OWN value range (a mag survey in nT and a
// gravity survey in mGal on one ramp said nothing about either).
import { colorForVoxelValue } from "./layers.js";

// TASKS.csv #1151 — the survey types a mineral-exploration crew brings in, grouped for the Method select. The keys of the
// first nine are what saved projects already hold: unchanged. Derived magnetic products (RTP, derivatives) are their own
// types so they are never inverted as if they were the measured field (InversionPanel: methodIsInvertible).
export const SURVEY_METHOD_GROUPS = { mag: "Magnetics", grav: "Gravity", rad: "Radiometrics", em: "Electromagnetics", el: "Electrical", other: "Other" };
export const SURVEY_METHODS = {
  mag: { label: "Magnetics (TMI)", units: "nT", group: "mag" },
  mag_rtp: { label: "Magnetics: reduced to pole", units: "nT", group: "mag" },
  mag_1vd: { label: "Magnetics: first vertical derivative", units: "nT/m", group: "mag" },
  mag_as: { label: "Magnetics: analytic signal", units: "nT/m", group: "mag" },
  mag_vg: { label: "Magnetics: measured vertical gradient", units: "nT/m", group: "mag" },
  grav: { label: "Gravity (Bouguer)", units: "mGal", group: "grav" },
  grav_fa: { label: "Gravity: free air", units: "mGal", group: "grav" },
  grav_gzz: { label: "Gravity gradient (Gzz)", units: "Eö", group: "grav" },
  rad_k: { label: "Radiometrics: K", units: "%", group: "rad" },
  rad_th: { label: "Radiometrics: eTh", units: "ppm", group: "rad" },
  rad_u: { label: "Radiometrics: eU", units: "ppm", group: "rad" },
  rad_tc: { label: "Radiometrics: total count", units: "cps", group: "rad" },
  rad_uth: { label: "Radiometrics: eU / eTh", units: "ratio", group: "rad" },
  rad_kth: { label: "Radiometrics: K / eTh", units: "ratio", group: "rad" },
  em_cond: { label: "EM: apparent conductivity", units: "mS/m", group: "em" },
  em_inphase: { label: "EM: in-phase", units: "ppm", group: "em" },
  em_quad: { label: "EM: quadrature", units: "ppm", group: "em" },
  em_dbdt: { label: "TEM: dB/dt (one channel)", units: "pV/(A·m⁴)", group: "em" },
  em_bfield: { label: "TEM: B-field (one channel)", units: "pT", group: "em" },
  em_tau: { label: "TEM: decay constant", units: "ms", group: "em" },
  vlf_tilt: { label: "VLF-EM: tilt angle", units: "%", group: "em" },
  vlf_inphase: { label: "VLF-EM: in-phase", units: "%", group: "em" }, // TASKS.csv #1586 — GEM's ip_<kHz> / op_<kHz> columns, % of the primary field
  vlf_quad: { label: "VLF-EM: quadrature", units: "%", group: "em" },
  ztem_tipper: { label: "ZTEM: tipper (in-phase)", units: "ratio", group: "em" },
  mt_rho: { label: "MT / AMT: apparent resistivity", units: "Ω·m", group: "em" },
  mt_phase: { label: "MT / AMT: phase", units: "°", group: "em" },
  euler_depth: { label: "Euler solutions: depth below the sensor", units: "m", group: "other" }, // TASKS.csv #1985
  worms_height: { label: "Worms: edge heights above the grid", units: "m", group: "other" }, // TASKS.csv #2639 — a filter product, not a field
  tiltdepth_depth: { label: "Tilt-depth: contact depths below the sensor", units: "m", group: "other" }, // TASKS.csv #2639
  mt_bostick: { label: "MT / AMT: Niblett–Bostick resistivity (approximate depth)", units: "log₁₀ Ω·m", group: "em" }, // TASKS.csv #1989 — points under each station
  lidar: { label: "Lidar point cloud", units: "m", group: "other" },
  em1d_cond: { label: "FDEM 1D models: conductivity at depth", units: "log₁₀ mS/m", group: "em" },
  tem1d_cond: { label: "TEM 1D models: conductivity at depth", units: "log₁₀ mS/m", group: "em" }, // TASKS.csv #3440 — points under each station // TASKS.csv #1986 — points under each sounding // TASKS.csv #1994 — thinned returns of a LAS / LAZ / COPC file
  structfit_sens: { label: "Contact sensitivity: which interpreted contacts the survey can see", units: "log₁₀ σ per m", group: "other" }, // TASKS.csv #3632 — the tested points of #2640, coloured in the 3D View by their sensitivity
  ip: { label: "IP chargeability", units: "mV/V", group: "el" },
  res: { label: "Resistivity", units: "Ω·m", group: "el" },
  sp: { label: "Self-potential", units: "mV", group: "el" },
  magsus_downhole: { label: "Magnetic susceptibility (downhole readings, not a survey)", units: "×10⁻³ SI", group: "other" }, // TASKS.csv #1709 — an honest label for a log imported here
  other: { label: "Other", units: "", group: "other" },
};
export const surveyKey = (r) => r._src || "(unnamed import)";

// TASKS.csv #3309 — the values sorted as a Float64Array (a numeric sort, no comparator: about 5x faster on 300,000 IP readings), the same result
export function robustRange(values, lo = 0.02, hi = 0.98) {
  let n = 0;
  const v = new Float64Array(values.length);
  for (const x of values) if (Number.isFinite(x)) v[n++] = x;
  return rangeOfSorted(v.subarray(0, n).sort(), lo, hi);
}
function rangeOfSorted(v, lo, hi) {
  if (!v.length) return { min: NaN, max: NaN };
  if (v.length < 20) return { min: v[0], max: v[v.length - 1] };
  const q = (p) => v[Math.round(p * (v.length - 1))];
  const r = { min: q(lo), max: q(hi) };
  return r.max > r.min ? r : { min: v[0], max: v[v.length - 1] };
}
export const tIn = (m, v) => (m.max > m.min ? Math.min(1, Math.max(0, (v - m.min) / (m.max - m.min))) : 0.3); // exported: #3309 (the 3D View's per-survey build)
// TASKS.csv #1587 (review #1497, Lawyers) — `surveys` is the geophysSurveys meta: a survey's own legend ({ stops, colorMode,
// min, max }, edited on the Point survey pane) wins over the 2-98 % range; with several surveys the global stops / mode /
// range used to be ignored altogether, so the legend editor changed nothing in 3D.
// TASKS.csv #3309 — one survey's colour model, shared with the 3D View's per-survey build (lib/viewer/geophysPts.js), which keeps each
// survey's 2-98 % range (rr) while its rows are unchanged: single = the only survey drawn (the global stops / mode / range apply)
export function surveyColourModel(rr, legend, { stops, colorMode, min, max } = {}, single = false) {
  if (single) { const lg = legend || {}; return { stops: lg.stops ?? stops, colorMode: lg.colorMode ?? colorMode, min: lg.min ?? min ?? rr.min, max: lg.max ?? max ?? rr.max }; }
  return legend ? { stops: legend.stops ?? [], colorMode: legend.colorMode ?? "continuous", min: legend.min ?? rr.min, max: legend.max ?? rr.max, edited: true } : rr; // #1587
}
export const colourOfModel = (m, v) => ({ color: colorForVoxelValue(m, v), t: tIn(m, v) });
// #3309 — each survey's 2-98 % range, kept per rows array: the 3D legend asked again on every units keystroke and Method pick, a sort of
// all 543,820 IP readings each time
const rangesCache = new WeakMap();
export function surveyRanges(rows) {
  const hit = rows && rangesCache.get(rows);
  if (hit) return hit;
  const values = new Map();
  for (const r of rows || []) { const k = surveyKey(r); let a = values.get(k); if (!a) values.set(k, (a = [])); a.push(r.value); }
  const out = new Map();
  for (const [k, v] of values) out.set(k, robustRange(v));
  if (rows) rangesCache.set(rows, out);
  return out;
}
export function makeSurveyColorer(rows, opts = {}, surveys = null) {
  const ranges = surveyRanges(rows || []);
  const legendOf = (k) => (surveys && surveys[k] && surveys[k].legend) || null;
  if (ranges.size <= 1) {
    const k = ranges.size ? [...ranges.keys()][0] : undefined;
    const model = surveyColourModel(ranges.size ? ranges.get(k) : robustRange([]), legendOf(k), opts, true);
    return { perSurvey: false, models: new Map([[k, model]]), colorOf: (r) => colourOfModel(model, r.value) };
  }
  const models = new Map();
  for (const [k, rr] of ranges) models.set(k, surveyColourModel(rr, legendOf(k), opts, false)); // #1587
  return {
    perSurvey: true, models,
    colorOf: (r) => {
      const m = models.get(surveyKey(r));
      return { color: colorForVoxelValue(m, r.value), t: tIn(m, r.value) };
    },
  };
}

