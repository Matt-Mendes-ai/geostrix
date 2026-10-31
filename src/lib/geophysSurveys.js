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
  ztem_tipper: { label: "ZTEM: tipper (in-phase)", units: "ratio", group: "em" },
  mt_rho: { label: "MT / AMT: apparent resistivity", units: "Ω·m", group: "em" },
  mt_phase: { label: "MT / AMT: phase", units: "°", group: "em" },
  ip: { label: "IP chargeability", units: "mV/V", group: "el" },
  res: { label: "Resistivity", units: "Ω·m", group: "el" },
  sp: { label: "Self-potential", units: "mV", group: "el" },
  other: { label: "Other", units: "", group: "other" },
};
// What the SimPEG inversion models: the measured total field and Bouguer gravity. A derivative or a filtered product is
// not the field; a radiometric or EM channel is another physics.
export const methodIsInvertible = (m) => m === "mag" || m === "grav";

// A method read from the value column's header at import ("TMI_nT", "Bouguer", "eTh_ppm", "Cond_mSm"...). Words are
// matched whole, so "ip" never fires on "dip" and "k" never on "kelvin"; null when nothing fits (the select stays
// "Method…"). The order matters: a specific product before its family.
const WORD_RULES = [
  [/^(rtp|rtp_nt)$/, "mag_rtp"], [/^(1vd|fvd|dz|vd1)$/, "mag_1vd"], [/^(as|asig|analytic)$/, "mag_as"], [/^(vg|vgrad|vmg)$/, "mag_vg"],
  [/^(tmi|mag|magnetics|magnetic|nt|tf|rmi|igrf)$/, "mag"],
  [/^(boug|bouguer|cba|sba)$/, "grav"], [/^(fa|freeair)$/, "grav_fa"], [/^(gzz|ftg|eotvos)$/, "grav_gzz"], [/^(grav|gravity|mgal|gz)$/, "grav"],
  [/^(uth|u_th)$/, "rad_uth"], [/^(kth|k_th)$/, "rad_kth"], [/^(k|k40|potassium|kpct)$/, "rad_k"], [/^(eth|th|thorium)$/, "rad_th"], [/^(eu|u|uranium)$/, "rad_u"], [/^(tc|totalcount|total|cps|dose)$/, "rad_tc"],
  [/^(vlf|tilt|tiltangle)$/, "vlf_tilt"], [/^(tipper|ztem|tzx|tzy|tzr)$/, "ztem_tipper"], // before the EM channels: a VLF or ZTEM in-phase is still VLF / ZTEM
  [/^(cond|conductivity|sigma|msm|appcond)$/, "em_cond"], [/^(inphase|inph|ip_ppm|real)$/, "em_inphase"], [/^(quad|quadrature|imag)$/, "em_quad"], [/^(dbdt|dbdtz|emz)$/, "em_dbdt"], [/^(bfield|bz|pt)$/, "em_bfield"], [/^(tau|decay)$/, "em_tau"],
  [/^(rhoa|apprho|mt|amt)$/, "mt_rho"], [/^(phase|phs)$/, "mt_phase"],
  [/^(chargeability|charge|ip|mvv|mv_v)$/, "ip"], [/^(res|resistivity|rho|ohmm|appres)$/, "res"], [/^(sp|selfpotential)$/, "sp"],
];
export function guessSurveyMethod(header) {
  if (!header) return null;
  const words = String(header).toLowerCase().replace(/[()[\]]/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
  const joined = words.join("");
  for (const [re, m] of WORD_RULES) { if (re.test(joined)) return m; } // "U_Th" is the ratio, not thorium
  for (const [re, m] of WORD_RULES) { if (words.some((w) => re.test(w))) return m; }
  // a header written as one word: "inphase", "freeair", "totalcount", "bouguer", "apparentconductivity"
  if (/^(apparent)?cond/.test(joined)) return "em_cond";
  if (/^(apparent)?res/.test(joined) || /ohm/.test(joined)) return "res";
  return null;
}
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
// TASKS.csv #600 (40958Z) — importing a survey file again REPLACES its earlier points (same survey key, i.e. the
// same file name) instead of adding a second copy: re-importing one walk-mag day doubled it to 15,594 points.
// Same rule as interval layers (#336). Returns { rows, replaced } (replaced = how many old points went).
export function replaceSurveyPoints(prev, incoming) {
  const keys = new Set(incoming.map(surveyKey));
  const kept = (prev || []).filter((r) => !keys.has(surveyKey(r)));
  return { rows: [...kept, ...incoming], replaced: (prev || []).length - kept.length };
}

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

// TASKS.csv #1094 (review #1016, geophysicist) — one survey's points as table rows: a crew that levelled or diurnally
// corrected its stations in GeoStrix could get them out only as a gridded GeoTIFF. Columns: x, y (project CRS), z, the
// value under its method / unit name ("mag_nT"), then line, fiducial, label and the height above ground when present.
// meta: the survey's geophysSurveys entry ({ method, units, zMeaning }). -> { rows, valueName }
export function surveyExportRows(points, meta = {}) {
  const unit = String(meta.units || "").replace(/[^A-Za-z0-9]+/g, "") || null;
  const valueName = [meta.method || "value", unit].filter(Boolean).join("_");
  const has = (k) => points.some((r) => r[k] != null && r[k] !== "");
  const keep = { line: has("line"), fid: has("fid"), label: has("label"), zAgl: points.some((r) => Number.isFinite(r.zAgl)) };
  const rows = points.map((r) => ({
    x: r.x, y: r.y, z: Number.isFinite(r.z) ? r.z : "", [valueName]: Number.isFinite(r.value) ? r.value : "",
    ...(keep.line ? { line: r.line ?? "" } : {}), ...(keep.fid ? { fiducial: r.fid ?? "" } : {}), ...(keep.label ? { label: r.label ?? "" } : {}),
    ...(keep.zAgl ? { height_agl: Number.isFinite(r.zAgl) ? r.zAgl : "" } : {}),
  }));
  return { rows, valueName };
}
