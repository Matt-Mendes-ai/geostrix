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
    dip: c && c.dip != null ? fmt(c.dip, 0) : "?",
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
async function buildOneHolePage(holeId, templateElements, { collars, layers, includeStripLog }) {
  const values = holeAtlasValues(holeId, collars, layers);
  let elements = templateElements.map((el) => substituteElement(el, values));
  if (includeStripLog) {
    const built = await buildStripLogDataUrl({ holeId, collars, layers });
    if (built) {
      const maxY = elements.reduce((m, el) => Math.max(m, (el.y || 0) + (el.h || 40)), 60);
      const w = 260, h = w / built.aspect;
      elements = [...elements, { id: `striplog_${holeId}_${Date.now()}`, type: "image", label: `Strip log — ${holeId}`, src: built.dataUrl, aspect: built.aspect, x: 40, y: maxY + 20, w, h }];
    }
  }
  return { name: substituteTokens("{{hole_id}}", values), elements };
}

function buildOneSectionPage(section, templateElements) {
  const values = sectionAtlasValues(section);
  const elements = templateElements.map((el) => substituteElement(el, values));
  return { name: substituteTokens("{{name}}", values), elements };
}

// The main entry point — `mode` is "hole" or "section", `items` is the list of hole_ids or section
// objects to generate one page each for. Returns [{name, elements}], ready for store.addLayoutPages().
export async function generateAtlasPages({ mode, items, templateElements, collars, layers, includeStripLog }) {
  if (mode === "hole") {
    const pages = [];
    for (const holeId of items) pages.push(await buildOneHolePage(holeId, templateElements, { collars, layers, includeStripLog }));
    return pages;
  }
  return items.map((section) => buildOneSectionPage(section, templateElements));
}
