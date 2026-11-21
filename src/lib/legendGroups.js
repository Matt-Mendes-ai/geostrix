// TASKS.csv #725 — the legend groups of a view, shared by the 3D figure overlay (#381, ViewerModule) and the Layout
// legend element (LayoutModule "Load from view"), so a printed legend lists exactly what the 3D view draws:
// categorical layers (minus hidden categories / holes, with the user's label and colour overrides), assay grade
// classes, and block models (classes as swatches, continuous models as a ramp from lib/legendScale.js).
// Pure: callers pass their state (live viewer state, or a saved theme).
import { SYMBOLS, FAMILIES, familyFor, projectSymbolChoices, symbolSvg, typeKey } from "./structureSymbols.js"; // TASKS.csv #3066
import { lineScaleOf } from "./structureSymbols.js"; // TASKS.csv #3091
import { fieldRamp, fieldRampLegend } from "./customColour.js"; // TASKS.csv #3941
import { widthScale, widthLegendGroup } from "./widthBy.js"; // TASKS.csv #3942
import { LAYER_META, CATEGORICAL_SAFE_COLORS, colorForMedium } from "./layers.js";
import { STRUCTURE_CLASS_COLORS, STRUCTURE_CLASS_LABELS } from "./mapLayers.js"; // TASKS.csv #1437
import { legendScale } from "./legendScale.js";
import { t as tr } from "./i18n.js"; // TASKS.csv #3719 (g) — the unsampled group's two words follow the language
import { displayUnitOf, toDisplay } from "./displayUnits.js"; // TASKS.csv #3236
import { gradeUnitLabel } from "./geochemColumns.js"; // TASKS.csv #2218; #3159: geochemColumns, not geochem.js (the whole geochem library in startup)
import { rasterUnitOf } from "./rasterMethod.js"; // TASKS.csv #2747
import { idwColourFields } from "./idwColour.js"; // TASKS.csv #2845; #3159: not idw.js, which put the IDW gridding in startup
import { makeSurveyColorer, surveyKey } from "./geophysSurveys.js"; // TASKS.csv #2878; surveyKey: #3447
import { airDilutedFloor, voxelStretch } from "./voxelStretch.js"; // TASKS.csv #1872; voxelStretch: #3765
import { fmtSig3 } from "./numberFormat.js"; // TASKS.csv #3382
import { fieldColourer } from "./fieldColours.js"; // TASKS.csv #3553
import { plainLith } from "./lithText.js"; // TASKS.csv #3936: a Macrostrat unit's lithology block in words

// the per-element identity hues of assay markers (moved from ViewerModule; TASKS.csv #306)
export const ASSAY_ELEMENT_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 11, 14, 15, 8, 10, 13].map((i) => CATEGORICAL_SAFE_COLORS[i]);
// TASKS.csv #3879 (Matt, v0.1.123: 'a lot of the elements have the same colour by default, specially the one I use the most') — an element's identity hue is its POSITION IN THE
// PROJECT'S ELEMENT LIST (the chips'), not its place in the pick order: the hue followed the number of elements switched on at the moment it was first switched on (the first
// one on: always amber), and the classes seeded from it were saved, so after switching elements on one at a time every one of them held the same amber ramp. Here the same
// element is the same colour whatever else is on, in the chips, the tubes, the legend, the sections, the estimate's blocks and the exports. A symbol not in the list
// takes a stable hash of its name.
export function assayHueIndex(symbol, assayElements) {
  const i = (assayElements || []).findIndex((e) => e?.symbol === symbol);
  if (i >= 0) return i;
  let h = 0;
  for (const ch of String(symbol)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % ASSAY_ELEMENT_COLORS.length;
}
export const assayHue = (symbol, assayElements) => ASSAY_ELEMENT_COLORS[assayHueIndex(symbol, assayElements) % ASSAY_ELEMENT_COLORS.length];
// With style.breaks set, colour comes from the first break whose `max` the value is <= (QGIS graduated
// convention); a value above every break gets the last break's colour. Otherwise the element's hue.
export function assayColorFor(value, idx, style) {
  if (style?.breaks?.length) {
    const sorted = style.breaks; // stored pre-sorted by max — see AssayStyleModal
    const hit = sorted.find((b) => value <= b.max);
    return (hit || sorted[sorted.length - 1]).color;
  }
  return style?.color || ASSAY_ELEMENT_COLORS[idx % ASSAY_ELEMENT_COLORS.length];
}

// the categorical layers a legend lists, in order (ViewerModule's CATEGORY_LAYER_KEYS)
export const LEGEND_CATEGORY_KEYS = ["litho", "alt", "vein", "breccia", "weath" /* #2162 */, "structzone", "litho_gc", "alt_gc", "mnlgy", "structure"];

// TASKS.csv #3396 — under 0.001 in short scientific notation ('1.2e-5'): a mag susc class read '0.000010 – 0.000012', the zeros counted by eye
// TASKS.csv #3382 — and everything else at three significant figures with thousands separators, as the drill plan's key ('460.0-6590 ppm'
// read '460 – 6,590 ppm' there): lib/numberFormat fmtSig3
export const fmtLegendValue = (v) => fmtSig3(v);

// keys: the categorical layer keys, in order. hidden[key]: a Set or array of hidden values. singleColor[key]: a one-
// colour layer style (#635). labelFor / colorFor(key, value): with the user's overrides applied.
// placed (TASKS.csv #1867 / #1813): the hole ids that have a collar; intervals of any other hole draw nothing and are left out (null = all)
const isFiltered = (h) => (h instanceof Set ? h.size > 0 : Array.isArray(h) ? h.length > 0 : false);
export function categoryLegendGroups({ keys, layers, layerVisible, hidden = {}, visibleHoles = {}, singleColor = {}, labelFor, colorFor, placed = null, styles = {} }) {
  const groups = [];
  keys.forEach((key) => {
    if (!layerVisible?.[key]) return;
    const rows = layers?.[key] || [];
    if (!rows.length) return;
    if (singleColor[key]) { groups.push({ key, label: LAYER_META[key].label, items: [["all (one colour)", singleColor[key]]] }); return; }
    // TASKS.csv #3941 — coloured by a number field (Total sulphides): its ramp
    const byField = styles?.[key]?.colourBy ? fieldRamp(rows, styles[key].colourBy, styles[key]) : null;
    if (byField) { groups.push(fieldRampLegend(key, `${LAYER_META[key].label} · ${styles[key].colourBy}`, byField.scale)); const ws0 = styles[key].widthBy ? widthScale(rows, styles[key]) : null; if (ws0) groups.push(widthLegendGroup(key, LAYER_META[key].label, ws0)); return; } // ws0: #3942
    const h = hidden[key];
    const isHidden = h instanceof Set ? (v) => h.has(v) : Array.isArray(h) ? ((s) => (v) => s.has(v))(new Set(h)) : () => false;
    const seen = new Map(); // value -> its row in `items` (#1633: and how many intervals carry it)
    const items = [], counts = [], lo = [], hi = [], ranged = key === "mnlgy"; // #3332 — each mineral's values (Total min, or the logged %)
    for (const row of rows) {
      const v = row.value;
      if (v == null || v === "") continue;
      const k = String(v);
      if (isHidden(k)) continue;
      if (row.hole_id && visibleHoles[row.hole_id] === false) continue;
      if (placed && !placed.has(String(row.hole_id))) continue; // #1867 — no collar: nowhere on the sheet
      const x = ranged && row.extra != null && row.extra !== "" ? Number(row.extra) : NaN;
      if (seen.has(k)) { const i = seen.get(k); counts[i]++; if (Number.isFinite(x)) { if (!(x >= lo[i])) lo[i] = x; if (!(x <= hi[i])) hi[i] = x; } continue; }
      seen.set(k, items.length);
      items.push([labelFor(key, v), colorFor(key, v)]); counts.push(1); lo.push(Number.isFinite(x) ? x : undefined); hi.push(Number.isFinite(x) ? x : undefined);
    }
    if (ranged) items.forEach((it, i) => { if (lo[i] !== undefined) it.push({ value: lo[i] === hi[i] ? fmtLegendValue(lo[i]) : `${fmtLegendValue(lo[i])}–${fmtLegendValue(hi[i])}` }); });
    const order = items.map((_, i) => i).sort((a, b) => String(items[a][0]).localeCompare(String(items[b][0])));
    if (items.length) groups.push({ key, label: LAYER_META[key].label, items: order.map((i) => items[i]), counts: order.map((i) => counts[i]), ...(isFiltered(h) ? { filtered: true } : {}) }); // filtered: #2044
    const ws = styles?.[key]?.widthBy ? widthScale(rows, styles[key]) : null; // TASKS.csv #3942 — Width by: its three sizes
    if (ws) groups.push(widthLegendGroup(key, LAYER_META[key].label, ws));
  });
  return groups;
}

// TASKS.csv #3305 (#3260, Galore: Cu classes '460-6590 / 6590-16600 ppm') — a ppm element whose values run into the thousands (more than
// 10 % of its samples over 1,000 ppm: its P90) reads in per cent in the legend. One pass over the samples, kept per samples array.
const PCT_CACHE = new WeakMap();
export function ppmAsPercent(assays, sym, unit) {
  if (String(unit || "").toLowerCase() !== "ppm" || !Array.isArray(assays)) return false;
  let per = PCT_CACHE.get(assays);
  if (!per) PCT_CACHE.set(assays, (per = new Map()));
  if (per.has(sym)) return per.get(sym);
  let n = 0, big = 0;
  for (const a of assays) { const v = a?.values?.[sym]; if (typeof v === "number" && Number.isFinite(v)) { n++; if (v > 1000) big++; } }
  const r = n > 0 && big > n * 0.1;
  per.set(sym, r);
  return r;
}

// Assay grade classes are discrete swatches (one per class, with its range); an element with no classes gets one swatch
// saying size shows grade.
export function assayLegendGroups({ assays, assayElements, assayVisible, assayDisplayElements = [], assayStyle = {}, displayUnits = null, withNote = false }) { // withNote: #3588 (2) // displayUnits: TASKS.csv #3236 - project.displayUnits
  if (!assayVisible || !assayDisplayElements.length || !(assays || []).length) return [];
  const unitOf = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
  const groups = assayDisplayElements.map((sym, idx) => {
    const style = assayStyle[sym];
    // TASKS.csv #3236 - the unit the project shows this element in (displayUnits), the classes' limits converted; else #3305's % for a ppm element of percent-sized grades
    const shown = displayUnitOf({ displayUnits }, sym, unitOf[sym]), chosen = !!unitOf[sym] && shown !== unitOf[sym];
    const pct = !chosen && ppmAsPercent(assays, sym, unitOf[sym]); // #3305
    const unit = chosen ? shown : pct ? "%" : unitOf[sym] ? gradeUnitLabel(sym, unitOf[sym]) /* #3586 — g/t for Au / Ag / Pt / Pd stored in ppm, in every tool */ : "", fmt = chosen ? (v) => fmtLegendValue(toDisplay(v, unitOf[sym], shown)) : pct ? (v) => fmtLegendValue(v / 1e4) : fmtLegendValue;
    const items = style?.breaks?.length
      ? style.breaks.map((b, i) => {
        const lo = i ? style.breaks[i - 1].max : null;
        const last = i === style.breaks.length - 1;
        return [lo == null ? `≤ ${fmt(b.max)} ${unit}` : last ? `> ${fmt(lo)} ${unit}` : `${fmt(lo)}–${fmt(b.max)} ${unit}`, b.color];
      })
      : [[`${sym} (size = grade)`, assayColorFor(0, assayHueIndex(sym, assayElements), style)]]; // #3056; #3879 — the element's own hue, not its place among those shown — not "sphere": assays can be drawn along the hole (#2932)
    if (style?.minCutoff != null && Number.isFinite(style.minCutoff)) items.push([`below ${fmt(style.minCutoff)} ${unit} hidden`, "transparent"]);
    return { key: `assay_${sym}`, label: `${sym} (${unit})`, items, grade: !!style?.breaks?.length, alwaysHead: true }; // grade: #1534 — classes low to high; alwaysHead: #2370, a one-element key named
  });
  // TASKS.csv #3588 (2) (Fireweed rehearsal) — a blank interval and an unsampled hole are a bare grey trace and nothing said so. Its own group (one swatch), after the
  // elements' and never one of their classes, so the class logic (#1534 / #3306: grade groups read low to high and are cut to their ends) is untouched.
  if (withNote && groups.some((g) => g.grade)) groups.push({ key: "assay_unsampled", translated: true /* #3725 */, label: tr("Not sampled"), items: [[tr("bare trace: no sample here"), "#9aa0a6"]], alwaysHead: true });
  return groups;
}

// A model's own stops: classes as swatches, a continuous model as a ramp (log or linear, #498 / #522)
export function scaleLegendGroup(key, label, model, lo, hi) {
  const L = legendScale(model, lo, hi, fmtLegendValue);
  return L.kind === "classes" ? { key, label, items: L.items, grade: true /* #1714 — low to high: a cut keeps the top */ } : { key, label, items: [], ramp: L };
}
// TASKS.csv #1236 — a raster whose value range is known, as its ramp
// pictureNote (TASKS.csv #2860, the Layout legend): a visible picture raster (no values, no colour bar, no units) as its name and this note
export function rasterLegendGroups(rasters, { pictureNote = null } = {}) {
  const groups = [];
  for (let r of rasters || []) {
    if (r.visible === false) continue;
    // TASKS.csv #2747 (side session 6) — a value raster's ramp says what its values are (rasterUnitOf, #1858's 'Values are'): '… (nT)'
    const u = rasterUnitOf(r), named = u && !String(r.name).includes(`(${u})`) ? `${r.name} (${u})` : r.name;
    // TASKS.csv #2845 — an IDW grid saved before it was given colour fields: its stretch (drawn in viridis) is the ramp
    if (!r.colourStops && r.grid && r.stretch && !r.colourStyle) r = { ...r, ...idwColourFields(r.stretch) };
    if (r.colourStops?.length > 1 && r.colourRange) groups.push(scaleLegendGroup(`raster_${r.id}`, r.colourStyle?.stretch === "equalise" ? `${named} (equalized)` : named, { colorMode: "continuous", stops: r.colourStops }, r.colourRange[0], r.colourRange[1]));
    // TASKS.csv #2011 — a Macrostrat geology drape: its map units as swatches, youngest first (as the legend under the layer lists them);
    // the age is added when the name does not already say it; a unit Macrostrat gives no colour is grey, as the tiles draw it
    // #2747 — a picture raster (colours, no values) with the colour bar attached to it (RasterPictureLegend: legendImage) shows that bar
    else if (r.legendImage?.dataUrl) groups.push({ key: `raster_${r.id}`, label: r.name, items: [], image: { src: r.legendImage.dataUrl } });
    else if (r.legend?.units?.length) {
      const o = { kind: "fill", ...(Number.isFinite(r.opacity) && r.opacity < 1 ? { opacity: r.opacity } : {}) };
      groups.push({ key: `raster_${r.id}`, label: r.name, items: r.legend.units.map((u) => [u.age && u.age !== "Age Unknown" && !u.name.toLowerCase().includes(u.age.toLowerCase()) ? `${u.name} (${u.age})` : u.name, u.color || "#777777", o]) });
    } else if (pictureNote && r.dataUrl && !r.grid) groups.push({ key: `raster_${r.id}`, label: r.name, items: [[pictureNote, null, { note: true }]], alwaysHead: true }); // #2860
  }
  return groups;
}
// TASKS.csv #3765 (Scottie Gold review: 'Model_Fine_Chg (chg) ≤ 0.442 … ≥ 63.6', no property, no unit, the ends the 2nd and 98th percentiles unsaid)
// — the legend line says what the values are: the property when the name does not, the unit or 'unit not stated' (an imported model that gives
// none; one GeoStrix made states its own), and its ramp's clipped ends say which percentile they are (P2, P98: the colours are stretched over the 2nd to 98th)
const MADE_HERE = /^(estimate|support-index)-|^geoml$|^kriging-variance$|^calc$/;
export function voxelLegendLabel(m, base, u) {
  const named = u && !base.includes(`(${u})`) && !base.includes(` ${u} `) ? `${base} (${u})` : base;
  const noUnit = !u && !m.params?.unit && !MADE_HERE.test(String(m.source || "")) ? ` · ${tr("unit not stated")}` : "";
  return named + noUnit;
}
export function voxelLegendGroups(voxelModels) {
  const groups = [];
  (voxelModels || []).forEach((m) => {
    if (m.visible === false || !Number.isFinite(m.min) || !Number.isFinite(m.max)) return;
    const lo = airDilutedFloor(m, Number.isFinite(m.threshold) ? Math.max(m.min, m.threshold) : m.min); // #1872 — not the air-diluted blocks
    const hi = Number.isFinite(m.rangeMax) ? Math.min(m.max, m.rangeMax) : m.max;
    // TASKS.csv #356 — a model of named classes (e.g. the implicit model's units) gets swatches, not a numeric ramp.
    if (m.valueLabels && m.stops?.length) { groups.push({ key: `voxel_${m.id}`, label: m.name, items: m.stops.filter((st) => st.value >= lo && st.value <= hi).map((st) => [m.valueLabels[st.value] ?? String(st.value), st.color]) }); return; }
    const base = m.property && !m.name.includes(m.property) ? `${m.name} — ${m.property}` : m.name;
    // TASKS.csv #2218 — the unit too ('Au estimate (idw2, 10m, r50m) (g/t)'): the legend gave the range with none
    const u = m.params?.unit ? (m.params?.element ? gradeUnitLabel(m.params.element, m.params.unit) : m.params.unit) : null;
    const g = scaleLegendGroup(`voxel_${m.id}`, voxelLegendLabel(m, base, u), m, lo, hi); // #711 — say what the values are
    if (g.ramp && voxelStretch(m)) g.ramp = { ...g.ramp, ...(/^≤ /.test(g.ramp.minLabel) ? { minLabel: `${g.ramp.minLabel} (P2)` } : {}), ...(/^≥ /.test(g.ramp.maxLabel) ? { maxLabel: `${g.ramp.maxLabel} (P98)` } : {}) }; // #3765 — the clipped ends are the 2nd and 98th percentiles
    groups.push(g);
  });
  return groups;
}

// TASKS.csv #948 — the Surface Geology map in a legend: its map layers (each unit of the layer's categorical style, or
// its one colour), the surface samples (anomaly classes, else one colour, else by medium, as the 3D view colours them)
// and the boundaries. Each row carries { kind: "fill" | "line" | "point" } so a legend draws a polygon unit as a square,
// a contact or fault as a line stub and a structure point or sample as a dot (a colour square alone could not tell
// them apart).
const KIND_OF = { polygon: "fill", polyline: "line", point: "point" };
export function mapLayerLegendGroups(mapLayers) {
  const groups = [];
  (mapLayers || []).forEach((l, i) => {
    if (l.visible === false || !(l.features || []).length) return;
    const kind = KIND_OF[l.geomType] || "fill";
    // TASKS.csv #1122 (review #1016) — the opacity the layer is draped at (sceneBuilders: l.opacity ?? 0.6), so a swatch
    // is not stronger than the unit it describes on a geology map over imagery; 1 is left out (rows unchanged)
    const op = Number.isFinite(l.opacity) ? l.opacity : kind === "fill" ? 0.6 : 1;
    const o = op < 1 ? { kind, opacity: op } : { kind };
    // TASKS.csv #1157 — an interpretation layer carries every line type as a category: only the ones drawn are in the legend
    const graduated = !!l.styleBreaks?.length; // TASKS.csv #1600 - classes of a numeric field: empty ones left out, the highest kept when rows run short
    const cats = l.styleField ? (l.categories || []).filter((c) => c.visible !== false && !((l.interpretation || graduated) && !c.count)) : [];
    // TASKS.csv #2134 — a layer with one class in all (the IP lines' RL 1200) is keyed by its name: '1200' meant nothing on a figure.
    // Several bare-number classes say the attribute ('RL 1200'). allCategories: the layer's own list when a frame narrowed it.
    // TASKS.csv #3851 (2) - only a BARE NUMBER is keyed by the layer's name: a single named unit ('Andesite' of a drawn geology layer, 'Fault' of an interpretation layer) keeps its own name
    const one = !graduated && cats.length === 1 && (l.allCategories || l.categories || []).length === 1 && /^-?\d+(\.\d+)?$/.test(String(cats[0].label ?? cats[0].value ?? ""));
    const numeric = !graduated && cats.length > 1 && cats.every((c) => c.label == null && c.value != null && /^-?\d+(\.\d+)?$/.test(String(c.value)));
    const items = one ? [[l.name || "map layer", cats[0].color, o]]
      : cats.length
      ? cats.map((c) => [plainLith(c.label ?? (c.value == null ? "(no value)" : numeric ? `${l.styleField} ${c.value}` : String(c.value))), c.color, o]) /* plainLith: #3936 */
      : [[l.name || "map layer", l.color || "#e2a63c", o]];
    // TASKS.csv #3393 (#3378) — a graduated layer's heading names the field and its unit ('Subcrop — cover_m, m'): classes of a bare number said nothing on a figure
    const unit = graduated && l.styleField ? (/_m$/.test(l.styleField) ? ", m" : "") : "";
    groups.push({ key: `map_${l.id ?? i}`, label: graduated && cats.length && l.styleField ? `${l.name || "Map layer"} — ${l.styleField}${unit}` : l.name || "Map layer", items, ...(graduated && cats.length ? { grade: true } : {}) });
  });
  return groups;
}
// TASKS.csv #3762 (Scottie Gold review: four DXF isosurfaces drawn in one grey, none in the legend) — the shown imported surfaces, one row each in the
// colour it is drawn in (hexOf(id): the mesh's material colour, which the style editor changes) at the opacity they are drawn at
export function importedSurfaceLegendGroups(surfaces, hexOf = null) {
  const items = (surfaces || []).filter((s) => s?.type === "imported" && s.visible !== false).map((s) => [String(s.name || "surface").replace(/ \(imported\)$/, ""), (hexOf && hexOf(s.id)) || "#8fa3b8", { kind: "fill", opacity: 0.45 }]);
  return items.length ? [{ key: "imported_surfaces", translated: true /* #3725 */, label: tr("Imported surfaces"), items }] : [];
}
export function boundaryLegendGroups(boundaries) {
  const items = (boundaries || []).filter((b) => b.visible !== false).map((b) => [b.name || "boundary", b.color || "#e2a63c", { kind: "line" }]);
  return items.length ? [{ key: "boundaries", label: "Boundaries", items }] : [];
}
// samples: the drawn surface samples (with .medium); style: the layer's one-colour style, if any; anomalyGroup: the
// anomaly map's group (anomalyLegendGroup) when it colours them
// TASKS.csv #1437 (review #1352, Silvertip) — the outcrop structure sets had no legend entry: one row per class drawn (the disc
// colours of sceneBuilders), in the class order, over the visible sets
// TASKS.csv #3066 — one row per structure TYPE (the data's own words), with its USGS (FGDC) symbol (opt.svg, the inclined form) in the class
// colour, in the class order; a type with no words is its class
export function outcropLegendGroup({ surfaceStructures = [], visible = true, symbolByType = null /* #3094 */ } = {}) {
  if (!visible) return null;
  const choices = projectSymbolChoices(surfaceStructures, symbolByType), types = new Map();
  for (const s of surfaceStructures || []) { if (s?.visible === false) continue; for (const r of s.rows || []) { const cls = r.cls || "other", k = typeKey(r.type || cls); if (!types.has(k)) types.set(k, { label: String(r.type || "").trim() || STRUCTURE_CLASS_LABELS[cls] || cls, type: r.type || cls, cls, lineScale: lineScaleOf(s) /* #3091 — the first set's */ }); } }
  if (!types.size) return null;
  const order = Object.keys(STRUCTURE_CLASS_COLORS);
  const rank = (c) => { const i = order.indexOf(c); return i < 0 ? order.length : i; }; // a class the colours do not know goes last
  const items = [...types.values()].sort((a, b) => rank(a.cls) - rank(b.cls) || a.label.localeCompare(b.label)).map((t) => {
    const color = STRUCTURE_CLASS_COLORS[t.cls] || STRUCTURE_CLASS_COLORS.other, sym = SYMBOLS[FAMILIES[familyFor(t.type, t.cls, choices)].inclined];
    return [t.label, color, { kind: "point", svg: symbolSvg(sym, { px: 18, color, lineScale: t.lineScale }), fgdc: sym.fgdc }];
  });
  return { key: "outcrop_structures", label: "Outcrop structures", items };
}

export function surfaceSampleLegendGroup({ samples, visible = true, style = null, anomalyGroup = null }) {
  if (!visible || !(samples || []).length) return null;
  if (anomalyGroup) return { ...anomalyGroup, items: anomalyGroup.items.map(([l, c]) => [l, c, { kind: "point" }]) };
  if (style?.color) return { key: "surface_samples", label: "Surface samples", items: [["all samples", style.color, { kind: "point" }]] };
  const media = [...new Set(samples.map((r) => r.medium || ""))].sort((a, b) => a.localeCompare(b));
  return { key: "surface_samples", label: "Surface samples", items: media.map((m) => [m || "(no medium)", colorForMedium(m), { kind: "point" }]) };
}

// TASKS.csv #725 — groups as Layout legend rows: [label, colour] swatches as before, plus a group heading row
// [label, null, { heading: true }] when more than one group is shown, and a ramp row [label, null, { ramp }]. A row's
// own options ({ kind }, #948) are kept.
// TASKS.csv #1633 (review #1497, Lawyers) — 'Load from view' made a 4,857-row legend (59,081 px tall) because the Mineralization log
// held free-text descriptions. A group longer than perGroup keeps its most frequent entries (by interval count, when the group
// has counts; else its first), in their usual order, and ends with a note row saying how many were left out (moreLabel(n)).
export function capLegendGroups(groups, perGroup = 12, moreLabel = (n) => `+ ${n} more`) {
  return groups.map((g) => {
    // TASKS.csv #3396 — a numeric model's classes (grade: a block model's, a classified log's, a graduated map layer's) are a scale, not codes:
    // twelve of 60 mag susc classes and '+ 48 more codes, not listed' read as a key. The legend's box decides how many rows show (#3395).
    if (g.ramp || g.grade || !g.items || g.items.length <= perGroup) return g;
    const idx = g.items.map((_, i) => i);
    const keep = new Set(g.counts ? idx.sort((a, b) => g.counts[b] - g.counts[a] || a - b).slice(0, perGroup) : idx.slice(0, perGroup));
    const items = g.items.filter((_, i) => keep.has(i));
    return { ...g, items: [...items, [moreLabel(g.items.length - items.length), null, { note: true }]], counts: undefined };
  });
}

export function legendGroupsToItems(groups) {
  const multi = groups.length > 1;
  const items = [];
  groups.forEach((g) => {
    if (g.ramp) { items.push([g.label, null, { ramp: { colors: g.ramp.colors, minLabel: g.ramp.minLabel, maxLabel: g.ramp.maxLabel, log: !!g.ramp.log, ...(g.unit ? { unit: g.unit } : {}) /* TASKS.csv #3529 */ } }]); return; }
    if (g.image) { items.push([g.label, null, { image: g.image.src }]); return; } // #2747 — a picture raster's colour bar
    if (multi || g.alwaysHead) items.push([g.label, null, { heading: true }]); // TASKS.csv #843 — the anomaly map's rule is always printed
    g.items.forEach(([label, color, opt]) => items.push(opt ? [label, color, opt] : [label, color]));
  });
  return items;
}

// a legend swatch's shape for a row's kind (#948): { width, height, borderRadius, ... } for a square, a dot or a line stub
export function swatchShape(kind, size) {
  if (kind === "line") return { width: size + 6, height: 3, borderRadius: 1 };
  if (kind === "point") return { width: size - 3, height: size - 3, borderRadius: "50%" };
  return { width: size, height: size };
}

// TASKS.csv #1224 — whole groups, up to a legend that fits on a page, and always the first. items: legendGroupsToItems' rows, a group starting at its { heading } row.
export function firstLegendGroups(items, maxRows = 32) {
  const starts = items.map((it, i) => (it[2]?.heading ? i : -1)).filter((i) => i >= 0);
  if (items.length <= maxRows || !starts.length) return items;
  let end = starts[1] ?? items.length;
  for (let k = 1; k < starts.length; k++) {
    const next = starts[k + 1] ?? items.length;
    if (next > maxRows) break;
    end = next;
  }
  return items.slice(0, end);
}

// TASKS.csv #1482 (review #1352) — a new Layout legend kept the first groups that fit, Lithology and Alteration, beside a map of rock
// chips and streams with no entry for them. Groups are ranked by what a plan shows on top: surface samples and assay grades first,
// interval logs after, the rest in between. items: legend rows, groups starting with a heading row. -> rows, same groups, reordered
export function rankLegendGroups(items) {
  const groups = [];
  for (const it of items || []) {
    if (it?.[2]?.heading || !groups.length) groups.push([]);
    groups[groups.length - 1].push(it);
  }
  const rank = (g) => {
    const h = String(g[0]?.[2]?.heading ? g[0][0] : "");
    if (/surface sample|rock chip|soil|stream|\((%|ppm|ppb|g\/t|oz\/t)\)/i.test(h)) return 0;
    if (/litholog|alteration|vein|breccia|structural zone/i.test(h)) return 2;
    return 1;
  };
  // TASKS.csv #2307 (review #2174) — with no samples or grades on the page, the logs that colour every hole (lithology, alteration ...) come
  // before the small layers: a drill plan's legend kept Mineralization (126 intervals) and Structure planes (24 picks) and left Lithology
  // (11,678) to 'Load from view'. With samples or grades, #1482's order holds (they are the figure; a long log is the one left out).
  const ranked = groups.map((g, i) => ({ g, i, r: rank(g) }));
  const logsFirst = !ranked.some((x) => x.r === 0);
  return ranked.map((x) => (logsFirst && x.r ? { ...x, r: 3 - x.r } : x)).sort((a, b) => a.r - b.r || a.i - b.i).flatMap((x) => x.g);
}
export const legendGroupCount = (items) => (items || []).filter((it) => it?.[2]?.heading).length;

// TASKS.csv #1398 (review #1352, Silvertip) — the RQD, recovery and mag susc tubes wrap every hole (radius 4.2-4.6 m, outside the
// logs) and colour it, but had no key. A ramp per visible numeric hole layer, sampled from the colour function the 3D view draws
// it with (colorOf(key, value, range): numericLayerColor), over the range it uses: 0-100 for RQD and recovery, the visible rows'
// own min-max for SG and mag susc. -> legend groups with a ramp, as legendScale draws them.
// symbology (TASKS.csv #1699, review #1645): a layer classified in its quick panel (numericSymbology[key].stops) gets its classes as
// swatches with their break values ('0.391 – 0.797', '≥ 0.797'), or its own continuous stops as the ramp; Copley's mag susc classified
// by quantile still showed a -0.845 to 310 min-max ramp that was 99 % one colour.
// TASKS.csv #3529 — a layer with a unit carries it as `unit` on its group (the 3D view's legend heading says 'Specific gravity (t/m³)'); the label stays the layer's name,
// which the section ribbons and the Layout legend match by
const layerLegendLabel = (key) => LAYER_META[key]?.label || key;
const layerUnit = (key) => (LAYER_META[key]?.unit ? { unit: LAYER_META[key].unit } : {});
export function numericLayerLegendGroups({ keys = ["geotech", "recovery", "sg", "magsusc"], layers = {}, layerVisible = {}, isRowVisible = () => true, colorOf, symbology = {}, clips = {}, fieldColours = true }) { // clips: #1699
  const out = [];
  for (const key of keys) {
    if (!layerVisible[key] || !(layers[key] || []).length || !colorOf) continue;
    // TASKS.csv #3553 — coloured by a kept text column (the density's method): its shown values, with their colours and counts, as the 3D view
    // draws them (fieldColours: false where the drawing colours by the value: the section ribbons)
    const fc = fieldColours && symbology?.[key]?.byField?.field ? fieldColourer(symbology[key], layers[key]) : null;
    if (fc) {
      out.push({ key: `numeric_${key}`, label: layerLegendLabel(key), ...layerUnit(key), byField: true /* #3704 */, items: fc.values.filter((v) => !v.hidden).map((v) => [`${fc.field}: ${v.value || "(blank)"} (${v.n.toLocaleString("en-US")})`, v.colour]) });
      continue;
    }
    let lo = 0, hi = 100;
    if (key !== "geotech" && key !== "recovery") {
      lo = Infinity; hi = -Infinity;
      for (const r of layers[key]) { const v = r.value; if (typeof v === "number" && Number.isFinite(v) && isRowVisible(key, r)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
      if (!(hi > lo)) continue;
    }
    const fmt = (v) => String(+Number(v).toPrecision(3));
    const sym = symbology?.[key];
    if (sym?.stops?.length) { // #1699 — the breaks to 3 significant figures (0.163, not 0.16: a quantile break is read as typed)
      const L = legendScale({ stops: sym.stops, colorMode: sym.colorMode }, lo, hi, fmt), label = layerLegendLabel(key);
      out.push(L.kind === "classes" ? { key: `numeric_${key}`, label, ...layerUnit(key), items: L.items, grade: true } : { key: `numeric_${key}`, label, ...layerUnit(key), items: [], ramp: L });
      continue;
    }
    // TASKS.csv #1699 — the default ramp spans the 2nd-98th percentile (lib/numericClip.js); the ends say the rest is clamped there
    const c = clips?.[key], clipped = c && !sym?.fullRange && key !== "geotech" && key !== "recovery";
    const a = clipped ? c.lo : lo, b = clipped ? c.hi : hi;
    const colors = Array.from({ length: 17 }, (_, i) => colorOf(key, a + (i / 16) * (b - a), { min: lo, max: hi }));
    out.push({ key: `numeric_${key}`, label: layerLegendLabel(key), ...layerUnit(key), items: [], ramp: { kind: "ramp", log: false, min: a, max: b, minLabel: clipped && c.lo > c.min ? `≤ ${fmt(a)}` : fmt(a), maxLabel: clipped && c.hi < c.max ? `≥ ${fmt(b)}` : fmt(b), colors, ticks: [] } });
  }
  return out;
}

// TASKS.csv #1398 — the 3D legend's rows shared out between its groups: one row per group in turn until `max` are given, so a long
// group (lithology) cannot push the others out and short groups (#381: grade classes) still show in full; groups in their own
// order (lithology first). -> { rows: [{ label, color, kind, opacity, group, head }], shown, total }
// TASKS.csv #3398 (Matt: 'make the legend in the 3d view always collapsable'; Orion_2026, a 60-class MagSusc voxel group filling the
// legend) — a folded group keeps only its heading, one row that says how many it holds; folded: the group keys the user folded
export function foldLegendGroups(groups, folded) {
  const f = new Set(folded || []);
  if (!f.size) return groups || [];
  return (groups || []).map((g) => (f.has(g.key) && g.items?.length ? { ...g, items: [[String(g.items.length), null, { folded: true }]], counts: undefined, grade: false, alwaysHead: true } : g));
}
export function allocateLegendRows(groups, max) {
  const gs = (groups || []).filter((g) => g.items?.length);
  const quota = gs.map(() => 0);
  let left = max, moved = true;
  // TASKS.csv #2039 (review #2013, Woodjam) — a grade group (3-8 classes) is shown whole first, while the grade groups fit in half the rows:
  // shared out one row at a time among ~12 groups, Cu kept only '> 8020 ppm' while its Low / Medium classes coloured nearly every marker
  let gradeRows = 0;
  gs.forEach((g, i) => { const n = g.items.length; if (g.grade && n <= 8 && gradeRows + n <= Math.floor(max / 2)) { quota[i] = n; left -= n; gradeRows += n; } });
  // TASKS.csv #2044 — a layer whose categories were filtered is the one the figure is about: its list whole next, while it fits in half the rows
  gs.forEach((g, i) => { const n = g.items.length; if (g.filtered && !quota[i] && gradeRows + n <= Math.floor(max / 2)) { quota[i] = n; left -= n; gradeRows += n; } });
  while (left > 0 && moved) {
    moved = false;
    for (let i = 0; i < gs.length && left > 0; i++) if (quota[i] < gs[i].items.length) { quota[i]++; left--; moved = true; }
  }
  // TASKS.csv #1534 (reviews #1497 Lawyers, #1645 Copley) — a group cut short kept its FIRST rows: the lowest grade classes (the ore-grade
  // class was the one dropped) and the alphabetically first categories (Cong, Felsic Dyke, not the main host). A grade group keeps its
  // highest classes, a category group with counts its most frequent entries, each in its usual order.
  const pick = (g, n) => {
    if (n >= g.items.length) return g.items;
    if (g.grade) return n >= 2 ? [g.items[0], ...g.items.slice(g.items.length - n + 1)] : g.items.slice(-1); // #3306 — the lowest class kept too: the range's both ends
    if (g.counts) { const keep = new Set(g.items.map((_, i) => i).sort((a, b) => g.counts[b] - g.counts[a] || a - b).slice(0, n)); return g.items.filter((_, i) => keep.has(i)); }
    return g.items.slice(0, n);
  };
  const multi = gs.filter((_, i) => quota[i] > 0).length > 1, rows = [];
  gs.forEach((g, i) => pick(g, quota[i]).forEach(([label, color, opt], k) => rows.push({ label, color, kind: opt?.kind, opacity: opt?.opacity, svg: opt?.svg /* #3066 */, value: opt?.value /* #3332 */, folded: opt?.folded /* #3398 */, gkey: g.key, group: g.label, ...(g.translated ? { gtr: true } : {}) /* #3725 — the label is already in the interface language */, head: (multi || g.alwaysHead) && k === 0,
    ...(k === 0 && g.grade && quota[i] < g.items.length ? { classesShown: [quota[i], g.items.length] } : {}) }))); // #2039 — a cut grade group says so
  // TASKS.csv #3775 (8) — the rows left out, by name: '+ 7 more not shown' dropped the LMP code and the single-hole zones without saying which
  const omitted = gs.flatMap((g, i) => { const kept = new Set(pick(g, quota[i])); return g.items.filter((it) => !kept.has(it)).map((it) => String(it[0])); });
  return { rows, shown: rows.length, total: gs.reduce((n, g) => n + g.items.length, 0), omitted };
}

// TASKS.csv #2878 (split from #2845) — a point survey drawn in the view (stations coloured by value): one ramp per survey when several are
// loaded (each is coloured on its own range, #451), only the drawn points (no elevation: not drawn, #2075). The 3D legend built these inline;
// the Layout legend had none. rows: layers.geophys_pts; stops / colorMode / min / max: the store's geophysPts* colour settings.
export function geophysLegendGroups({ rows = [], visible = true, surveys = {}, stops, colorMode, min, max, label = "Geophysics points" } = {}) {
  if (!visible) return [];
  const pts = (rows || []).filter((r) => Number.isFinite(r.z) && typeof r.value === "number" && Number.isFinite(r.value));
  if (!pts.length) return [];
  const colorer = makeSurveyColorer(pts, { stops, colorMode, min, max }, surveys);
  const out = [];
  for (const [key, model] of colorer.models) {
    if (surveys?.[key]?.hidden) continue; // TASKS.csv #3325 — a survey hidden from its card has no ramp (the others keep the colours they are drawn in)
    const units = surveys?.[key]?.units && surveys[key].unitsGuessed ? `${surveys[key].units}, ${tr("assumed from the column name")}` : surveys?.[key]?.units; // #3739
    if (surveys?.[key]?.positionsOnly) { // TASKS.csv #3447 — no measured value: one swatch in the one colour it is drawn in, no ramp
      const sample = pts.find((r) => surveyKey(r) === key);
      out.push({ key: `geophys_pts_${key}`, label: key, items: [[`${key} (${rows.filter((r) => surveyKey(r) === key).length.toLocaleString("en-US")})`, colorer.colorOf(sample)?.color || colorer.colorOf(sample), { kind: "point" }]] });
      continue;
    }
    out.push(scaleLegendGroup(`geophys_pts_${key}`, (colorer.perSurvey || colorer.models.size === 1) /* TASKS.csv #3815 (4) — one survey loaded: its own name, not 'Geophysics points' */ ? `${key}${units ? ` (${units})` : ""}` : `${label}${units ? ` (${units})` : ""}`, model, model.min, model.max));
  }
  return out;
}
