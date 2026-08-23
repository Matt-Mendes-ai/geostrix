// ============================================================
// Layer metadata, colors, and generic CSV import mapping helpers
// ============================================================

// Bug found during the UBC-mesh-coarsening perf fix (real repro: a 432,000-value array crashed with
// "Maximum call stack size exceeded"): `Math.min(...arr)`/`Math.max(...arr)` spreads the WHOLE array
// as individual call arguments, which blows the JS engine's argument-count limit (V8's ceiling sits
// somewhere in the ~65k-125k range depending on build/stack depth) well under sizes this app's own
// data actually reaches — a large assay/geophysics dataset, a big DEM grid, or a many-hole project's
// desurveyed trace points can all get there. A plain reduce loop has no such limit. Shared here since
// the same min/max-over-a-big-array pattern shows up across several modules.
export function minMax(arr, mapFn) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = mapFn ? mapFn(arr[i]) : arr[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}

function hashColor(key, sat = 55, light = 52) {
  let hash = 0;
  const k = (key === undefined || key === null || key === "" ? "unknown" : String(key)).toLowerCase();
  for (let i = 0; i < k.length; i++) hash = k.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, ${sat}%, ${light}%)`;
}

export const LITHO_COLORS = {
  obn: "#8a7860", v1: "#c98a5a", silbx: "#d4522e", s5: "#6b7a8a", s4: "#8a8578",
  s7: "#332f2a", v5: "#6b8060", v6: "#33502f", i6: "#3d5a4c", m1: "#7a7550",
  m4: "#d8d0b8", s6: "#a8b8a0", flt: "#c0392b",
  kom: "#2f6b3d", "thol-fe": "#7a3d3d", "thol-mafic": "#3d5a4c", "ca-basalt": "#33502f",
  "ca-and": "#6b8060", "ca-dac": "#c98a5a", "ca-rhy": "#d8b06a",
  bas: "#33502f", "and-bas": "#4a6b4a", and: "#6b8060", "rhy-dac": "#c98a5a",
  "alk-bas": "#7a3d5a", trachy: "#a5708a", "sub-alk": "#3d5a6b", fono: "#8a6fae",
};
export const UNIT_NAMES = {
  OBN: "OBN — Overburden", V1: "V1 — Meta-rhyolite flow", SILBX: "SILBX — Hydrothermal breccia",
  S5: "S5 — Meta-siltstone", S4: "S4 — Meta-greywacke", S7: "S7 — Argillite (graphitic)",
  V5: "V5 — Meta-andesite flow", V6: "V6 — Meta-basalt flow", I6: "I6 — Meta-gabbro/diabase dyke",
  M1: "M1 — Basalt-phyllite", M4: "M4 — Quartzite / silica phyllite", S6: "S6 — Calc-silicate rock",
  FLT: "FLT — Fault zone",
};
export function colorForLithology(u) { const k = (u || "").toLowerCase(); return LITHO_COLORS[k] || hashColor(u); }

export const ALT_COLORS = { CARB: "#b8c4c8", KSP: "#8a3a3a", MAG: "#4a4a4a", OX: "#b5622c", PRO: "#4a6b4a", QSP: "#d4b06a", SIL: "#e8e2d0", UNK: "#6a6a6a",
  SER: "#d4b06a", CHL: "#4a6b4a", EPI: "#7a9e6a", FRESH: "#5a6472" };
export function colorForAlteration(a) { return ALT_COLORS[(a || "").toUpperCase()] || hashColor(a); }

export const VEIN_COLORS = { CARB: "#a8c4a0", PY: "#c9c93d", "QTZ-PY": "#d4c060", QZ: "#e8e2d0", "QZ-CB": "#cfe0c8", "QZ-CHL": "#7fae7a", "QZ-SUL": "#b08a5a" };
export function colorForVein(v) { return VEIN_COLORS[(v || "").toUpperCase()] || hashColor(v); }

export const MIN_COLORS = { ACA: "#c8c8d8", CPY: "#d4af37", GAL: "#6a6a78", PO: "#8a6a45", PY: "#d4c060", SPH: "#6a3a2a" };
export function colorForMineral(m) { return MIN_COLORS[(m || "").toUpperCase()] || hashColor(m); }

export const STRUCT_COLORS = { ALT: "#c9863d", BD: "#4a7ab5", CON: "#8a6fae", FLT: "#c0392b", FOL: "#3a8a8a", FOLD: "#4aa06a", SHZ: "#a5407a", VN: "#cfc7b0" };
export function colorForStructure(t) { return STRUCT_COLORS[(t || "").toUpperCase()] || hashColor(t); }

export function rqdColor(pct) {
  if (pct == null || isNaN(pct)) return "#555";
  const stops = [[0, [192, 57, 43]], [25, [214, 137, 16]], [50, [212, 175, 55]], [75, [130, 175, 70]], [100, [70, 160, 90]]];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (pct >= stops[i][0] && pct <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  const span = hi[0] - lo[0], t = span <= 0 ? 0 : (pct - lo[0]) / span;
  const c = lo[1].map((v, i) => Math.round(v + (hi[1][i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
// TASKS.csv #209 — split out the numeric math so a hot per-instance loop (ViewerModule's voxel
// InstancedMesh build) can get plain [r,g,b] numbers directly instead of round-tripping through a
// freshly-allocated "rgb(...)" string just to have three.js's Color.setStyle() immediately re-parse
// it via regex — a real, profiled cost at multi-hundred-thousand-cell scale (see that call site's own
// comment for the measured before/after). magColor itself is unchanged for every other caller that
// actually wants a CSS color string (legend swatches, etc).
export function magColorRGB(v, min, max) {
  const t = max <= min ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
  const lo = [70, 110, 190], hi = [220, 70, 60];
  return lo.map((x, i) => Math.round(x + (hi[i] - x) * t));
}
export function magColor(v, min, max) {
  const c = magColorRGB(v, min, max);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export { hashColor };

// ---- voxel/block-model color ramps (user request: import an OMF file's own colour legend, and be
// able to edit colours/ranges/classify them from the layers panel, same as any GIS package's raster/
// block-model symbology). A model's colour is driven by an ordered list of {value, color} "stops" —
// either imported straight from the OMF file's ScalarColormap gradient (see omf.js's convertColormap),
// or generated here by classifyBreaks, or hand-edited by the user in GeophysicsModule's VoxelModelRow.
// Models with no stops at all (plain UBC/CSV imports, or an OMF file with no embedded colormap) keep
// using the original 2-color magColor gradient below — this is purely additive, no existing model's
// appearance changes unless it actually has stops.

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
}
function rgbToHex(r, g, b) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
function lerpColorHex(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}

// Evenly-spaced hex colors along the same blue->red ramp magColor uses, for generating N classified
// bin colors (e.g. for the "Classify" equal-interval/quantile actions below). Kept as the default/
// fallback ramp for any caller that doesn't ask for a named palette (see PALETTES below).
export function rampColorsHex(n) {
  return paletteColorsHex("default", n);
}

// User request: "Can we have some gradient colour pallets options for the voxels legends? Get some
// that are typically used in geophysics and name them with the suggested geophysical survey type use."
// Each entry is an ordered list of hex anchor colors sampled evenly across a model's value range —
// same multi-stop-lerp approach VoxelLegendEditor's Classify control already used for the 2-color
// default, just generalized to N anchor colors per palette instead of always exactly 2.
export const PALETTES = {
  default:     { label: "Blue → Red (default)",            colors: ["#4669be", "#dc463c"] },
  geosoft:     { label: "Spectrum — magnetics / gravity (classic Oasis montaj default)", colors: ["#1c1c8c", "#0050c8", "#00b4dc", "#28c878", "#c8e600", "#ffaa00", "#ff3200", "#c80028"] },
  rainbow:     { label: "Rainbow — magnetics / gravity / EM",  colors: ["#3b3bbe", "#1e90d2", "#28b4a0", "#5ac832", "#e6dc1e", "#f08c1e", "#e63c28"] },
  resistivity: { label: "Resistivity / IP (low→high resistivity)", colors: ["#c83c28", "#f08c1e", "#e6dc1e", "#5ac832", "#28b4a0", "#1e90d2", "#3b3bbe"] },
  viridis:     { label: "Viridis — general purpose / any survey", colors: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"] },
  diverging:   { label: "Diverging Blue–White–Red — residual / anomaly grids", colors: ["#3b4cc0", "#a1c4fd", "#f7f7f7", "#f4a582", "#b40426"] },
  grayscale:   { label: "Grayscale — radiometrics / amplitude data", colors: ["#1a1a1a", "#8c8c8c", "#f2f2f2"] },
};

// Samples N evenly-spaced colors along a named palette's anchor-color gradient (piecewise-linear
// through every anchor, same idea as colorForVoxelValue's continuous stop interpolation below, just
// against a fixed named ramp instead of a model's own editable stops).
export function paletteColorsHex(paletteKey, n) {
  const anchors = PALETTES[paletteKey]?.colors || PALETTES.default.colors;
  const count = Math.max(1, n);
  if (anchors.length === 1) return Array.from({ length: count }, () => anchors[0]);
  return Array.from({ length: count }, (_, i) => {
    const t = count <= 1 ? 0 : i / (count - 1);
    const scaled = t * (anchors.length - 1);
    const idx = Math.min(anchors.length - 2, Math.floor(scaled));
    return lerpColorHex(anchors[idx], anchors[idx + 1], scaled - idx);
  });
}

// TASKS.csv #209 — perf fix, profiled not guessed. colorForVoxelValue below re-sorts model.stops AND
// re-parses every stop's hex string on EVERY call — fine for a one-off UI lookup, but ViewerModule's
// voxel InstancedMesh build calls this ONCE PER CELL, so a model with hundreds of thousands of cells
// (a real OMF import with its own colour legend — exactly what a heavy real-world voxel model looks
// like) was re-sorting the same handful of stops and re-parsing the same hex strings that many times
// over, then handing the result to three.js's Color.setStyle() for yet another parse. This factory
// does the sort + hex-parse ONCE per model and returns a closure that only does the cheap per-value
// lookup/interpolation, in plain numbers — no strings anywhere in the hot path. Used by ViewerModule's
// voxel-build effect; colorForVoxelValue itself is untouched and still used by every non-hot-loop
// caller (legend swatches, the section/fence-diagram color lookup, etc) that wants a CSS string.
export function makeVoxelColorResolverRGB(model) {
  const stops = model?.stops;
  if (!stops || !stops.length) {
    const min = model?.min, max = model?.max;
    return (value) => magColorRGB(value, min, max);
  }
  const sorted = [...stops].sort((a, b) => a.value - b.value).map((s) => ({ value: s.value, rgb: hexToRgb(s.color) }));
  const discrete = model.colorMode === "discrete";
  return (value) => {
    if (discrete) {
      let rgb = sorted[0].rgb;
      for (const s of sorted) { if (value >= s.value) rgb = s.rgb; else break; }
      return rgb;
    }
    if (value <= sorted[0].value) return sorted[0].rgb;
    if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].rgb;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (value >= a.value && value <= b.value) {
        const t = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value);
        return [
          Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
          Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
          Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t),
        ];
      }
    }
    return sorted[sorted.length - 1].rgb;
  };
}

// Resolves a voxel/block-model cell's display color, honoring the model's own stops+colorMode when
// present, else falling back to the original continuous 2-color magColor(value, min, max) behavior.
export function colorForVoxelValue(model, value) {
  const stops = model?.stops;
  if (!stops || !stops.length) return magColor(value, model?.min, model?.max);
  const sorted = [...stops].sort((a, b) => a.value - b.value);
  if (model.colorMode === "discrete") {
    let color = sorted[0].color;
    for (const s of sorted) { if (value >= s.value) color = s.color; else break; }
    return color;
  }
  // continuous: linear-interpolate between the two stops bracketing this value
  if (value <= sorted[0].value) return sorted[0].color;
  if (value >= sorted[sorted.length - 1].value) return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (value >= a.value && value <= b.value) {
      const t = b.value === a.value ? 0 : (value - a.value) / (b.value - a.value);
      return lerpColorHex(a.color, b.color, t);
    }
  }
  return sorted[sorted.length - 1].color;
}

// "Classify" — generate N breakpoints (each the LOWER bound of its class) from a value array, the
// same equal-interval/quantile options standard GIS packages offer for choropleth/raster symbology.
export function classifyBreaks(values, n, method = "equal") {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return [];
  // User report: "I tried adding 30 but it didn't work" — this used to silently clamp to 20 with zero
  // feedback (the class-count number input's HTML max=20 doesn't actually block typing a bigger number
  // in Chrome, so 30 got typed, then silently dropped to 20 stops right here with nothing telling the
  // user that happened). Raised the ceiling to 64 (comfortably past any real classification a geophysics
  // legend would use) — GeophysicsModule's input max attribute was raised to match.
  const count = Math.max(2, Math.min(64, Math.round(n) || 5));
  const min = nums[0], max = nums[nums.length - 1];
  const breaks = [];
  if (method === "quantile") {
    for (let i = 0; i < count; i++) breaks.push(nums[Math.floor((i / count) * (nums.length - 1))]);
  } else {
    for (let i = 0; i < count; i++) breaks.push(min + (i / count) * (max - min));
  }
  return breaks;
}

export const LAYER_META = {
  litho:    { label: "Lithology",      kind: "interval", radius: 2.2, opacity: 1,    colorFn: colorForLithology, nameFn: (u) => UNIT_NAMES[u] || u, numeric: false },
  alt:      { label: "Alteration",     kind: "interval", radius: 3.4, opacity: 0.4,  colorFn: colorForAlteration, numeric: false },
  vein:     { label: "Veins",          kind: "interval", radius: 1.0, opacity: 0.9,  colorFn: colorForVein, numeric: false },
  geotech:  { label: "Geotech (RQD%)", kind: "interval", radius: 4.6, opacity: 0.35, colorFn: null, numeric: true },
  mnlgy:    { label: "Mineralization", kind: "point",    colorFn: colorForMineral, numeric: false },
  magsusc:  { label: "Mag. susc.",     kind: "point",    colorFn: null, numeric: true },
  structure:{ label: "Structure planes", kind: "plane",  colorFn: colorForStructure, numeric: false },
  litho_gc: { label: "Lithology (geochem)", kind: "interval", radius: 2.6, opacity: 0.85, colorFn: colorForLithology, numeric: false },
  alt_gc:   { label: "Alteration (geochem)", kind: "interval", radius: 3.8, opacity: 0.4, colorFn: colorForAlteration, numeric: false },
  // TASKS.csv #25 — raw x/y/z geophysics point clouds (mag, IP, gravity, whatever), imported via the
  // Geophysics module (its own dedicated CSV parser, not the hole-relative ImportMappingModal — these
  // rows have no hole_id/depth to desurvey against). "point3d" distinguishes this from the existing
  // "point" kind (mnlgy/magsusc), which is hole_id+depth based and gets positioned by desurveying a
  // trace; point3d rows carry their own absolute world x/y/z and are rendered once, independent of
  // any hole, in ViewerModule's geometry-rebuild effect.
  geophys_pts: { label: "Geophysics points", kind: "point3d", colorFn: null, numeric: true },
};

// ============================================================
// generic CSV import: target schemas + column-mapping helpers
// ============================================================
function intervalFields(valueAliases, extraAliases, numeric, descriptionAliases) {
  const fields = [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid"] },
    { key: "from", label: "From", required: true, aliases: ["from", "from_m", "depth_from"] },
    { key: "to", label: "To", required: true, aliases: ["to", "to_m", "depth_to"] },
    { key: "value", label: numeric ? "Value (numeric)" : "Value", required: true, aliases: valueAliases },
  ];
  if (extraAliases) fields.push({ key: "extra", label: "Extra (optional, e.g. %)", required: false, aliases: extraAliases });
  // TASKS.csv #208 — real source data (esp. lithology logs) very often carries a free-text
  // description/comments column alongside the coded value ("Pale green. Consistent fine grain.");
  // previously unmappable and silently dropped on import.
  if (descriptionAliases) fields.push({ key: "description", label: "Description (optional)", required: false, aliases: descriptionAliases });
  return fields;
}

// TASKS.csv #205 — name-guess aliases for an optional per-row source-CRS column (e.g. a merged
// regional DB export where different collars were surveyed in different UTM zones), matched the
// same way guessColumn already resolves hole_id/x/y/z against real-world header variants.
export const EPSG_COL_ALIASES = ["epsg_srid", "source_epsg", "epsg", "srid", "crs_epsg", "crs"];

export const TARGET_SCHEMAS = {
  collars: { label: "Collars", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid", "hole_name"] },
    { key: "x", label: "Easting (X)", required: true, aliases: ["x", "easting", "east"] },
    { key: "y", label: "Northing (Y)", required: true, aliases: ["y", "northing", "north"] },
    { key: "z", label: "Elevation (Z)", required: true, aliases: ["z", "elevation", "elev"] },
    { key: "azimuth", label: "Azimuth (for straight holes w/ no survey)", required: false, aliases: ["azimuth", "azi"] },
    { key: "dip", label: "Dip (for straight holes w/ no survey)", required: false, aliases: ["dip"] },
    { key: "length", label: "Hole length (optional)", required: false, aliases: ["length", "total_depth", "eoh"] },
  ], dipConvention: true },
  survey: { label: "Survey", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid"] },
    { key: "depth", label: "Depth", required: true, aliases: ["depth", "at", "md", "station"] },
    { key: "azimuth", label: "Azimuth", required: true, aliases: ["azimuth", "azi", "az"] },
    { key: "dip", label: "Dip", required: true, aliases: ["dip", "inclination", "incl"] },
  ], dipConvention: true },
  litho: { label: "Lithology", fields: intervalFields(["lithology", "litho", "unit", "litho_unit"], null, false, ["description", "comments", "comment", "notes", "desc"]) },
  alt: { label: "Alteration", fields: intervalFields(["assemblage", "alteration"]) },
  vein: { label: "Veins", fields: intervalFields(["assemblage", "type", "vein_type"]) },
  mnlgy: { label: "Mineralization", fields: intervalFields(["mineral"], ["percent", "pct"]) },
  geotech: { label: "Geotech (numeric)", fields: intervalFields(["rqd_pct", "rqd", "value"], null, true) },
  magsusc: { label: "Mag. susceptibility (numeric)", fields: intervalFields(["mag_avg_si", "mag", "value"], null, true) },
  structure: { label: "Structure planes", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid"] },
    { key: "depth", label: "Depth", required: true, aliases: ["depth_m", "depth", "at", "md"] },
    { key: "value", label: "Structure type", required: true, aliases: ["structure_type", "type"] },
    { key: "dip", label: "Dip (optional)", required: false, aliases: ["inferred_dip_deg", "dip"] },
    { key: "azimuth", label: "Dip azimuth (optional)", required: false, aliases: ["assumed_dip_azimuth", "dip_azimuth", "azimuth"] },
  ] },
  custom: { label: "Custom layer", fields: [
    { key: "hole_id", label: "Hole ID", required: true, aliases: ["hole_id", "holeid", "hole", "bhid"] },
    { key: "from", label: "From (leave unset if point data)", required: false, aliases: ["from", "from_m", "depth_from"] },
    { key: "to", label: "To (leave unset if point data)", required: false, aliases: ["to", "to_m", "depth_to"] },
    { key: "depth", label: "Depth (for point data)", required: false, aliases: ["depth", "at", "md"] },
    { key: "value", label: "Value / category", required: true, aliases: ["value", "label"] },
  ] },
};

export function guessColumn(headers, aliases) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const a of aliases) { const i = lower.indexOf(a); if (i >= 0) return headers[i]; }
  for (const a of aliases) { const i = lower.findIndex((h) => h.includes(a)); if (i >= 0) return headers[i]; }
  return "";
}
export function guessTarget(headers) {
  const lower = headers.map((h) => h.toLowerCase());
  const has = (s) => lower.some((h) => h.includes(s));
  // Exact-column check for the short x/y/z headers real collar exports commonly use — a plain
  // substring test on single letters would false-positive on all sorts of unrelated columns.
  const hasCol = (s) => lower.some((h) => h.trim() === s);

  // Collars: some x/y/z-ish trio and nothing that marks this as interval/point data instead.
  // Bug fix: this used to require "easting" literally, or "x" together with "northing" — real
  // exports (including the app's own sample datasets) commonly just use bare x/y/z headers,
  // which that check missed entirely, silently falling through to "custom" and forcing a manual
  // mapping every time.
  if (!has("from") && !has("depth") &&
      (has("easting") || hasCol("x")) &&
      (has("northing") || hasCol("y")) &&
      (has("elevation") || hasCol("z"))) return "collars";
  // Structure picks checked before survey: real bug found here — a structure CSV with columns
  // like depth_m/inferred_dip_deg/assumed_dip_azimuth satisfies the survey check below (it has
  // "azimuth", "depth", and no "from"), AND guessColumn's substring matching resolves survey's
  // dip/azimuth/depth fields against those same columns (inferred_dip_deg contains "dip", etc.) —
  // so a structure CSV used to get auto-committed as bogus downhole survey stations, silently
  // and confidently, no mapping dialog and no chance to catch it. Checking structure_type first
  // (before survey ever gets a look) fixes it at the source.
  if (has("structure_type")) return "structure";
  if (has("azimuth") && has("depth") && !has("from")) return "survey";
  // Mineralization: was previously gated on BOTH "assemblage" AND "mineral" being present, but
  // the mnlgy schema's own value-column aliases are just ["mineral"] (see TARGET_SCHEMAS.mnlgy
  // above) — a real mnlgy CSV never has an "assemblage" column, so that combined check could
  // never actually match one, and it fell through to the generic from/to→"litho" guess instead.
  if (has("mineral")) return "mnlgy";
  if (has("rqd")) return "geotech";
  if (has("mag_avg") || has("mag_susc")) return "magsusc";
  if (has("litho") || has("unit")) return "litho";
  // Veins and alteration share the "assemblage" alias (both schemas list it), so a CSV that uses
  // "type"/"vein_type" rather than "assemblage" is checked first to disambiguate the common case
  // (see sample_data's own vein.csv, which uses a "type" column).
  if (has("vein_type") || (has("type") && !has("assemblage"))) return "vein";
  if (has("assemblage")) return "alt";
  if (has("from") && has("to")) return "litho";
  if (has("depth")) return "structure";
  return "custom";
}
export function getCol(row, keys) {
  for (const k of keys) { const found = Object.keys(row).find((rk) => rk.toLowerCase().trim() === k); if (found && row[found] !== undefined && row[found] !== "") return row[found]; }
  return undefined;
}
export function distinctValues(rows) {
  const counts = new Map();
  rows.forEach((r) => { const k = String(r.value); counts.set(k, (counts.get(k) || 0) + 1); });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
