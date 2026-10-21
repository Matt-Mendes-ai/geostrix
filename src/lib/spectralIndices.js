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

// The floor in the file's own units: reflectance 0-1, or scaled integers (Sentinel-2 / Landsat DN x 10000) when the
// bands' median is well above 1.
export function darkFloor(arrays) {
  const s = [];
  for (const a of arrays) { const step = Math.max(1, Math.floor(a.length / 5000)); for (let i = 0; i < a.length; i += step) if (a[i] > 0 && Number.isFinite(a[i])) s.push(a[i]); }
  if (!s.length) return DARK_FLOOR;
  s.sort((x, y) => x - y);
  return s[s.length >> 1] > 2 ? DARK_FLOOR * 10000 : DARK_FLOOR;
}

// The index for every pixel: `bands` = the file's bands (arrays, 0-based), `mapping` = {role: 1-based band number},
// `isNoData(v)` for the file's nodata. A pixel is blank (NaN) when any band it uses is nodata, not finite or <= 0
// (reflectance and emissivity are positive; 0 is the usual fill), or when the result is not finite. #789: `floor`
// ("auto" = darkFloor of the bands used, or a number) also blanks a pixel with a used band below it, and `veg`
// ({ nir, red } roles in `mapping`, `max` NDVI) blanks vegetated pixels. Returns { values: Float32Array, blank, dark, vegetated }.
export function evaluateIndex(bands, mapping, expr, { isNoData = () => false, floor = 0, veg = null } = {}) {
  const { fn, uses } = compileExpression(expr, Object.keys(mapping));
  const col = (r) => {
    const k = Number(mapping[r]) - 1;
    if (!(k >= 0 && k < bands.length)) throw new Error(tr("Band {r} is mapped to band {v}, but the file has {bands}.", { r, v: mapping[r], bands: bands.length }));
    return bands[k];
  };
  const cols = uses.map((r) => [r, col(r)]);
  const lo = floor === "auto" ? darkFloor(cols.map(([, a]) => a)) : Number(floor) || 0;
  const nir = veg ? col(veg.nir) : null, red = veg ? col(veg.red) : null, vmax = veg?.max ?? VEG_NDVI_MAX;
  const n = bands[0].length, values = new Float32Array(n), env = {};
  let blank = 0, dark = 0, vegetated = 0;
  for (let i = 0; i < n; i++) {
    let ok = true, isDark = false;
    for (const [r, arr] of cols) { const v = arr[i]; if (!(v > 0) || !Number.isFinite(v) || isNoData(v)) { ok = false; break; } if (v < lo) isDark = true; env[r] = v; }
    if (ok && isDark) { ok = false; dark++; }
    if (ok && nir) { const a = nir[i], b = red[i]; if (a + b > 0 && (a - b) / (a + b) > vmax) { ok = false; vegetated++; } }
    const out = ok ? fn(env) : NaN;
    if (Number.isFinite(out)) values[i] = out; else { values[i] = NaN; blank++; }
  }
  return { values, blank, dark, vegetated };
}
