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

// TASKS.csv #249 (colorblind-safety review) — restricted to a 220°-wide hue arc (160°→380°, wrapping
// through 0°) that excludes the ~20°-160° red-green confusion band, biasing collisions away from the
// worst case for deuteranopia/protanopia instead of the previous full 0-360° range. This is a
// second-line mitigation only — an unbounded set of possible input codes still can't guarantee real
// separation from a hash alone, hash or not; see categoricalSafeColor below for the actual first-line
// fix (a curated palette assigned by first-seen order, used before this function is ever reached).
function hashColor(key, sat = 55, light = 52) {
  let hash = 0;
  const k = (key === undefined || key === null || key === "" ? "unknown" : String(key)).toLowerCase();
  for (let i = 0; i < k.length; i++) hash = k.charCodeAt(i) + ((hash << 5) - hash);
  const hue = (160 + (Math.abs(hash) % 220)) % 360;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// TASKS.csv #249 (colorblind-safety review) — first line of defense for any code not in this file's
// hand-picked tables (LITHO_COLORS/ALT_COLORS/etc): a curated, widely-cited colorblind-safe qualitative
// set (Okabe-Ito's 7 + Paul Tol's "muted" 9, overlap-checked by eye) assigned by FIRST-SEEN ORDER per
// distinct code within one namespace (litho/alt/vein/mineral/structure/medium kept separate so e.g. a
// litho code and an alteration code sharing a string don't fight over the same slot) — guaranteeing
// real perceptual separation for the first 16 distinct codes a project actually uses, which is every
// real single-project dataset seen in this app so far. Falls back to hashColor (hash-to-restricted-hue)
// only past that, since a literal unbounded set of possible site-specific codes has no way to reserve
// slots for in advance.
const CATEGORICAL_SAFE_COLORS = [
  "#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7",
  "#332288", "#117733", "#44AA99", "#88CCEE", "#DDCC77", "#CC6677", "#AA4499", "#882255", "#999933",
];
const categoricalColorCache = new Map(); // namespace -> Map(code -> color), persists for the app session
function categoricalSafeColor(namespace, key) {
  let cache = categoricalColorCache.get(namespace);
  if (!cache) { cache = new Map(); categoricalColorCache.set(namespace, cache); }
  const k = key === undefined || key === null || key === "" ? "unknown" : String(key).toLowerCase();
  if (cache.has(k)) return cache.get(k);
  const color = cache.size < CATEGORICAL_SAFE_COLORS.length ? CATEGORICAL_SAFE_COLORS[cache.size] : hashColor(k);
  cache.set(k, color);
  return color;
}

// TASKS.csv #249 (colorblind-safety review) — this palette skewed heavily brown/olive/dark-green,
// exactly the hue family that collapses under deuteranopia/protanopia. Three pairs nudged apart:
// m1 pushed toward a more distinctly warm brown (was olive-green, too close to v5); s6 pushed toward
// blue (was pale sage-green, too close to m4's pale tan — blue sits outside the red-green confusion
// axis so this is a more reliable separation than another green/brown shade would be); kom pushed
// toward teal (was a mid-green nearly matching flt's red at similar lightness).
export const LITHO_COLORS = {
  obn: "#8a7860", v1: "#c98a5a", silbx: "#d4522e", s5: "#6b7a8a", s4: "#8a8578",
  s7: "#332f2a", v5: "#6b8060", v6: "#33502f", i6: "#3d5a4c", m1: "#8a6a4a",
  m4: "#d8d0b8", s6: "#9bb8c2", flt: "#c0392b",
  kom: "#1f7a5a", "thol-fe": "#7a3d3d", "thol-mafic": "#3d5a4c", "ca-basalt": "#33502f",
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
export function colorForLithology(u) { const k = (u || "").toLowerCase(); return LITHO_COLORS[k] || categoricalSafeColor("litho", u); }

// TASKS.csv #241 — Matt's own synthetic-dataset request came bundled with a second, standing ask: a
// way to tell overburden and cross-cutting units (faults, dykes, breccias) apart from ordinary
// stratigraphic ones, since today every lithology code is treated identically by the Modeling tools
// (an implicit-surface run has no idea "OBN" isn't basement, or that "FLT" cuts across everything else
// rather than sitting in stratigraphic order with it). This is the per-unit classification that
// downstream code (ViewerModule's Stack/Implicit tools, gatherLithoSurfaceSpec's surface `type`) reads
// from — new codes not listed here default to "stratigraphic" rather than guessing wrong.
export const UNIT_ROLES = {
  obn: "overburden",
  flt: "fault",
  i6: "dyke",
  silbx: "breccia",
};
export function roleForLithology(u) { return UNIT_ROLES[(u || "").toLowerCase()] || "stratigraphic"; }
// Cross-cutting = doesn't belong in an ordered, non-crossing stratigraphic pile (see the Stack tool's
// own scope comment in ViewerModule.jsx) — faults, dykes, and breccia bodies all qualify.
export function isCrossCuttingRole(role) { return role === "fault" || role === "dyke" || role === "breccia"; }

// TASKS.csv #249 (colorblind-safety review) — CHL/PRO and SER/QSP were exact-duplicate hex values
// (not even a colorblind-specific issue — indistinguishable to anyone), and OX/KSP were a
// red-brown/dark-red pair that collapses under deuteranopia/protanopia. Nudged CHL toward a more
// saturated green and SER toward a warmer gold so both read distinctly at normal AND reduced
// red-green discrimination; OX kept but KSP shifted toward a cooler plum so the two no longer share
// the same reddish-brown hue family.
export const ALT_COLORS = { CARB: "#b8c4c8", KSP: "#7a4a72", MAG: "#4a4a4a", OX: "#b5622c", PRO: "#4a6b4a", QSP: "#d4b06a", SIL: "#e8e2d0", UNK: "#6a6a6a",
  SER: "#c79a4a", CHL: "#5a8f52", EPI: "#7a9e6a", FRESH: "#5a6472" };
export function colorForAlteration(a) { return ALT_COLORS[(a || "").toUpperCase()] || categoricalSafeColor("alt", a); }

// TASKS.csv #249 (colorblind-safety review) — QZ-CB was a pale green nearly identical to CARB
// (and close to QZ-CHL too); shifted to pale blue, outside the red-green confusion axis, so the two
// carbonate-bearing vein codes stay distinguishable under deuteranopia/protanopia.
export const VEIN_COLORS = { CARB: "#a8c4a0", PY: "#c9c93d", "QTZ-PY": "#d4c060", QZ: "#e8e2d0", "QZ-CB": "#7fb0c2", "QZ-CHL": "#7fae7a", "QZ-SUL": "#b08a5a" };
export function colorForVein(v) { return VEIN_COLORS[(v || "").toUpperCase()] || categoricalSafeColor("vein", v); }

export const MIN_COLORS = { ACA: "#c8c8d8", CPY: "#d4af37", GAL: "#6a6a78", PO: "#8a6a45", PY: "#d4c060", SPH: "#6a3a2a" };
export function colorForMineral(m) { return MIN_COLORS[(m || "").toUpperCase()] || categoricalSafeColor("mineral", m); }

export const STRUCT_COLORS = { ALT: "#c9863d", BD: "#4a7ab5", CON: "#8a6fae", FLT: "#c0392b", FOL: "#3a8a8a", FOLD: "#4aa06a", SHZ: "#a5407a", VN: "#cfc7b0" };
export function colorForStructure(t) { return STRUCT_COLORS[(t || "").toUpperCase()] || categoricalSafeColor("structure", t); }

// TASKS.csv #228 — surface geochemistry sample media, colored distinctly by sampling medium (a soil
// grid and a rock-chip traverse from the same property are visually different datasets, same as
// lithology/alteration get their own color set here) so mixed surface-sample imports read clearly in
// the 3D view and the legend, rather than falling back to one uniform color for everything.
export const MEDIUM_COLORS = { soil: "#8a6a45", "rock chip": "#c0392b", "stream sediment": "#4a7ab5", "talus fines": "#8a8578", other: "#6a6a6a" };
export function colorForMedium(m) { return MEDIUM_COLORS[(m || "").toLowerCase()] || categoricalSafeColor("medium", m); }

// TASKS.csv #249 (colorblind-safety review) — this was a literal red→orange→gold→green traffic-light
// ramp for RQD% (rock quality, a real geotechnical decision input), the single highest-priority
// finding in that review: red-green "bad→good" is exactly the transition deuteranopia/protanopia
// can't read. Replaced with a 5-stop viridis sample (dark purple=poor rock → bright yellow=good rock)
// — perceptually uniform and colorblind-safe by construction, same palette already offered elsewhere
// in the app (PALETTES.viridis) rather than inventing a second "safe" ramp with different stops.
export function rqdColor(pct) {
  if (pct == null || isNaN(pct)) return "#555";
  const stops = [[0, [68, 1, 84]], [25, [59, 82, 139]], [50, [33, 144, 140]], [75, [93, 200, 99]], [100, [253, 231, 37]]];
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

// TASKS.csv #249 (colorblind-safety review) — falls back to the colorblind-safe viridis ramp rather
// than the plain "default" blue-red one for any caller that doesn't ask for a specific named palette,
// so an unopinionated caller gets the safe choice without needing to know to ask for it. "default"
// itself is untouched and still selectable by name for anyone who explicitly wants it.
export function rampColorsHex(n) {
  return paletteColorsHex("viridis", n);
}

// User request: "Can we have some gradient colour pallets options for the voxels legends? Get some
// that are typically used in geophysics and name them with the suggested geophysical survey type use."
// Each entry is an ordered list of hex anchor colors sampled evenly across a model's value range —
// same multi-stop-lerp approach VoxelLegendEditor's Classify control already used for the 2-color
// default, just generalized to N anchor colors per palette instead of always exactly 2.
// TASKS.csv #249 (colorblind-safety review) — geosoft/rainbow/resistivity are all rainbow/jet-style
// ramps that sweep straight through the green-yellow-red band, the worst-case transition for
// deuteranopia/protanopia; kept (not removed) since they intentionally mirror conventions from
// Oasis montaj/EM/resistivity software a geophysicist may already expect, but labeled so the tradeoff
// is visible in the picker instead of silent.
export const PALETTES = {
  default:     { label: "Blue → Red (default)",            colors: ["#4669be", "#dc463c"] },
  geosoft:     { label: "Spectrum — magnetics / gravity (classic Oasis montaj default; not colorblind-safe)", colors: ["#1c1c8c", "#0050c8", "#00b4dc", "#28c878", "#c8e600", "#ffaa00", "#ff3200", "#c80028"] },
  // User request: "we need a colour palette that includes magenta" — Oasis montaj's default
  // chargeability/IP spectrum wraps the full hue wheel and ends in magenta/pink at the high end,
  // which none of the ramps above do (geosoft above tops out at dark red). Additive: the existing
  // geosoft ramp's anchors plus one magenta anchor appended, so nothing already using "geosoft" changes.
  spectrum:    { label: "Full spectrum — chargeability / IP (Geosoft-style, wraps into magenta; not colorblind-safe)", colors: ["#1c1c8c", "#0050c8", "#00b4dc", "#28c878", "#c8e600", "#ffaa00", "#ff3200", "#c80028", "#c8007a"] },
  rainbow:     { label: "Rainbow — magnetics / gravity / EM (not colorblind-safe)",  colors: ["#3b3bbe", "#1e90d2", "#28b4a0", "#5ac832", "#e6dc1e", "#f08c1e", "#e63c28"] },
  resistivity: { label: "Resistivity / IP (low→high resistivity; not colorblind-safe)", colors: ["#c83c28", "#f08c1e", "#e6dc1e", "#5ac832", "#28b4a0", "#1e90d2", "#3b3bbe"] },
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

// Standard-normal inverse CDF (probit), Acklam's rational approximation — good to ~1.15e-9.
// Used by classifyBreaks' "normal" method; no library dependency needed for this one function.
function probit(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p <= pHigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

// "Classify" — generate N breakpoints (each the LOWER bound of its class) from a value array, the
// same equal-interval/quantile options standard GIS packages offer for choropleth/raster symbology.
// User request: "I wanna have these options like geosoft [has], to better classify the voxel" —
// Oasis montaj's Colour Tool offers Linear/Log-Linear/Normal distribution/Histogram equalization as
// classification methods; "equal" below is Linear, "quantile" is already equal-count-per-bin (i.e.
// Histogram equalization), and "log"/"normal" are new to match the remaining two. Geosoft's "Custom"
// needs no method of its own — both callers already let a user hand-edit stops after classifying.
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
  } else if (method === "log" && min > 0) {
    // Geometric spacing — only meaningful for strictly positive data (chargeability/resistivity/IP
    // always are; log of zero or a negative value is undefined, so anything else falls through to
    // the plain equal-interval branch below instead of producing NaN breaks).
    const logMin = Math.log(min), logMax = Math.log(max);
    for (let i = 0; i < count; i++) breaks.push(Math.exp(logMin + (i / count) * (logMax - logMin)));
  } else if (method === "normal") {
    // Fit the data's own mean/stddev, space breaks evenly in cumulative-probability space, map back
    // to raw values via mean + z*std — concentrates more class boundaries near the mean, where real
    // survey data usually clusters, instead of spreading them uniformly like "equal" does.
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    const std = Math.sqrt(variance) || 1;
    for (let i = 0; i < count; i++) {
      const p = (i / count) * 0.9998 + 0.0001; // keep strictly inside (0,1) — probit(0)/(1) is +/-Infinity
      const z = probit(p);
      breaks.push(Math.min(max, Math.max(min, mean + z * std)));
    }
    breaks.sort((a, b) => a - b); // clamping can bunch extreme classes together; callers assume ascending order
  } else if (method === "jenks") {
    // TASKS.csv #291 (QGIS-specialist review) — true Fisher-Jenks natural breaks. The four methods
    // above were modelled on Oasis montaj's classification menu (see this function's own header
    // comment), which is why QGIS's single most-used choropleth method was missing: natural breaks
    // finds the class boundaries that MINIMIZE within-class variance, which is what you want for the
    // irregularly clustered data assay and geophysics values actually are (a background population
    // plus a long anomalous tail). Equal-interval puts nearly every sample in class 1 there, and
    // quantile splits the background into meaningless slices while lumping the whole anomaly together.
    breaks.push(...jenksBreaks(nums, count));
  } else {
    for (let i = 0; i < count; i++) breaks.push(min + (i / count) * (max - min));
  }
  return breaks;
}

// Fisher-Jenks is O(classes × n²) in both time and memory, which is fine for a few hundred samples and
// completely unusable at the scale this app actually classifies (a voxel/block model is routinely
// hundreds of thousands of cells; TASKS.csv's standing "performance is priority #1"). So the data is
// evenly SUBSAMPLED in sorted order first, with the budget solved from the class count rather than
// fixed: sample = sqrt(JENKS_BUDGET / classes), i.e. ~2000 samples for 5 classes down to ~560 for 64,
// keeping every run in the same tens-of-milliseconds range no matter how it's configured. Subsampling
// a SORTED array preserves the distribution's shape (it's a quantile sample), which is all the
// variance minimization actually reads — and the true min/max are always kept as the first/last
// samples so no class boundary can fall outside the real data range.
const JENKS_BUDGET = 2e7;
function jenksBreaks(sorted, nClasses) {
  const min = sorted[0], max = sorted[sorted.length - 1];
  if (max <= min) return new Array(nClasses).fill(min);
  const budget = Math.max(2, Math.floor(Math.sqrt(JENKS_BUDGET / nClasses)));
  let data = sorted;
  if (sorted.length > budget) {
    data = new Array(budget);
    for (let i = 0; i < budget; i++) data[i] = sorted[Math.round((i / (budget - 1)) * (sorted.length - 1))];
  }
  const n = data.length;
  if (n <= nClasses) return data.slice(0, nClasses).concat(new Array(Math.max(0, nClasses - n)).fill(max)).slice(0, nClasses);

  // Standard Fisher-Jenks dynamic program: limits[l][j] = index (1-based) where class j starts, for
  // the optimal j-class partition of the first l values; vars[l][j] = that partition's total
  // within-class variance. Flat typed arrays rather than nested JS arrays — same math, far less GC
  // pressure at the sizes above.
  const w = nClasses + 1;
  const limits = new Int32Array((n + 1) * w);
  const vars = new Float64Array((n + 1) * w);
  for (let i = 1; i <= nClasses; i++) {
    limits[1 * w + i] = 1;
    for (let j = 2; j <= n; j++) vars[j * w + i] = Infinity;
  }
  let variance = 0;
  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSq = 0, count = 0;
    variance = 0;
    for (let m = 1; m <= l; m++) {
      const lower = l - m + 1;
      const val = data[lower - 1];
      count++;
      sum += val; sumSq += val * val;
      variance = sumSq - (sum * sum) / count;
      const prev = lower - 1;
      if (prev !== 0) {
        for (let j = 2; j <= nClasses; j++) {
          const cand = variance + vars[prev * w + (j - 1)];
          if (vars[l * w + j] >= cand) { limits[l * w + j] = lower; vars[l * w + j] = cand; }
        }
      }
    }
    limits[l * w + 1] = 1;
    vars[l * w + 1] = variance;
  }

  // Walk the table back to the class boundaries. `out` is the LOWER bound of each class (out[0] is
  // always the data minimum), matching what every other branch of classifyBreaks returns.
  const out = new Array(nClasses);
  out[0] = data[0];
  let k = n;
  for (let j = nClasses; j > 1; j--) {
    const idx = limits[k * w + j];
    out[j - 1] = data[Math.max(0, idx - 1)];
    k = Math.max(1, idx - 1);
  }
  return out;
}

export const LAYER_META = {
  litho:    { label: "Lithology",      kind: "interval", radius: 2.2, opacity: 1,    colorFn: colorForLithology, nameFn: (u) => UNIT_NAMES[u] || u, numeric: false },
  alt:      { label: "Alteration",     kind: "interval", radius: 3.4, opacity: 0.4,  colorFn: colorForAlteration, numeric: false },
  vein:     { label: "Veins",          kind: "interval", radius: 1.0, opacity: 0.9,  colorFn: colorForVein, numeric: false },
  geotech:  { label: "Geotech (RQD%)", kind: "interval", radius: 4.6, opacity: 0.35, colorFn: null, numeric: true },
  // TASKS.csv #137 — Micromine-specialist audit finding: recovery% and SG are routinely logged as
  // intervals feeding tonnage/density calculations for resource estimates, alongside RQD/lithology —
  // same "interval" kind/rendering as geotech above, just a different numeric field.
  recovery: { label: "Recovery %", kind: "interval", radius: 4.2, opacity: 0.35, colorFn: null, numeric: true },
  sg:       { label: "Specific gravity", kind: "interval", radius: 3.8, opacity: 0.35, colorFn: null, numeric: true },
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
  recovery: { label: "Recovery % (numeric)", fields: intervalFields(["recovery_pct", "recovery", "rec_pct", "core_recovery", "value"], null, true) },
  sg: { label: "Specific gravity (numeric)", fields: intervalFields(["sg", "specific_gravity", "density", "value"], null, true) },
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
  if (has("recovery") || has("rec_pct")) return "recovery";
  // "sg"/"density" are common enough words to false-positive against other schemas' own columns
  // (e.g. a lithology "unit" description mentioning density in free text) — checked after every
  // other from/to-interval schema's own more specific keywords above, same "least specific last"
  // ordering as the vein/alteration "type"/"assemblage" disambiguation below.
  if (has("specific_gravity") || hasCol("sg") || has("density")) return "sg";
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

// TASKS.csv #283 (Micromine-specialist review) — collar import used to be a bare
// `new Map([...collars, ...rows].map(c => [c.hole_id, c]))`: last-write-wins keyed on hole_id, with
// no diff and no confirmation, both for duplicates WITHIN one file and for a hole_id that already
// existed in the project. The dangerous real-world case isn't the deliberate re-import of an updated
// surveyor list — it's grabbing an OLD collar file from the wrong folder, after which every matching
// hole silently takes on stale x/y/z/azimuth/dip and the previous values are simply gone. dataQC.js
// flags repeated hole_ids, but only as a generic warning that doesn't run on import and never says
// whether the COORDINATES actually changed.
//
// This is the pure diff the importer now runs first, so it can say exactly what would change (and ask)
// before anything is committed. Kept here in layers.js beside the other import helpers
// (guessColumn/guessTarget/TARGET_SCHEMAS) and free of any React/state so it can be unit-verified in
// plain Node.
const COLLAR_COMPARE_FIELDS = ["x", "y", "z", "azimuth", "dip", "length"];

// "Same value" for a collar field. Both missing counts as same (an import that simply doesn't carry
// an optional azimuth column must not read as "azimuth changed"), and numbers compare with a small
// tolerance so a re-export that round-trips 520000.5 through more decimal places isn't reported as an
// edit. NaN (an unparseable cell) is treated as missing for the same reason.
function sameCollarValue(a, b) {
  const ma = a == null || (typeof a === "number" && Number.isNaN(a));
  const mb = b == null || (typeof b === "number" && Number.isNaN(b));
  if (ma && mb) return true;
  if (ma || mb) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  return String(a) === String(b);
}

// existing/incoming: arrays of collar objects ({hole_id, x, y, z, azimuth?, dip?, length?}).
// Returns { newHoles, unchanged, changed:[{hole_id, fields, before, after, shift}], duplicatesInFile }
// where `shift` is the horizontal+vertical distance the collar would move (world units), which is the
// number that actually matters to a geologist looking at this prompt.
export function diffCollarImport(existing, incoming) {
  const byId = new Map((existing || []).map((c) => [c.hole_id, c]));
  const seen = new Set();
  const newHoles = [], unchanged = [], changed = [], duplicatesInFile = [];
  for (const r of incoming || []) {
    if (seen.has(r.hole_id)) duplicatesInFile.push(r.hole_id);
    seen.add(r.hole_id);
    const prev = byId.get(r.hole_id);
    if (!prev) { newHoles.push(r.hole_id); continue; }
    const fields = COLLAR_COMPARE_FIELDS.filter((k) => !sameCollarValue(prev[k], r[k]));
    if (!fields.length) { unchanged.push(r.hole_id); continue; }
    const d = (k) => (Number.isFinite(prev[k]) && Number.isFinite(r[k]) ? r[k] - prev[k] : 0);
    changed.push({
      hole_id: r.hole_id, fields,
      before: Object.fromEntries(fields.map((k) => [k, prev[k]])),
      after: Object.fromEntries(fields.map((k) => [k, r[k]])),
      shift: Math.hypot(d("x"), d("y"), d("z")),
    });
  }
  return { newHoles, unchanged, changed, duplicatesInFile };
}
