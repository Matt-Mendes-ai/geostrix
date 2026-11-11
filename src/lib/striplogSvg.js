// TASKS.csv #130 — Atlas (one Layout page per drillhole, QGIS-style batch report generation). Each
// generated hole page can embed a strip-log image, which needs to exist as a plain PNG data URL (the
// same shape every other Layout `image` element already uses) rather than a live mounted component —
// there's no way to "screenshot" React output for N holes in a batch pass without actually mounting
// and unmounting N off-screen StripLog instances, which is slow and fragile compared to just building
// the same kind of SVG directly as a string and rasterizing it once per hole.
//
// Deliberately a SEPARATE, smaller implementation from components/StripLog.jsx's interactive modal,
// not a shared extraction — StripLog.jsx is working, already-shipped code with its own JSX-based
// rendering (assay track, zoom slider, element picker); reusing it here would mean either mounting it
// off-screen per hole (slow, and it renders straight to the DOM) or refactoring its JSX into a second
// string-building code path, which risks the same "silent behavior change" the #238 design-system
// pass explicitly avoided when it found real per-file variance not worth force-unifying. This covers
// litho/alteration/vein/geotech — the always-available columns — and skips the assay track (which
// StripLog's interactive version needs a user-picked element for anyway, not meaningful to default
// per-hole in an unattended batch run).
import { LAYER_META, UNIT_NAMES, colorForAlteration, colorForVein, colorForBreccia, colorForStructZone, colorForWeathering, rqdColor } from "./layers.js"; // weathering: #2162
import { arrMax } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
import { FIGURE_FONT } from "./svgExport.js"; // TASKS.csv #1089
import { valueIn } from "./geochem.js"; // TASKS.csv #1480 — assay tracks, in each element's own unit
import { isBelowDetection } from "./assayFlags.js"; // TASKS.csv #2605
import { customCodeColour } from "./customColour.js"; // TASKS.csv #2477
import { lithoPatternMap, loadPatternTiles, patternDefs, patternFill } from "./lithoPatterns.js"; // TASKS.csv #1995 — FGDC lithology patterns

const TRACK_W = 90;
const DEPTH_COL_W = 50;
const PAD_TOP = 36;
const PAD_BOTTOM = 20;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// TASKS.csv #1080 — the in-block label is cut to 14 characters BEFORE escaping: cutting after it left "&a" of "&amp;",
// malformed XML the <img> rasterizer rejects ("Quartz vein & alteration")
function fillTrack(rows, x, sy, colorFn, nameFn, patternOf = null) { // patternOf: #1995 — an FGDC pattern over the colour
  return rows.map((r) => {
    const y0 = sy(r.from), y1 = sy(r.to);
    const h = Math.max(1, y1 - y0);
    const color = colorFn ? colorFn(r.value) : "#8a94a3";
    const label = nameFn ? nameFn(r.value) : r.value;
    const pat = patternOf ? patternOf(r.value) : null;
    return `<rect x="${x}" y="${y0}" width="${TRACK_W - 6}" height="${h}" fill="${color}" stroke="#ffffff" stroke-width="0.5"><title>${esc(label)} (${r.from}-${r.to} m)</title></rect>`
      + (pat ? `<rect x="${x}" y="${y0}" width="${TRACK_W - 6}" height="${h}" fill="${patternFill(pat, color)}" pointer-events="none"/>` : "") // white lines on a dark colour
      + (h > 12 ? `<text x="${x + 4}" y="${y0 + h / 2 + 3.5}" font-size="10" fill="#1a2028" stroke="#ffffff" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round">${esc(String(label).slice(0, 14))}</text>` : "");
  }).join("");
}
function tickTrack(rows, x, sy, colorFn) {
  return rows.map((r) => {
    const y = sy((r.from + r.to) / 2);
    const color = colorFn ? colorFn(r.value) : "#8a94a3";
    return `<line x1="${x}" y1="${y}" x2="${x + TRACK_W - 6}" y2="${y}" stroke="${color}" stroke-width="2.5"><title>${esc(r.value)} (${r.from}-${r.to} m)</title></line>`;
  }).join("");
}
// TASKS.csv #1480 (review #1352, Silvertip) — 'PAD34-003 with Zn' could not be built: an assay track per chosen element, the lab
// assays only (pXRF screening readings are not assays, #1695), bars on a log scale over this hole's own range, as the strip-log
// window draws them by default; the range is printed under the track
// TASKS.csv #2605 (review #2486) — in an atlas every hole had its own unlabelled axis (a barren 0.011-0.014 % hole drew bars as long as a
// 5.5 % one) and below-detection results were full bars ('log 0.00041-0.00041'): `range` ({ lo, hi }, the atlas's holes together) fixes
// the axis; a '<' result is a hollow tick at the left, not a bar, and never sets the range; all below detection is said under the track
export function assayTrackRange(rows, sym, unit, elementUnits) {
  let lo = Infinity, hi = -Infinity;
  for (const r of rows || []) { if (isBelowDetection(r, sym)) continue; const v = valueIn(r, sym, unit, elementUnits); if (v > 0 && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  return Number.isFinite(lo) ? { lo, hi } : null;
}
function assayTrack(rows, x, sy, sym, unit, elementUnits, bottom, range = null) {
  const vals = rows.map((r) => valueIn(r, sym, unit, elementUnits)).filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) return `<text x="${x + (TRACK_W - 6) / 2}" y="${bottom + 13}" font-size="8" text-anchor="middle" fill="#65717e">${esc(tr("no {sym} assays", { sym }))}</text>`;
  const own = assayTrackRange(rows, sym, unit, elementUnits);
  const ticks = rows.filter((r) => isBelowDetection(r, sym) && valueIn(r, sym, unit, elementUnits) != null).map((r) => `<rect x="${x + 2}" y="${sy(r.from)}" width="3" height="${Math.max(0.5, sy(r.to) - sy(r.from))}" fill="none" stroke="#8a95a3" stroke-width="0.6"><title>${r.from}-${r.to} m: ${esc(tr("below detection"))}</title></rect>`).join("");
  if (!own && !range) return ticks + `<text x="${x + (TRACK_W - 6) / 2}" y="${bottom + 13}" font-size="8" text-anchor="middle" fill="#65717e">${esc(tr("all below detection"))}</text>`;
  const { lo, hi } = range || own;
  const frac = (v) => (!(v > 0) ? 0 : hi > lo ? Math.max(0.03, Math.min(1, (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)))) : 1);
  return ticks + rows.map((r) => {
    const v = valueIn(r, sym, unit, elementUnits);
    if (v == null || !Number.isFinite(v) || isBelowDetection(r, sym)) return "";
    const w = frac(v) * (TRACK_W - 10);
    if (!(w > 0)) return "";
    return `<rect x="${x + 2}" y="${sy(r.from)}" width="${w}" height="${Math.max(0.5, sy(r.to) - sy(r.from))}" fill="#c9863d" opacity="0.85"><title>${r.from}-${r.to} m: ${esc(String(v))} ${esc(unit)}</title></rect>`;
  }).join("") + `<text x="${x + (TRACK_W - 6) / 2}" y="${bottom + 13}" font-size="8" text-anchor="middle" fill="#65717e">${esc(range ? tr("log {minPos}–{max}, all pages", { minPos: lo.toPrecision(2), max: hi.toPrecision(2) }) : tr("log {minPos}–{max}", { minPos: lo.toPrecision(2), max: hi.toPrecision(2) }))}</text>`;
}

function barTrack(rows, x, sy, max) {
  return rows.map((r) => {
    const y0 = sy(r.from), y1 = sy(r.to);
    const h = Math.max(1, y1 - y0);
    const v = Number(r.value);
    const w = Number.isFinite(v) ? Math.max(0, Math.min(1, v / max)) * (TRACK_W - 10) : 0;
    return `<rect x="${x}" y="${y0}" width="${w}" height="${h}" fill="${rqdColor(v)}"><title>${Number.isFinite(v) ? v.toFixed(0) : "?"} (${r.from}-${r.to} m)</title></rect>`;
  }).join("");
}

// Builds the strip-log SVG markup (a string, not a DOM element) for one hole. Returns null if the hole
// has no collar or no depth to show — same "nothing to draw" case StripLog.jsx's own maxDepth guard
// handles, just returned instead of rendered as an empty page.
// TASKS.csv #1092 (review #1016) — legendOverride: the viewer's legend edits ({ layerKey: { value: { color, label } } },
// the store's viewerUiState.legendOverride), so an Atlas strip log draws the colours and names the 3D legend and the
// map viewport on the same page use. #402 did this for the strip-log modal only.
// assays / assaySymbols / elementUnits (#1480): the project's assays and up to three elements to draw as tracks after the logs
// lithoPatterns (#1995): { byCode: { code: FGDC code | null }, tiles } — the lithology column drawn with its patterns
export function buildStripLogSvgMarkup({ holeId, collars, layers, legendOverride = null, assays = [], assaySymbols = [], elementUnits = {}, lithoPatterns = null, assayRanges = null, customTracks = [] }) { // customTracks: #2477 // assayRanges: #2605 — one axis per element for an atlas
  const ov = (key, v) => legendOverride?.[key]?.[v];
  const colorOf = (key, fallback) => (v) => ov(key, v)?.color || fallback(v);
  const nameOf = (key, fallback) => (v) => ov(key, v)?.label || (fallback ? fallback(v) : v);
  const collar = collars.find((c) => c.hole_id === holeId);
  const litho = (layers.litho || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const alt = (layers.alt || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const vein = (layers.vein || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const breccia = (layers.breccia || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from); // #608
  const structzone = (layers.structzone || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from); // #604
  const weath = (layers.weath || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from); // #2162
  const geotech = (layers.geotech || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from);
  const mnlgy = (layers.mnlgy || []).filter((r) => r.hole_id === holeId).sort((a, b) => a.from - b.from); // #684
  const syms = (assaySymbols || []).filter(Boolean).slice(0, 3); // #1480
  const holeAssays = syms.length ? (assays || []).filter((a) => a.hole_id === holeId && a.source !== "pXRF" && Number.isFinite(a.from) && Number.isFinite(a.to)).sort((a, b) => a.from - b.from) : [];
  const maxDepth = Math.max(collar?.length || 0, arrMax(litho.map((r) => r.to)), arrMax(alt.map((r) => r.to)), arrMax(vein.map((r) => r.to)), arrMax(breccia.map((r) => r.to)), arrMax(structzone.map((r) => r.to)), arrMax(weath.map((r) => r.to)), arrMax(geotech.map((r) => r.to)), arrMax(mnlgy.map((r) => r.to)), 0, arrMax(holeAssays.map((a) => a.to))); // holeAssays: #1480
  if (maxDepth <= 0) return null;

  const pxPerMeter = Math.max(1, Math.min(8, 900 / maxDepth));
  const sy = (d) => PAD_TOP + d * pxPerMeter;
  const H = sy(maxDepth) + PAD_BOTTOM;
  const tracks = [
    { label: "Litho", rows: litho, kind: "fill", colorFn: colorOf("litho", LAYER_META.litho.colorFn), nameFn: nameOf("litho", (v) => UNIT_NAMES[v] || v) },
    { label: "Alt.", rows: alt, kind: "fill", colorFn: colorOf("alt", colorForAlteration), nameFn: nameOf("alt") },
    { label: "Vein", rows: vein, kind: "tick", colorFn: colorOf("vein", colorForVein) },
    { label: "Bx", rows: breccia, kind: "fill", colorFn: colorOf("breccia", colorForBreccia), nameFn: nameOf("breccia") }, // #608
    ...(structzone.length ? [{ label: "SZ", rows: structzone, kind: "fill", colorFn: colorOf("structzone", colorForStructZone), nameFn: nameOf("structzone") }] : []), // #604
    ...(weath.length ? [{ label: "Wx", rows: weath, kind: "fill", colorFn: colorOf("weath", colorForWeathering), nameFn: nameOf("weath") }] : []), // #2162
    { label: "Min.", rows: mnlgy, kind: "fill", colorFn: colorOf("mnlgy", LAYER_META.mnlgy.colorFn), nameFn: nameOf("mnlgy") }, // #684 — intervals as blocks, from = to as a line
    { label: "RQD%", rows: geotech, kind: "bar", max: 100 },
  ].filter((t) => t.rows.length);
  // #1480 — the chosen assay elements, always drawn (a hole with none says so under its track, so every page has the same columns)
  syms.forEach((sym) => tracks.push({ label: `${sym} (${elementUnits[sym] || "ppm"})`, rows: holeAssays, kind: "assay", sym, unit: elementUnits[sym] || "ppm" }));
  // TASKS.csv #2477 (review #2325) — custom-layer tracks (a stratigraphic unit, a gamma log) as the strip-log window's '+ track' gives them:
  // [{ layer, numeric, max }] — a category as coloured blocks (the 3D view's colours, #2476), a numeric log as bars over `max` (the atlas's
  // holes together, so every page has the same scale)
  for (const ct of customTracks || []) {
    const rows = (ct.layer?.rows || []).filter((r) => r.hole_id === holeId && Number.isFinite(Number(r.from)) && Number.isFinite(Number(r.to)) && r.value != null && r.value !== "").map((r) => ({ ...r, from: Number(r.from), to: Number(r.to), value: ct.numeric ? Number(r.value) : r.value })).sort((a, b) => a.from - b.from);
    const label = `${ct.layer.name}${ct.layer.unit ? ` (${ct.layer.unit})` : ""}`;
    if (ct.numeric) tracks.push({ label, rows: rows.filter((r) => Number.isFinite(r.value)), kind: "bar", max: ct.max > 0 ? ct.max : Math.max(1e-9, ...rows.map((r) => r.value).filter(Number.isFinite)) });
    else tracks.push({ label, rows, kind: "fill", colorFn: (v) => customCodeColour(ct.layer, "value", v), nameFn: null });
  }
  if (!tracks.length) return null;
  const W = DEPTH_COL_W + tracks.length * TRACK_W + 10;

  let body = "";
  // Depth gridlines/labels every ~10 rendered pixels' worth of meters, same idea StripLog uses.
  const depthStep = Math.max(5, Math.ceil(maxDepth / 20 / 5) * 5);
  for (let d = 0; d <= maxDepth; d += depthStep) {
    const y = sy(d);
    body += `<line x1="${DEPTH_COL_W}" y1="${y}" x2="${W - 6}" y2="${y}" stroke="#e6e8eb" stroke-width="1"/>`;
    body += `<text x="4" y="${y + 3}" font-size="9" fill="#5a6472">${d}</text>`;
  }
  let x = DEPTH_COL_W;
  tracks.forEach((t) => {
    body += `<text x="${x + 2}" y="16" font-size="10" font-weight="600" fill="#1a2028">${esc(t.label)}</text>`;
    body += `<rect x="${x}" y="${PAD_TOP - 2}" width="${TRACK_W - 6}" height="${sy(maxDepth) - PAD_TOP + 2}" fill="none" stroke="#c7ccd3" stroke-width="1"/>`;
    if (t.kind === "fill") body += fillTrack(t.rows, x, sy, t.colorFn, t.nameFn, t.label === "Litho" && lithoPatterns ? (v) => (lithoPatterns.tiles[lithoPatterns.byCode[v]] ? lithoPatterns.byCode[v] : null) : null);
    else if (t.kind === "tick") body += tickTrack(t.rows, x, sy, t.colorFn);
    else if (t.kind === "bar") body += barTrack(t.rows, x, sy, t.max);
    else if (t.kind === "assay") body += assayTrack(t.rows, x, sy, t.sym, t.unit, elementUnits, sy(maxDepth), assayRanges?.[t.sym] || null); // #1480; assayRanges: #2605
    x += TRACK_W;
  });

  const title = `${esc(holeId)}${collar ? ` — ${maxDepth.toFixed(0)} m` : ""}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 20}" width="${W}" height="${H + 20}" font-family="${FIGURE_FONT.replace(/"/g, "&quot;")}">` // #1089
    + `<rect x="0" y="0" width="${W}" height="${H + 20}" fill="#ffffff"/>`
    + (lithoPatterns ? `<defs>${patternDefs(lithoPatterns.tiles)}</defs>` : "") // #1995
    + `<text x="4" y="20" font-size="12" font-weight="700" fill="#1a2028">${title}</text>`
    + `<g transform="translate(0,20)">${body}</g>`
    + `</svg>`;
  return { svg, width: W, height: H + 20, pxPerMeter }; // pxPerMeter: #1480, Layout's depth scale
}

// Rasterizes buildStripLogSvgMarkup's output into a PNG data URL, the same SVG->canvas->PNG technique
// StripLog.jsx's own exportPNG button already uses. Returns null if the hole had nothing to draw.
export async function buildStripLogDataUrl({ holeId, collars, layers, legendOverride = null, assays = [], assaySymbols = [], elementUnits = {}, lithoPatterns = false, assayRanges = null, customTracks = [] }) { // lithoPatterns: #1995; assayRanges: #2605
  let pats = null;
  if (lithoPatterns && (layers.litho || []).length) { // #1995 — the project's codes (the same pattern on every page), then this hole's tiles
    const byCode = lithoPatternMap(layers.litho, (v) => legendOverride?.litho?.[v]?.label || UNIT_NAMES[v] || v, legendOverride?.litho);
    const here = [...new Set((layers.litho || []).filter((r) => r.hole_id === holeId).map((r) => byCode[r.value]).filter((c) => c != null))];
    pats = { byCode, tiles: await loadPatternTiles(here) };
  }
  const built = buildStripLogSvgMarkup({ holeId, collars, layers, legendOverride, assays, assaySymbols, elementUnits, lithoPatterns: pats, assayRanges, customTracks }); // legendOverride: #1092; assays: #1480
  if (!built) return null;
  const { svg, width, height, pxPerMeter } = built;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(tr("Couldn't rasterize the strip log for \"{holeId}\".", { holeId })));
      el.src = url;
    });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), aspect: width / height, height, depthHeightAtCaptureM: height / pxPerMeter }; // height: #1478, for the printed text size; depth: #1480
  } finally {
    URL.revokeObjectURL(url);
  }
}
