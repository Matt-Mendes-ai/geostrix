// TASKS.csv #130 — "Layout is strong (multi-page, templates, viewports) but has no 'one page per
// drillhole/section' batch-generation (QGIS Atlas), which exploration reporting workflows use for
// standardized per-hole or per-section report pages."
//
// Scope: text substitution ({{token}} placeholders in any text/title element, filled per hole/section)
// plus an optional auto-generated strip-log image per hole (src/lib/striplogSvg.js). Deliberately does
// NOT attempt a per-hole/per-section auto-recentered 3D "Viewport" snapshot — that needs a live camera
// render per page (ViewerModule's own capture round-trip is inherently interactive/one-at-a-time, see
// its own header comment), which doesn't fit an unattended batch pass; any existing Viewport element on
// the template is carried through UNCHANGED (same captured image on every generated page) rather than
// silently dropped, so a property-overview visual still appears on every page even though it isn't
// per-item.
import { buildStripLogDataUrl } from "./striplogSvg.js";
import { utmGridReady } from "./layoutGeometry.js"; // TASKS.csv #1644

// TASKS.csv #1644 (review #1497, Lawyers) — each hole marked on the template's map. The viewport is still the template's one capture
// (see above), so a page used to show the district plan with nothing saying where its hole was (21AGBDD001 800 m off centre,
// unmarked). A top-down, true-scale viewport now carries markHole: the page draws a ring and the id at the collar, or says the
// hole is outside the map.
export function markHoleOnViewports(elements, collar) {
  if (!collar || !Number.isFinite(collar.x) || !Number.isFinite(collar.y)) return elements;
  return elements.map((el) => (el.type === "viewport" && utmGridReady(el) ? { ...el, markHole: { id: String(collar.hole_id), x: collar.x, y: collar.y } } : el));
}

// Tokens available to each atlas mode — shown in the UI so the user knows what to type into a text
// element before generating, rather than discovering it by trial and error.
export const HOLE_TOKENS = ["hole_id", "x", "y", "z", "azimuth", "dip", "length", "lithology_summary"];
export const SECTION_TOKENS = ["name", "azimuth", "corridor", "length"];

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
export function substituteTokens(text, values) {
  if (typeof text !== "string") return text;
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in values ? values[key] : m));
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
export function placeStripLog(elements, aspect, page = { w: 1123, h: 794 }, margin = 40) {
  let h = page.h - 2 * margin, w = h * aspect;
  if (w > page.w * 0.4) { w = page.w * 0.4; h = w / aspect; }
  const overlap = (x) => elements.reduce((s, el) => {
    const ex = el.x || 0, ey = el.y || 0, ew = el.w || 100, eh = el.h || 40;
    const ox = Math.max(0, Math.min(x + w, ex + ew) - Math.max(x, ex)), oy = Math.max(0, Math.min(margin + h, ey + eh) - Math.max(margin, ey));
    return s + ox * oy;
  }, 0);
  const right = page.w - margin - w, left = margin;
  return { x: overlap(right) <= overlap(left) ? right : left, y: margin, w, h };
}
// TASKS.csv #1772 (review #1645, Copley) — the strip log's column still covered a wide template map (the 1:5,000 viewport ran to
// x 1011 of 1123 px, the log started at 959). Each template element it covers is narrowed to end `gap` px before it (or, on the
// left, to start after it) when at least `minKeep` of its width remains; a viewport keeps its scale and shows less ground. One that
// cannot keep that much (a north arrow or a scale bar near the map's edge) moves aside whole when it fits on the page. Elements that
// can do neither are left as they are and counted. -> { elements, narrowed (narrowed or moved), overlapping }
// A north arrow draws at a fixed size whatever its saved width (LayoutModule: 54 x 70 px, 170 x 124 with the declination diagram):
// it is moved, never narrowed, to whichever side of the log has room, nearer first.
const fixedSize = (el) => (el.type === "north" ? (el.decl ? [170, 124] : [54, 70]) : null);
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

async function buildOneHolePage(holeId, templateElements, { collars, layers, includeStripLog, legendOverride, page, assayTracks = null }) { // assayTracks: #1480
  const values = holeAtlasValues(holeId, collars, layers);
  let elements = markHoleOnViewports(templateElements.map((el) => substituteElement(el, values)), collars.find((c) => c.hole_id === holeId)); // #1644
  let stripLogFailed = false, textPt = null, narrowed = 0, overlapping = 0;
  if (includeStripLog) {
    // TASKS.csv #1080 — one hole's strip log failing (a rasterize error) no longer aborts the whole atlas: its page is
    // added without the image and counted in the result notice
    let built = null;
    try { built = await buildStripLogDataUrl({ holeId, collars, layers, legendOverride, ...(assayTracks || {}) }); } catch { stripLogFailed = true; } // legendOverride: #1092; assayTracks { assays, assaySymbols, elementUnits }: #1480
    if (built) {
      const box = placeStripLog(elements, built.aspect, page || undefined);
      textPt = stripLogTextPt(built.height, box.h);
      ({ elements, narrowed, overlapping } = makeRoomForStripLog(elements, box, { pageW: (page || {}).w || 1123 })); // #1772
      elements = [...elements, { id: `striplog_${holeId}_${Date.now()}`, type: "image", label: `Strip log — ${holeId}`, src: built.dataUrl, aspect: built.aspect, ...box }];
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
export async function generateAtlasPages({ mode, items, templateElements, collars, layers, includeStripLog, legendOverride = null, page = null, assayTracks = null }) {
  if (mode === "hole") {
    const pages = [];
    for (const holeId of items) pages.push(await buildOneHolePage(holeId, templateElements, { collars, layers, includeStripLog, legendOverride, page, assayTracks }));
    return pages;
  }
  return items.map((section) => buildOneSectionPage(section, templateElements));
}
