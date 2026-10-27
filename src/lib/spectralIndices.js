import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
// TASKS.csv #783 — spectral indices from a multiband GeoTIFF (Matt, 2026-10-20, after the #782 review: "yes, go ahead
// with the spectral indices"). Band arithmetic with exploration presets: ASTER thermal-infrared emissivity indices for
// silica / carbonate / mafic rock (Ninomiya 2003), and the common Sentinel-2 / Landsat 8-9 ratios for ferric iron,
// ferrous iron and clay / hydroxyl. Pure (no DOM): the importer reads the bands and calls evaluateIndex per pixel.
//
// Honesty, stated with every preset: an index is a RATIO OF SURFACE SIGNALS, not a mineral map — vegetation, snow,
// water, shadow and the sensor's pixel size all shape it, and only exposed rock or soil means anything.

export const SENSORS = {
  aster_tir: {
    label: "ASTER thermal emissivity (AST_05, 5 bands)",
    roles: ["B10", "B11", "B12", "B13", "B14"],
    defaultBands: { B10: 1, B11: 2, B12: 3, B13: 4, B14: 5 }, // AST_05 carries bands 10-14 in order
    pixel: "90 m",
    source: "NASA AST_05 surface emissivity (TES), free with an Earthdata login",
  },
  // TASKS.csv #806 — the #805 review (pyGMI) found GeoStrix read ASTER's thermal bands only. Bands 1-9 (VNIR 15 m,
  // SWIR 30 m) carry the classic alteration ratios. AST_07XT is surface reflectance x 1000 (dnScale), crosstalk-corrected;
  // the SWIR detector failed in April 2008, so only 2000-2008 scenes have bands 4-9. Stacked VNIR then SWIR = B1..B9.
  aster_vnir_swir: {
    label: "ASTER VNIR + SWIR surface reflectance (AST_07XT, 9 bands)",
    roles: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"],
    defaultBands: { B1: 1, B2: 2, B3: 3, B4: 4, B5: 5, B6: 6, B7: 7, B8: 8, B9: 9 },
    reflectance: true, nir: "B3", red: "B2", dnScale: 1000,
    pixel: "15 m (VNIR) / 30 m (SWIR)",
    source: "NASA AST_07XT surface reflectance, free with an Earthdata login; SWIR bands only for 2000-2008 scenes",
  },
  sentinel2: {
    label: "Sentinel-2 surface reflectance",
    roles: ["B2", "B3", "B4", "B8", "B11", "B12"],
    defaultBands: {}, // exports differ in band order: the user maps them
    reflectance: true, nir: "B8", red: "B4", // #789: the dark floor and the vegetation mask
    pixel: "10-20 m",
    source: "Copernicus Sentinel-2 L2A",
  },
  landsat: {
    label: "Landsat 8 / 9 OLI surface reflectance",
    roles: ["B2", "B4", "B5", "B6", "B7"],
    defaultBands: {},
    reflectance: true, nir: "B5", red: "B4",
    pixel: "30 m",
    source: "USGS Landsat Collection 2 Level-2",
  },
};

export const INDEX_PRESETS = [
  { id: "aster_qi", sensor: "aster_tir", label: "Quartz index (silica)", expr: "B11*B11/(B10*B12)", what: "Quartz's emissivity has a doublet low (the reststrahlen feature) in ASTER bands 10 and 12 with a relative high in band 11: high values = silica-rich rock, silicification, quartz veins or silica caps (Ninomiya 2003)." },
  { id: "aster_ci", sensor: "aster_tir", label: "Carbonate index", expr: "B13/B14", what: "Carbonates have an emissivity low in band 14: high values = limestone, marble or carbonate alteration (Ninomiya 2003)." },
  { id: "aster_mi", sensor: "aster_tir", label: "Mafic index", expr: "B12*B14^3/B13^4", what: "Mafic rock moves the emissivity low to longer wavelengths, into band 13: high values (band 13 low against 12 and 14) = mafic / ultramafic rock (Ninomiya 2003)." },
  // TASKS.csv #806 — ASTER VNIR-SWIR ratios as tabulated in Kalinowski & Oliver (2004), "ASTER Mineral Index Processing
  // Manual", Geoscience Australia (after Rowan & Mars 2003, Ninomiya 2003, Cudahy). Written from the published formulas.
  { id: "astv_gossan", sensor: "aster_vnir_swir", label: "Gossan", expr: "B4/B2", what: "Iron oxides absorb in the visible (band 2) and reflect in SWIR 1 (band 4): high values = gossans and strongly oxidised outcrop (Kalinowski & Oliver 2004)." },
  { id: "astv_ferric", sensor: "aster_vnir_swir", label: "Ferric iron (Fe3+)", expr: "B2/B1", what: "Hematite, goethite and jarosite reflect red (band 2) more than green (band 1): high values = ferric iron (Rowan & Mars 2003)." },
  { id: "astv_ferrous", sensor: "aster_vnir_swir", label: "Ferrous iron (Fe2+)", expr: "B5/B3 + B1/B2", what: "Ferrous iron absorbs near 1 micron (band 3) and in the green: high values = ferrous iron in chlorite, mafic rock or ferrous carbonates." },
  { id: "astv_sericite", sensor: "aster_vnir_swir", label: "Sericite / muscovite / illite (Al-OH)", expr: "(B5+B7)/B6", what: "White mica, illite and smectite absorb at 2.20 microns (band 6) with shoulders in bands 5 and 7: high values = phyllic (sericitic) alteration. Some kaolinite and alunite too." },
  { id: "astv_argillic", sensor: "aster_vnir_swir", label: "Alunite / kaolinite / pyrophyllite (advanced argillic)", expr: "(B4+B6)/B5", what: "Alunite, kaolinite and pyrophyllite absorb at 2.16-2.17 microns (band 5): high values = advanced argillic alteration, the high-sulphidation lithocap (Rowan & Mars 2003)." },
  { id: "astv_kaolinite", sensor: "aster_vnir_swir", label: "Kaolinite", expr: "B7/B5", what: "Kaolinite's doublet deepens band 5 against band 7: high values = kaolinite (argillic alteration, weathering)." },
  { id: "astv_phengite", sensor: "aster_vnir_swir", label: "Phengitic white mica", expr: "B5/B6", what: "Follows where the 2.2 micron feature sits: it rises as the feature moves to longer wavelengths (Al-poor phengitic mica). Compare within one scene; band 6 is broad, so this is a hint, not a white-mica chemistry map." },
  { id: "astv_propylitic", sensor: "aster_vnir_swir", label: "Chlorite / epidote / carbonate (propylitic)", expr: "(B7+B9)/B8", what: "Chlorite, epidote and calcite absorb at 2.31-2.34 microns (band 8): high values = propylitic alteration or carbonate rock (Rowan & Mars 2003)." },
  { id: "astv_mgoh", sensor: "aster_vnir_swir", label: "Mg-OH (chlorite / epidote / amphibole)", expr: "(B6+B9)/(B7+B8)", what: "Mg-OH minerals absorb in bands 7-8: high values = chlorite, epidote, amphibole, talc - propylitic halo or mafic / ultramafic rock (Cudahy)." },
  { id: "s2_ferric", sensor: "sentinel2", label: "Ferric iron (red / blue)", expr: "B4/B2", what: "Iron oxides (hematite, goethite, jarosite: gossans, oxidised zones) reflect red and absorb blue: high values = ferric iron." },
  { id: "s2_ferrous", sensor: "sentinel2", label: "Ferrous iron", expr: "B12/B8 + B3/B4", what: "Ferrous iron in silicates (chlorite, mafic rock) absorbs near 1 micron: high values = ferrous iron." },
  { id: "s2_clay", sensor: "sentinel2", label: "Clay / hydroxyl (SWIR 1 / SWIR 2)", expr: "B11/B12", what: "Al-OH and Mg-OH minerals (clays, sericite, chlorite) absorb near 2.2 microns (band 12): high values = hydroxyl-bearing alteration. Broad bands: it cannot tell kaolinite from sericite." },
  { id: "ls_ferric", sensor: "landsat", label: "Ferric iron (red / blue)", expr: "B4/B2", what: "Iron oxides reflect red and absorb blue: high values = ferric iron (gossans, oxidised zones)." },
  { id: "ls_ferrous", sensor: "landsat", label: "Ferrous iron (SWIR 1 / NIR)", expr: "B6/B5", what: "Ferrous iron absorbs in the near infrared: high values = ferrous iron." },
  { id: "ls_clay", sensor: "landsat", label: "Clay / hydroxyl (SWIR 1 / SWIR 2)", expr: "B6/B7", what: "Hydroxyl-bearing minerals absorb in SWIR 2 (band 7): high values = clay / sericite / chlorite alteration." },
];

// ---- a small, safe expression language: numbers, band names, + - * / ^, parentheses, unary minus ----
function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/^()]))/y;
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(tr("Unexpected \"{v}\" at position {v2}.", { v: src[i], v2: i + 1 }));
    i = re.lastIndex;
    if (m[1] != null) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] != null) out.push({ t: "id", v: m[2] });
    else out.push({ t: "op", v: m[3] === "**" ? "^" : m[3] });
  }
  return out;
}

// Compiles an expression into a function of a {name: value} lookup; throws with a readable message. Grammar:
// expr = term (('+'|'-') term)*; term = unary (('*'|'/') unary)*; unary = '-' unary | power;
// power = atom ('^' unary)?  (right-associative); atom = number | name | '(' expr ')'.
export function compileExpression(src, allowed) {
  const toks = tokenize(String(src || ""));
  if (!toks.length) throw new Error(tr("The expression is empty."));
  let p = 0;
  const used = new Set();
  const peek = () => toks[p], take = () => toks[p++];
  const isOp = (v) => peek()?.t === "op" && peek().v === v;
  const atom = () => {
    const t = take();
    if (!t) throw new Error(tr("The expression ends too early."));
    if (t.t === "num") { const v = t.v; return () => v; }
    if (t.t === "id") {
      if (allowed && !allowed.includes(t.v)) throw new Error(tr("Unknown band \"{v}\" (use {allowed}).", { v: t.v, allowed: allowed.join(", ") }));
      used.add(t.v);
      const k = t.v;
      return (b) => b[k];
    }
    if (t.v === "(") { const e = expr(); if (!isOp(")")) throw new Error(tr("A bracket is not closed.")); take(); return e; }
    throw new Error(tr("Unexpected \"{v}\".", { v: t.v }));
  };
  const power = () => { const a = atom(); if (isOp("^")) { take(); const b = unary(); return (x) => Math.pow(a(x), b(x)); } return a; };
  const unary = () => { if (isOp("-")) { take(); const a = unary(); return (x) => -a(x); } if (isOp("+")) { take(); return unary(); } return power(); };
  const term = () => {
    let a = unary();
    while (isOp("*") || isOp("/")) {
      const op = take().v, l = a, r = unary();
      a = op === "*" ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
    }
    return a;
  };
  const expr = () => {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const op = take().v, l = a, r = term();
      a = op === "+" ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
    }
    return a;
  };
  const fn = expr();
  if (p < toks.length) throw new Error(tr("Unexpected \"{v}\" after the end of the expression.", { v: toks[p].v }));
  return { fn, uses: [...used] };
}

// TASKS.csv #789 — a ratio is noise where a band is nearly zero. Sentinel-2's atmospheric correction leaves blue at
// ~0.0001 in dark forest and shadow, so red/blue reaches 29-128 there; MEASURED (Mount Lyell gossan, Tasmania, S2B
// 2024-06-15, and Rio Tinto, Spain, S2C 2024-12-11): those pixels filled the whole top of the 2-98 % stretch and the
// red bare gossan ranked at only the 83rd / 29th percentile - drawn in the low colours, "it won't pick that up" (Matt).
// With bands under 1 % reflectance blanked the stretch top fell from 29 to 2.7 and the gossan rose to the 93rd.
export const DARK_FLOOR = 0.01; // reflectance
export const VEG_NDVI_MAX = 0.4; // vegetated above this: iron / clay ratios mean nothing through a canopy

// The floor in the file's own units: reflectance 0-1, or scaled integers (Sentinel-2 / Landsat DN x 10000; ASTER AST_07XT
// x 1000, #806 - pass dnScale) when the bands' median is well above 1.
export function darkFloor(arrays, dnScale = 10000) {
  const s = [];
  for (const a of arrays) { const step = Math.max(1, Math.floor(a.length / 5000)); for (let i = 0; i < a.length; i += step) if (a[i] > 0 && Number.isFinite(a[i])) s.push(a[i]); }
  if (!s.length) return DARK_FLOOR;
  s.sort((x, y) => x - y);
  return s[s.length >> 1] > 2 ? DARK_FLOOR * dnScale : DARK_FLOOR;
}

// TASKS.csv #928 — how a file's pixel values become reflectance. Fetched scenes are converted on the way in (#784,
// imageryFetch s2Offset); a file was only ever scaled, so a Sentinel-2 export from processing baseline 04.00 on (every
// scene since January 2022: DN - 1000) or a Landsat Collection 2 Level-2 one (DN x 0.0000275 - 0.2) had every ratio
// pulled towards 1 (a gossan's B4/B2 of 6.00 read 2.67 and 2.00) and the dark-pixel mask could not fire.
export const DN_ENCODINGS = {
  reflectance: { label: "Reflectance 0-1", f: (v) => v },
  scaled: { label: "DN ÷ 10,000 (Sentinel-2 before processing baseline 04.00, most scaled products)", f: (v) => v / 10000 },
  s2offset: { label: "Sentinel-2, processing baseline 04.00 or later (2022 on): (DN − 1000) ÷ 10,000", f: (v) => (v - 1000) / 10000 },
  landsatC2: { label: "Landsat Collection 2 Level-2: DN × 0.0000275 − 0.2", f: (v) => v * 0.0000275 - 0.2 },
  aster: { label: "ASTER AST_07XT: DN ÷ 1,000", f: (v) => v / 1000 },
};
// A guess from the values, said as a guess in the notice: values of 0-2 are reflectance; a Sentinel-2 file whose 1st
// percentile is 1,000 or more carries the offset (without it dark water and shadow sit at tens to hundreds of DN); a
// Landsat file whose 1st percentile is over 7,000 is Collection 2 Level-2 (zero reflectance is DN 7,273).
export function detectEncoding(arrays, sensorKey) {
  const s = [];
  for (const a of arrays) { const step = Math.max(1, Math.floor(a.length / 5000)); for (let i = 0; i < a.length; i += step) if (a[i] > 0 && Number.isFinite(a[i])) s.push(a[i]); }
  if (!s.length) return "reflectance";
  s.sort((x, y) => x - y);
  const med = s[s.length >> 1], p1 = s[Math.floor(s.length * 0.01)];
  if (med <= 2) return "reflectance";
  if (sensorKey === "aster_vnir_swir") return "aster";
  if (sensorKey === "landsat" && p1 > 7000) return "landsatC2";
  if (sensorKey === "sentinel2" && p1 >= 1000) return "s2offset";
  return "scaled";
}

// The index for every pixel: `bands` = the file's bands (arrays, 0-based), `mapping` = {role: 1-based band number},
// `isNoData(v)` for the file's nodata. A pixel is blank (NaN) when any band it uses is nodata, not finite or <= 0
// (reflectance and emissivity are positive; 0 is the usual fill), or when the result is not finite. #789: `floor`
// ("auto" = darkFloor of the bands used, or a number) also blanks a pixel with a used band below it, and `veg`
// ({ nir, red } roles in `mapping`, `max` NDVI) blanks vegetated pixels. Returns { values: Float32Array, blank, dark, vegetated }.
export function evaluateIndex(bands, mapping, expr, { isNoData = () => false, floor = 0, veg = null, dnScale = 10000, encoding = null } = {}) { // dnScale: #806; encoding: #928 (a DN_ENCODINGS key: values converted to reflectance first)
  const { fn, uses } = compileExpression(expr, Object.keys(mapping));
  const col = (r) => {
    const k = Number(mapping[r]) - 1;
    if (!(k >= 0 && k < bands.length)) throw new Error(tr("Band {r} is mapped to band {v}, but the file has {bands}.", { r, v: mapping[r], bands: bands.length }));
    return bands[k];
  };
  const cols = uses.map((r) => [r, col(r)]);
  const conv = encoding && DN_ENCODINGS[encoding] ? DN_ENCODINGS[encoding].f : null;
  const lo = floor === "auto" ? (conv ? DARK_FLOOR : darkFloor(cols.map(([, a]) => a), dnScale)) : Number(floor) || 0;
  const nir = veg ? col(veg.nir) : null, red = veg ? col(veg.red) : null, vmax = veg?.max ?? VEG_NDVI_MAX;
  const n = bands[0].length, values = new Float32Array(n), env = {};
  let blank = 0, dark = 0, vegetated = 0;
  for (let i = 0; i < n; i++) {
    let ok = true, isDark = false;
    for (const [r, arr] of cols) {
      const raw = arr[i];
      if (!(raw > 0) || !Number.isFinite(raw) || isNoData(raw)) { ok = false; break; } // 0 / nodata are judged on the file's own values
      const v = conv ? conv(raw) : raw;
      if (!(v > 0)) { ok = false; break; } // at or below zero reflectance
      if (v < lo) isDark = true; env[r] = v;
    }
    if (ok && isDark) { ok = false; dark++; }
    if (ok && nir) { const a = conv ? conv(nir[i]) : nir[i], b = conv ? conv(red[i]) : red[i]; if (a + b > 0 && (a - b) / (a + b) > vmax) { ok = false; vegetated++; } }
    const out = ok ? fn(env) : NaN;
    if (Number.isFinite(out)) values[i] = out; else { values[i] = NaN; blank++; }
  }
  return { values, blank, dark, vegetated };
}
