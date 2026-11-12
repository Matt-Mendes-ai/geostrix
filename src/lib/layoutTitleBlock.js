// TASKS.csv #1868 (review #1646, Kodiak) — a report figure's TITLE BLOCK, two starter templates, and templates as small files.
// The reviewer built an ARIS title block from about eight single-line Text boxes and rectangles placed by hand, a fresh project
// offered 'Templates (0)', and a saved template lived inside that one project. Pure: no React.
import { pagePx } from "./pageFormats.js";
import { t as tr } from "./i18n.js";

// The labelled rows of a new title block. Values may hold the page placeholders ({project}, {date}, {scale}, {crs}, {page},
// {pages}); the empty ones are for the geologist to fill (no company, tenure or author is invented, #264). Saved in the project,
// so the labels stay English like the rest of the project data; they are edited on the page.
export function defaultTitleBlockRows() {
  return [
    ["Title", ""],
    ["Company", ""],
    ["Project", "{project}"],
    ["Tenure / claims", ""], // #2306 — neutral labels (were BC's 'Claims / tenures', 'NTS / map sheet'); a saved block keeps its own
    ["Map sheet", ""],
    ["Figure", ""],
    ["Drawn by", ""],
    ["Date", "{date}"],
    ["Scale", "{scale}"],
    ["Grid / coordinate system", "{crs}"], // #2306 — a local grid has no datum / projection; {crs} names it
    ["Page", "{page} of {pages}"],
  ];
}
export function newTitleBlock(id, x, y) {
  return { id, type: "titleblock", x, y, w: 340, rows: defaultTitleBlockRows(), fontPt: 8, frameWidth: 1 };
}

// Starter templates: built in, at a set paper size, laid out from that page's size. A neatline 10 mm in, the figure title at
// the top, a title block in the bottom-right corner, and (on the plan) a north arrow; the map or section view goes in after.
const MM = 96 / 25.4;
export const STOCK_TEMPLATES = [
  { id: "stock_plan_a4", name: "Plan figure (A4 landscape)", format: { size: "a4", orientation: "landscape" }, kind: "plan" },
  { id: "stock_section_a3", name: "Section figure (A3 landscape)", format: { size: "a3", orientation: "landscape" }, kind: "section" },
];
export function stockTemplateElements(tpl, stamp = Date.now()) {
  const { w: W, h: H } = pagePx(tpl.format), m = Math.round(10 * MM), id = (k) => `${k}_${stamp}_${tpl.kind}`;
  const tb = newTitleBlock(id("titleblock"), 0, 0), tbW = tpl.kind === "section" ? 380 : 340, tbH = 11 * 19 + 4; // about 19 px a row at 8 pt
  tb.w = tbW; tb.x = W - m - tbW - 8; tb.y = H - m - tbH - 8;
  const els = [
    { id: id("rect"), type: "rect", x: m, y: m, w: W - 2 * m, h: H - 2 * m, stroke: "#1a2028", strokeWidth: 1.5, fill: "#ffffff", fillOpacity: 0, locked: true },
    { id: id("text"), type: "text", x: m + 12, y: m + 10, w: Math.round(W * 0.6), text: tpl.kind === "section" ? "Section" : "Plan map", fontSize: Math.round(16 * (96 / 72)), bold: true },
    tb,
  ];
  if (tpl.kind === "plan") els.push({ id: id("north"), type: "north", x: W - m - 70, y: m + 14 });
  return els;
}

// TASKS.csv #2312 (review #2174) — a page made from a starter template, then switched to another paper size or orientation, kept the
// template's neatline, title block and north arrow at their old places (an A4 frame in the top of an A3 portrait sheet). The starter
// elements are known by their ids (kind_<stamp>_<plan|section>); they are laid out again for the new format (place and size only: the
// title's text, the title block's rows and every other element stay as they are). -> { elements, refitted } (refitted: how many moved)
const STOCK_ID = /^(rect|text|titleblock|north)_(\d+)_(plan|section)$/;
export function refitStockTemplate(elements, format) {
  const hit = (elements || []).map((el) => STOCK_ID.exec(String(el?.id || ""))).find(Boolean);
  if (!hit) return { elements, refitted: 0 };
  const [, , stamp, kind] = hit;
  const fresh = new Map(stockTemplateElements({ format, kind }, stamp).map((el) => [el.id, el]));
  let refitted = 0;
  const out = (elements || []).map((el) => {
    const f = fresh.get(el.id);
    if (!f) return el;
    refitted++;
    const geo = { x: f.x, y: f.y };
    if (f.w != null) geo.w = f.w;
    if (f.h != null) geo.h = f.h;
    return { ...el, ...geo };
  });
  return { elements: out, refitted };
}

// A template as a file: { geostrixLayoutTemplate: 1, name, format, elements }.
export function templateFile(tpl) {
  return JSON.stringify({ geostrixLayoutTemplate: 1, name: tpl.name, format: tpl.format || null, elements: tpl.elements }, null, 1);
}
// Reading one back. Only the Layout's own element types come in, and an image only as an embedded data: URL, so a template
// from someone else cannot make the page fetch from the network. -> { name, format, elements, dropped } or throws.
const KNOWN = new Set(["title", "text", "logo", "image", "scale", "north", "legend", "rect", "arrow", "callout", "table", "titleblock", "viewport", "freehand"]);
export function parseTemplateFile(text, fallbackName = "Template") {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(tr("Not a GeoStrix layout template (not JSON).")); }
  if (!d || d.geostrixLayoutTemplate !== 1 || !Array.isArray(d.elements)) throw new Error(tr("Not a GeoStrix layout template."));
  let dropped = 0;
  const elements = [];
  for (const el of d.elements) {
    if (!el || typeof el !== "object" || typeof el.id !== "string" || !KNOWN.has(el.type)) { dropped++; continue; }
    const out = { ...el };
    if ("src" in out && !(typeof out.src === "string" && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(out.src))) delete out.src; // the only field drawn as an image
    if ((out.type === "logo" || out.type === "image") && !out.src) { dropped++; continue; }
    elements.push(out);
  }
  const f = d.format && typeof d.format === "object" ? { size: String(d.format.size || ""), orientation: d.format.orientation === "portrait" ? "portrait" : "landscape" } : null;
  return { name: String(d.name || fallbackName).slice(0, 120), format: f, elements, dropped };
}

// TASKS.csv #1487 (review #1352, Layout) — a template is the page's furniture, not this project's pictures: a saved template
// carried the 2.3 MB section snapshot it was made beside. A cross-section / plan-map snapshot (an image that came from the data)
// is left out, and a viewport keeps its frame, place, size and settings but not its picture or the camera that took it, so
// it shows '(not rendered yet)' until a refresh draws it from the project it is loaded into. Logos and pictures the user
// added stay. Links to a left-out element are cleared. -> { elements, dropped (snapshots left out), cleared (viewport pictures) }
const VIEWPORT_CAPTURE = ["src", "worldHeightAtTarget", "cameraAzimuthDeg", "targetWorld", "viewState", "samplesUnplaced", "markHole", "refreshing", "planView", "capturedFixedScale"];
export const isDataSnapshot = (el) => el?.type === "image" && !!(el.sectionTabId || el.planMap || el.worldWidthAtCaptureM || el.legendItems?.length || el.depthHeightAtCaptureM);
export function templateElements(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const gone = new Set(list.filter(isDataSnapshot).map((el) => el.id));
  const unlink = (v) => (v != null && gone.has(v) ? null : v);
  let cleared = 0;
  const out = list.filter((el) => !gone.has(el.id)).map((el) => {
    const e = { ...el };
    if (e.type === "viewport") { if (e.src) cleared++; for (const k of VIEWPORT_CAPTURE) delete e[k]; }
    for (const k of ["boundTo", "overviewOf", "boundViewportId"]) if (k in e) e[k] = unlink(e[k]);
    return e;
  });
  return { elements: out, dropped: gone.size, cleared };
}
