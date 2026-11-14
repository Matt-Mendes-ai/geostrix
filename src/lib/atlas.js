// TASKS.csv #130 — "Layout is strong (multi-page, templates, viewports) but has no 'one page per
// drillhole/section' batch-generation (QGIS Atlas), which exploration reporting workflows use for
// standardized per-hole or per-section report pages."
//
// Scope: text substitution ({{token}} placeholders in any text/title element, filled per hole/section)
// plus an optional auto-generated strip-log image per hole (src/lib/striplogSvg.js). Generating the pages
// copies the template's Viewport elements unchanged (one capture needs a live 3D render); since TASKS.csv
// #1644 a top-down true-scale map is then marked with its hole (markHoleOnViewports) and, by default,
// re-captured centred on it at the template's scale, one page at a time, by store.jsx requestViewportBatch
// (atlasRecaptureItems below lists the captures). Section pages and oblique maps keep the template's capture.
import { buildStripLogDataUrl } from "./striplogSvg.js";
import { utmGridReady, metresPerPagePx } from "./layoutGeometry.js"; // TASKS.csv #1644
import { DIAGRAM_W, DIAGRAM_H } from "./northDiagram.js"; // TASKS.csv #2478
import { elementBox } from "./layoutPlace.js"; // TASKS.csv #3233

// TASKS.csv #1644 (review #1497, Lawyers) — each hole marked on the template's map. The viewport is still the template's one capture
// (see above), so a page used to show the district plan with nothing saying where its hole was (21AGBDD001 800 m off centre,
// unmarked). A top-down, true-scale viewport now carries markHole: the page draws a ring and the id at the collar, or says the
// hole is outside the map.
export function markHoleOnViewports(elements, collar) {
  if (!collar || !Number.isFinite(collar.x) || !Number.isFinite(collar.y)) return elements;
  return elements.map((el) => (el.type === "viewport" && utmGridReady(el) ? { ...el, markHole: { id: String(collar.hole_id), x: collar.x, y: collar.y } } : el));
}

// TASKS.csv #1644 — each page's map re-captured centred on its hole at the template's scale (store.jsx requestViewportBatch): one
// request per marked top-down viewport, at the scale the template printed (its fixed scale, else what its capture measured), the
// frame's own size (a strip log may have narrowed it: the map keeps its scale and shows less ground), the template's theme, or
// for a theme-less capture the view it was taken with (its camera). pages: the generated pages; pageIds: their ids, in order.
export function atlasRecaptureItems(pages, pageIds) {
  const items = [];
  pages.forEach((pg, i) => {
    for (const el of pg.elements || []) {
      if (el.type !== "viewport" || !el.markHole) continue;
      const mpp = metresPerPagePx(el);
      const scale = el.capturedFixedScale > 0 ? el.capturedFixedScale : el.fixedScale > 0 ? el.fixedScale : mpp ? Math.round(mpp / (0.0254 / 96)) : null;
      if (!scale || !pageIds[i]) continue;
      items.push({ dpi: 200 /* #2303 — a page capture */, pageId: pageIds[i], elementId: el.id, themeId: el.themeId || null, viewState: el.themeId ? null : el.viewState || null, fixedScale: scale, elementW: el.w, elementH: el.h, centreWorld: { x: el.markHole.x, y: el.markHole.y } });
    }
  });
  return items;
}

// Tokens available to each atlas mode — shown in the UI so the user knows what to type into a text
// element before generating, rather than discovering it by trial and error.
export const HOLE_TOKENS = ["hole_id", "x", "y", "z", "azimuth", "dip", "length", "lithology_summary"];
export const SECTION_TOKENS = ["name", "azimuth", "corridor", "length"];
// TASKS.csv #1777 (review #1645) — one placeholder syntax on a page: the page's own {project} / {scale} and the atlas's tokens are both
// written in single braces; the older {{hole_id}} keeps working. True when `text` holds one of `tokens` in either form.
export const hasAtlasTokens = (text, tokens) => typeof text === "string" && tokens.some((t) => text.includes(`{${t}}`));

function fmt(n, d = 1) { return Number.isFinite(n) ? n.toFixed(d) : "?"; }

export function holeAtlasValues(holeId, collars, layers) {
  const c = collars.find((cc) => cc.hole_id === holeId);
  const litho = (layers.litho || []).filter((r) => r.hole_id === holeId && !isNaN(r.from)).sort((a, b) => a.from - b.from);
  // A compact "0-12 OBN, 12-55 V1, ..." summary rather than dumping every field — the point is a
  // reader can tell what this hole intersected at a glance on a report page, not a full data table
  // (a real interval table is a bigger, separate feature — see this row's own TASKS.csv notes).
  const lithology_summary = litho.length
    ? litho.map((r) => `${fmt(r.from, 0)}-${fmt(r.to, 0)}m ${r.value}`).join(", ")
    : "No lithology logged";
  return {
    hole_id: holeId,
    x: c ? fmt(c.x, 1) : "?", y: c ? fmt(c.y, 1) : "?", z: c ? fmt(c.z, 1) : "?",
    azimuth: c && c.azimuth != null ? fmt(c.azimuth, 0) : "?",
    dip: c && Number.isFinite(c.dip) ? fmt(-c.dip, 0) : "?", // TASKS.csv #1033 — stored positive-down; shown negative = down, as imported
    length: c && c.length != null ? fmt(c.length, 0) : "?",
    lithology_summary,
  };
}

export function sectionAtlasValues(section) {
  const dx = (section.bx ?? 0) - (section.ax ?? 0), dy = (section.by ?? 0) - (section.ay ?? 0);
  const length = Math.sqrt(dx * dx + dy * dy);
  return {
    name: section.name || "Section",
    azimuth: section.azimuth != null ? fmt(section.azimuth, 0) : "?",
    corridor: section.corridor != null ? fmt(section.corridor, 0) : "?",
    length: fmt(length, 0),
  };
}

// Replaces every {{token}} in `text` with values[token] — an UNKNOWN token (typo, or a hole-mode
// token used on a section page) is left as literal "{{token}}" text rather than silently blanked, so a
// mistake is visible on the generated page instead of quietly disappearing.
// #1777 — {hole_id} is filled as {{hole_id}} is; a single-brace word that is not an atlas token ({project}, {scale}: the page's own
// placeholders, filled when the page is drawn) is left for the page.
export function substituteTokens(text, values) {
  if (typeof text !== "string") return text;
  const has = (k) => Object.prototype.hasOwnProperty.call(values, k);
  return text.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (m, k2, k1) => { const key = k2 || k1; return has(key) ? values[key] : m; });
}

function substituteElement(el, values) {
  const next = { ...el };
  if (typeof next.text === "string") next.text = substituteTokens(next.text, values);
  return next;
}

// Builds one atlas page's `elements` array from the template, substituting tokens in every text/title
// element and — for hole mode, when requested — appending a freshly generated strip-log image element
// positioned just below the lowest existing element (a reasonable default the user can drag afterward,
// same "land it somewhere sensible, let the user adjust" approach the rest of Layout's own element-add
// tools already use, e.g. addLogo/addImage's staggered placement).
// TASKS.csv #1478 (review #1352) — the strip log went below the lowest template element (y 780 on a 794 px page: a 14 px sliver
// printed). It now takes the full page height inside the margins (at most 40 % of the width) on the side whose column covers less
// of the template's elements. page: { w, h } in page px; elements: [{ x, y, w, h }]. -> { x, y, w, h }
// TASKS.csv #3233 (split from #2674) — the column was taken even when the template left a free area the log fits in, and the template was
// then narrowed around it (#1772). The log now takes the template's largest free area (freeStripLogBox) when it is at least FREE_SHARE as
// tall there as in the column; below that, the column and #1772's room-making, as before. -> { x, y, w, h, free (true: nothing moved) }
export const FREE_SHARE = 0.6; // a layout choice: in the free area the log's text prints at 60 % of the column's size or more
export function placeStripLog(elements, aspect, page = { w: 1123, h: 794 }, margin = 40) {
  let h = page.h - 2 * margin, w = h * aspect;
  if (w > page.w * 0.4) { w = page.w * 0.4; h = w / aspect; }
  const free = freeStripLogBox(elements, aspect, page, margin);
  if (free && free.h >= FREE_SHARE * h - 1e-9) return { ...free, free: true };
  const overlap = (x) => elements.reduce((s, el) => {
    const ex = el.x || 0, ey = el.y || 0, ew = el.w || 100, eh = el.h || 40;
    const ox = Math.max(0, Math.min(x + w, ex + ew) - Math.max(x, ex)), oy = Math.max(0, Math.min(margin + h, ey + eh) - Math.max(margin, ey));
    return s + ox * oy;
  }, 0);
  const right = page.w - margin - w, left = margin;
  return { x: overlap(right) <= overlap(left) ? right : left, y: margin, w, h, free: false };
}

// TASKS.csv #3233 — the tallest log of this aspect (width / height) that fits on the page inside the margins without touching a template
// element (kept `gap` px clear of each), at most 40 % of the page width as in the column; on a tie the one further right and higher.
// Each band between a top edge (the margin or an element's bottom) and a bottom edge (the margin or an element's top) is split into the
// x-gaps the elements crossing it leave. -> { x, y, w, h } or null
export function freeStripLogBox(elements, aspect, page = { w: 1123, h: 794 }, margin = 40, gap = 12) {
  if (!(aspect > 0)) return null;
  const boxes = (elements || []).map(elementBox).filter((b) => b.w > 0 && b.h > 0);
  const top = margin, bottom = page.h - margin, left = margin, right = page.w - margin;
  const tops = [top, ...boxes.map((b) => b.y + b.h + gap)].filter((y) => y >= top && y < bottom);
  const bottoms = [bottom, ...boxes.map((b) => b.y - gap)].filter((y) => y > top && y <= bottom);
  let best = null;
  for (const y0 of tops) for (const y1 of bottoms) {
    const H = y1 - y0;
    if (H <= 0 || (best && H < best.h)) continue;
    const cross = boxes.filter((b) => b.y < y1 + gap && b.y + b.h > y0 - gap).map((b) => [b.x - gap, b.x + b.w + gap]).sort((a, b) => a[0] - b[0]);
    let x = left;
    const gaps = [];
    for (const [a, b] of cross) { if (a > x) gaps.push([x, Math.min(a, right)]); x = Math.max(x, b); if (x >= right) break; }
    if (x < right) gaps.push([x, right]);
    for (const [g0, g1] of gaps) {
      const Wd = g1 - g0;
      if (Wd <= 0) continue;
      const h = Math.min(H, Wd / aspect, (page.w * 0.4) / aspect), w = h * aspect;
      const c = { x: g1 - w, y: y0, w, h };
      if (!best || h > best.h + 1e-9 || (Math.abs(h - best.h) <= 1e-9 && (c.x > best.x + 1e-9 || (Math.abs(c.x - best.x) <= 1e-9 && c.y < best.y)))) best = c;
    }
  }
  return best;
}
// TASKS.csv #1772 (review #1645, Copley) — the strip log's column still covered a wide template map (the 1:5,000 viewport ran to
// x 1011 of 1123 px, the log started at 959). Each template element it covers is narrowed to end `gap` px before it (or, on the
// left, to start after it) when at least `minKeep` of its width remains; a viewport keeps its scale and shows less ground. One that
// cannot keep that much (a north arrow or a scale bar near the map's edge) moves aside whole when it fits on the page. Elements that
// can do neither are left as they are and counted. -> { elements, narrowed (narrowed or moved), overlapping }
// A north arrow draws at a fixed size whatever its saved width (LayoutModule: 54 x 70 px, 170 x 124 with the declination diagram):
// it is moved, never narrowed, to whichever side of the log has room, nearer first.
const fixedSize = (el) => (el.type === "north" ? (el.decl ? [DIAGRAM_W, DIAGRAM_H] : [54, 70]) : null); // DIAGRAM_*: #2478 (four caption lines)
export function makeRoomForStripLog(elements, box, { gap = 12, minKeep = 0.4, pageW = 1123 } = {}) {
  let narrowed = 0, overlapping = 0;
  const out = elements.map((el) => {
    const fixed = fixedSize(el);
    const ex = el.x || 0, ey = el.y || 0, ew = fixed ? fixed[0] : el.w || 100, eh = fixed ? fixed[1] : el.h || 40;
    const ox = Math.min(box.x + box.w, ex + ew) - Math.max(box.x, ex), oy = Math.min(box.y + box.h, ey + eh) - Math.max(box.y, ey);
    if (!(ox > 0.5 && oy > 0.5)) return el;
    const onRight = box.x + box.w / 2 > ex + ew / 2;
    const w = onRight ? box.x - gap - ex : ex + ew - (box.x + box.w + gap);
    if (fixed || !(w >= minKeep * ew)) {
      const fits = [box.x - gap - ew, box.x + box.w + gap].filter((x) => x >= 0 && x + ew <= pageW).sort((a, b) => Math.abs(a - ex) - Math.abs(b - ex));
      if (fits.length) { narrowed++; return { ...el, x: fits[0] }; }
      overlapping++; return el;
    }
    narrowed++;
    return onRight ? { ...el, w } : { ...el, x: box.x + box.w + gap, w };
  });
  return { elements: out, narrowed, overlapping };
}

// the size its 9.5 px drawing text prints at, in points (96 px per inch, 72 pt per inch), once the drawing is scaled to `h`
export const stripLogTextPt = (drawingHeight, h) => (drawingHeight > 0 ? (9.5 * (h / drawingHeight) * 72) / 96 : null);

// a strip log placed on a page (Add to Layout from the strip-log window, or an atlas page's): an image labelled 'Strip log …'
export const isStripLogImage = (el) => el?.type === "image" && /^strip log\b/i.test(String(el.label || "").trim());
// TASKS.csv #2136 — a collar with no depth has no trace: its page would show a point and an empty log
export const tracedCollar = (c) => Number(c?.length) > 0;
async function buildOneHolePage(holeId, templateElements, { collars, layers, includeStripLog, legendOverride, page, assayTracks = null, lithoPatterns = false }) { // assayTracks: #1480; lithoPatterns: #1995
  const values = holeAtlasValues(holeId, collars, layers);
  // TASKS.csv #2136 (review #2013) — the template's own strip log (another hole's, 'Strip log — TF24-126') was copied onto every page beside
  // the page's own: with strip logs on, the template's are left out
  const fromTemplate = includeStripLog ? templateElements.filter((el) => !isStripLogImage(el)) : templateElements;
  let elements = markHoleOnViewports(fromTemplate.map((el) => substituteElement(el, values)), collars.find((c) => c.hole_id === holeId)); // #1644
  let stripLogFailed = false, textPt = null, narrowed = 0, overlapping = 0;
  if (includeStripLog) {
    // TASKS.csv #1080 — one hole's strip log failing (a rasterize error) no longer aborts the whole atlas: its page is
    // added without the image and counted in the result notice
    let built = null;
    try { built = await buildStripLogDataUrl({ holeId, collars, layers, legendOverride, lithoPatterns, ...(assayTracks || {}) }); } catch { stripLogFailed = true; } // legendOverride: #1092; assayTracks { assays, assaySymbols, elementUnits }: #1480
    if (built) {
      const { free, ...box } = placeStripLog(elements, built.aspect, page || undefined);
      textPt = stripLogTextPt(built.height, box.h);
      if (!free) ({ elements, narrowed, overlapping } = makeRoomForStripLog(elements, box, { pageW: (page || {}).w || 1123 })); // #1772; free: #3233 — nothing to move
      elements = [...elements, { id: `striplog_${holeId}_${Date.now()}`, type: "image", label: `Strip log — ${holeId}`, src: built.dataUrl, aspect: built.aspect, ...box, depthHeightAtCaptureM: built.depthHeightAtCaptureM ?? null /* #1480 */ }];
    }
  }
  return { name: substituteTokens("{{hole_id}}", values), elements, stripLogFailed, textPt, narrowed, overlapping };
}

function buildOneSectionPage(section, templateElements) {
  const values = sectionAtlasValues(section);
  const elements = templateElements.map((el) => substituteElement(el, values));
  return { name: substituteTokens("{{name}}", values), elements };
}

// The main entry point — `mode` is "hole" or "section", `items` is the list of hole_ids or section
// objects to generate one page each for. Returns [{name, elements}], ready for store.addLayoutPages().
export async function generateAtlasPages({ mode, items, templateElements, collars, layers, includeStripLog, legendOverride = null, page = null, assayTracks = null, lithoPatterns = false }) {
  if (mode === "hole") {
    const pages = [];
    for (const holeId of items) pages.push(await buildOneHolePage(holeId, templateElements, { collars, layers, includeStripLog, legendOverride, page, assayTracks, lithoPatterns }));
    return pages;
  }
  return items.map((section) => buildOneSectionPage(section, templateElements));
}
