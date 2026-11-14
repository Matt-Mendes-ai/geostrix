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
  em1d_cond: { label: "FDEM 1D models: conductivity at depth", units: "log₁₀ mS/m", group: "em" }, // TASKS.csv #1986 — points under each sounding // TASKS.csv #1994 — thinned returns of a LAS / LAZ / COPC file
  ip: { label: "IP chargeability", units: "mV/V", group: "el" },
  res: { label: "Resistivity", units: "Ω·m", group: "el" },
  sp: { label: "Self-potential", units: "mV", group: "el" },
  magsus_downhole: { label: "Magnetic susceptibility (downhole readings, not a survey)", units: "×10⁻³ SI", group: "other" }, // TASKS.csv #1709 — an honest label for a log imported here
  other: { label: "Other", units: "", group: "other" },
};
// What the SimPEG inversion models: the measured total field and Bouguer gravity. A derivative or a filtered product is
// not the field; a radiometric or EM channel is another physics.
export const methodIsInvertible = (m) => m === "mag" || m === "grav";

// A method read from the value column's header at import ("TMI_nT", "Bouguer", "eTh_ppm", "Cond_mSm"...). Words are
// matched whole, so "ip" never fires on "dip" and "k" never on "kelvin"; null when nothing fits (the select stays
// "Method…"). The order matters: a specific product before its family.
const WORD_RULES = [
  // TASKS.csv #2867 — observed (absolute) gravity is no anomaly: 980,912-980,963 mGal was labelled 'Gravity (Bouguer)' from "gravity" in OBSERVED_GRAVITY
  [/^(obs|observed|absolute|abs|adj|adjusted)(g|grav|gravity)$|^(gobs|adjg|absg|obsg)$/, null],
  // TASKS.csv #1586 (review #1497, Lawyers) — GEM walk-VLF writes ip_21p4 / op_21p4 (in-phase / quadrature at 21.4 kHz): matched
  // as one word before the IP-chargeability rule can see "ip"; GEM walk-mag writes rawmag / cormag (and this app's _dc channel)
  [/^(ip|inph|inphase)\d+p\d+$/, "vlf_inphase"], [/^(op|quad)\d+p\d+$/, "vlf_quad"],
  [/^(rawmag|cormag|rawmagdc|cormagdc|magdc|tmidc)$/, "mag"],
  [/^(rtp|rtp_nt)$/, "mag_rtp"], [/^(1vd|fvd|dz|vd1)$/, "mag_1vd"], [/^(as|asig|analytic)$/, "mag_as"], [/^(vg|vgrad|vmg)$/, "mag_vg"],
  [/^(tmi|mag|magnetics|magnetic|nt|tf|rmi|igrf)$/, "mag"],
  [/^(boug|bouguer|cba|sba)$/, "grav"], [/^(fa|freeair)$/, "grav_fa"], [/^(gzz|ftg|eotvos)$/, "grav_gzz"], [/^(grav|gravity|mgal|gz)$/, "grav"],
  [/^(uth|u_th)$/, "rad_uth"], [/^(kth|k_th)$/, "rad_kth"], [/^(k|k40|potassium|kpct)$/, "rad_k"], [/^(eth|th|thorium)$/, "rad_th"], [/^(eu|u|uranium)$/, "rad_u"], [/^(tc|totalcount|total|cps|dose)$/, "rad_tc"],
  [/^(vlf|tilt|tiltangle)$/, "vlf_tilt"], [/^(tipper|ztem|tzx|tzy|tzr)$/, "ztem_tipper"], // before the EM channels: a VLF or ZTEM in-phase is still VLF / ZTEM
  [/^(cond|conductivity|sigma|msm|appcond)$/, "em_cond"], [/^(inphase|inph|ip_ppm|real)$/, "em_inphase"], [/^(quad|quadrature|imag)$/, "em_quad"], [/^(dbdt|dbdtz|emz)$/, "em_dbdt"], [/^(bfield|bz|pt)$/, "em_bfield"], [/^(tau|decay)$/, "em_tau"],
  // TASKS.csv #3323 — RhoA / AppRho is a DC survey's apparent resistivity beside its IP file; MT only when the file has MT columns (fileHints' mtSet)
  [/^(mt|amt)$/, "mt_rho"], [/^(rhoa|apprho)$/, "res"], [/^(phase|phs)$/, "mt_phase"],
  [/^(chargeability|charge|ip|mvv|mv_v|mx|appmx|appm|app_mx)$/, "ip"] /* mx / appmx: #3208 (apparent chargeability) */, [/^(res|resistivity|rho|ohmm|appres)$/, "res"], [/^(sp|selfpotential)$/, "sp"],
];
// TASKS.csv #1586 — what the file says about itself, read before the column's own words: a GEM GSM-19 (or any magnetometer)
// header makes an unnamed-looking channel magnetics; a VLF column set (f_/ip_/op_/h1_/pT_ with a frequency suffix) makes an
// "ip_..." column VLF in-phase, not IP chargeability.
const MAGNETOMETER = /gsm-?\d+|gem ?systems|overhauser|proton|cesium|caesium|magnetometer|scintrex ?env|envi ?mag|g-?85[0-9]/i;
const VLF_COLUMN = /^(f|ip|op|h1|h2|pt|tilt)_?\d+p\d+$/i;
// #3323 — MT columns: a frequency or period, or the impedance tensor's; a chargeability column makes it (spectral) IP, not MT
const MT_COLUMN = /^(freq|frequency|period|zxy|zyx|zxx|zyy|rhoxy|rhoyx|phixy|phiyx)(_?(hz|s|sec|deg))?$/i, IP_COLUMN = /^(ip|mx|appmx|chargeability|charge|mvv|mv_v)$/i;
export function fileHints({ instrument = null, columns = [] } = {}) {
  const cols = (columns || []).map((c) => String(c).toLowerCase());
  return { magnetometer: !!(instrument && MAGNETOMETER.test(String(instrument))), vlfSet: cols.filter((c) => VLF_COLUMN.test(c)).length >= 2, mtSet: cols.some((c) => MT_COLUMN.test(c)) && !cols.some((c) => IP_COLUMN.test(c)) /* #3323 */ };
}
export function guessSurveyMethod(header, hints = null) {
  if (!header) return null;
  const words = String(header).toLowerCase().replace(/[()[\]]/g, " ").split(/[^a-z0-9]+/).filter(Boolean);
  const joined = words.join("");
  const h = hints ? fileHints(hints) : null;
  if (h?.mtSet && /^(rhoa|apprho|appres|rho|apparentresistivity)/.test(joined)) return "mt_rho"; // #3323 — a frequency or phase column: MT
  if (h?.vlfSet) { if (/^(ip|inph|inphase)/.test(joined)) return "vlf_inphase"; if (/^(op|quad)/.test(joined)) return "vlf_quad"; if (/^(tilt|h1)/.test(joined)) return "vlf_tilt"; } // #1586
  for (const [re, m] of WORD_RULES) { if (re.test(joined)) return m; } // "U_Th" is the ratio, not thorium
  for (const [re, m] of WORD_RULES) { if (words.some((w) => re.test(w))) return m; }
  // a header written as one word: "inphase", "freeair", "totalcount", "bouguer", "apparentconductivity"
  if (/^(apparent)?cond/.test(joined)) return "em_cond";
  if (/^(apparent)?res/.test(joined) || /ohm/.test(joined)) return "res";
  if (h?.magnetometer && /mag|field|nt|tmi|total/.test(joined)) return "mag"; // #1586 — a magnetometer's own reading column
  return null;
}
// TASKS.csv #1586 — the diurnal correction is a magnetics step: offered for a magnetic channel, or one the rules cannot name
export function diurnalApplies(header, hints = null) {
  const g = guessSurveyMethod(header, hints);
  return !g || SURVEY_METHODS[g]?.group === "mag";
}
// TASKS.csv #1197 — the value column's name, else a label column holding one value on every row ("TMI_nT" on all 3,528 rows of the Harry survey)
export function guessSurveyMethodFrom(header, labels = [], hints = null) { // hints: #1586
  const g = guessSurveyMethod(header, hints);
  if (g) return g;
  const one = new Set(labels.filter((v) => v != null && v !== ""));
  return one.size === 1 ? guessSurveyMethod([...one][0], hints) : null;
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

// TASKS.csv #1172 — a method's units follow the method, unless the geologist typed their own: "nT" stayed on a survey changed to Gravity, and
// the export's column name and the inversion's data statement inherited it.
export function unitsForMethod(meta, method) {
  if (!method) return {};
  const own = meta?.units && !Object.values(SURVEY_METHODS).some((m) => m.units === meta.units);
  return own ? {} : { units: SURVEY_METHODS[method].units };
}

// TASKS.csv #3319 (Galore Creek review: the Extension grid's IP.xyz silently replaced the Main grid's IP.xyz, 245,066 points, because a survey
// is known by its file name) — a re-import of the same file still replaces it (#600); a file of the same name with another row count or
// extent is asked about, and may be kept beside it under another name; a survey can be renamed.
export function surveyExtent(rows) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, n = 0;
  for (const r of rows || []) {
    if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    n++; if (r.x < xmin) xmin = r.x; if (r.x > xmax) xmax = r.x; if (r.y < ymin) ymin = r.y; if (r.y > ymax) ymax = r.y;
  }
  return { n, xmin, xmax, ymin, ymax };
}
// the same file read again: the same number of points over the same extent (to 1 % of its span, or a metre)
export function sameSurveyFile(loaded, incoming) {
  const a = surveyExtent(loaded), b = surveyExtent(incoming);
  if (a.n !== b.n) return false;
  const tol = Math.max(1, 0.01 * Math.max(a.xmax - a.xmin, a.ymax - a.ymin));
  return Math.abs(a.xmin - b.xmin) <= tol && Math.abs(a.xmax - b.xmax) <= tol && Math.abs(a.ymin - b.ymin) <= tol && Math.abs(a.ymax - b.ymax) <= tol;
}
// the surveys an import would replace that are NOT the same file: [{ key, loaded: extent, incoming: extent }]
export function surveyNameClashes(prev, incoming) {
  const byKey = (rows) => { const m = new Map(); for (const r of rows || []) { const k = surveyKey(r); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(r); } return m; };
  const had = byKey(prev), now = byKey(incoming), out = [];
  for (const [k, rows] of now) { const old = had.get(k); if (old && !sameSurveyFile(old, rows)) out.push({ key: k, loaded: surveyExtent(old), incoming: surveyExtent(rows) }); }
  return out;
}
// 'IP.xyz' -> 'IP.xyz (2)' (then (3) ...) when taken
export function uniqueSurveyKey(name, keys) {
  const taken = keys instanceof Set ? keys : new Set(keys || []);
  if (!taken.has(name)) return name;
  for (let k = 2; ; k++) if (!taken.has(`${name} (${k})`)) return `${name} (${k})`;
}
// a survey renamed: its points' _src and its metadata (method, units, legend, label) moved to the new name
export function renameSurvey(rows, surveys, from, to) {
  const outRows = (rows || []).map((r) => (surveyKey(r) === from ? { ...r, _src: to } : r));
  const outSurveys = { ...(surveys || {}) };
  if (from in outSurveys) { outSurveys[to] = outSurveys[from]; delete outSurveys[from]; }
  return { rows: outRows, surveys: outSurveys };
}
// a file of a multi-file import without the chosen value column: its only other numeric column (not X / Y / Z or a line, station, time
// or date column), or null when there is none or more than one
const NOT_VALUE = /^(x|y|z|e|n|east(ing)?|north(ing)?|elev(ation)?|lon(gitude)?|lat(itude)?|line|line_?no|station|stn|fid|time|date|utc|gps_?time|_line)$/i;
export function soleValueColumn(columns, rows, used = []) {
  const skip = new Set(used.filter(Boolean));
  const sample = (rows || []).slice(0, 200);
  const numeric = (c) => { let n = 0, ok = 0; for (const r of sample) { const v = r[c]; if (v == null || v === "") continue; n++; if (Number.isFinite(typeof v === "number" ? v : Number(v))) ok++; } return n > 0 && ok >= 0.9 * n; };
  const cands = (columns || []).filter((c) => !skip.has(c) && !NOT_VALUE.test(String(c).trim()) && numeric(c));
  return cands.length === 1 ? cands[0] : null;
}

// TASKS.csv #3321 (Galore Creek review: 'Grid with equivalent sources…' was offered on IP chargeability, resistivity, an electrode list and a
// 3D cloud) — equivalent sources continue a potential field measured on or above the ground: offered for magnetic and gravity surveys, and
// for one not labelled (with what it assumes); not for other methods. The derived points at depth stay without the button (#1985 / #1994 /
// #1986). -> "hidden" | "ok" | "assume" | "no"
export const EQS_HIDDEN = new Set(["euler_depth", "mt_bostick", "lidar", "em1d_cond", "worms_height", "tiltdepth_depth"]);
export function eqsApplies(method) {
  if (!method || method === "other") return "assume";
  if (EQS_HIDDEN.has(method)) return "hidden";
  const g = SURVEY_METHODS[method]?.group;
  return g === "mag" || g === "grav" ? "ok" : "no";
}

// TASKS.csv #3400 (Matt: "I wanna have the ribbon menu with all the survey names or abbreviations. So a beginner will know where to find the
// survey they want to work with") — the Surveys ribbon's Magnetics / Gravity / Radiometrics buttons (and EM > TEM channel) open the point
// importer set to that method: a file read there takes the method its columns name when it is of that kind (a reduced-to-pole grid, eTh),
// else the kind's usual one. -> a SURVEY_METHODS key, or the guess as before with no hint
export const METHOD_HINTS = { mag: "mag", grav: "grav", rad: "rad_tc", tem: "em_dbdt" };
const TEM_METHODS = new Set(["em_dbdt", "em_bfield", "em_tau"]);
export function methodWithHint(guess, hint) {
  if (!hint || !METHOD_HINTS[hint]) return guess || null;
  const fits = hint === "tem" ? TEM_METHODS.has(guess) : SURVEY_METHODS[guess]?.group === hint;
  return fits ? guess : METHOD_HINTS[hint];
}
