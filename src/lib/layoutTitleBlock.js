// TASKS.csv #1868 (review #1646, Kodiak) — a report figure's TITLE BLOCK, two starter templates, and templates as small files.
// The reviewer built an ARIS title block from about eight single-line Text boxes and rectangles placed by hand, a fresh project
// offered 'Templates (0)', and a saved template lived inside that one project. Pure: no React.
import { creditsElement, PAGE_MARGIN, textLines } from "./layoutCredits.js"; // TASKS.csv #3658
import { pagePx } from "./pageFormats.js";
import { t as tr } from "./i18n.js";
import { LOOK_SHIFT } from "./layoutLinks.js"; // TASKS.csv #3716 (7)

// The labelled rows of a new title block. Values may hold the page placeholders ({project}, {date}, {scale}, {crs}, {page},
// {pages}); the empty ones are for the geologist to fill (no company, tenure or author is invented, #264). Saved in the project,
// so the labels stay English like the rest of the project data; they are edited on the page.
// TASKS.csv #3591 — { credit: true }: a last row 'Data' = {credits}, for a project that has a data credit (left out when it has none)
export function defaultTitleBlockRows({ credit = false, shared = null } = {}) { // shared: #3714
  const own = (label) => shared?.[label] ?? "";
  return [
    ["Title", ""],
    ["Company", own("Company")],
    ["Project", "{project}"],
    ["Tenure / claims", ""], // #2306 — neutral labels (were BC's 'Claims / tenures', 'NTS / map sheet'); a saved block keeps its own
    ["Map sheet", ""],
    ["Figure", ""],
    ["Drawn by", own("Drawn by")],
    ["Date", "{date}"],
    ["Scale", "{scale}"],
    ["Grid / coordinate system", "{crs}"], // #2306 — a local grid has no datum / projection; {crs} names it
    ["Page", "{page} of {pages}"],
    ...(credit ? [["Data", "{credits}"]] : []),
  ];
}
// TASKS.csv #3658 (re-test R2) — the block was placed for 12 one-line rows (232 px) while its Data row wraps over four lines (256 px), so its frame ended 1 mm from the foot of the sheet. Its height now counts the
// credit's wrapped lines (the value column is about 60 % of the 340 px block, at 8 pt about 4.9 px a letter), and it is placed above the credit, inside the page margin (lib/layoutCredits.js).
export function titleBlockHeight({ credit = false, creditText = "", w = 340 } = {}) {
  const lines = credit ? textLines(creditText, w * 0.58 - 8, 10.67) : 1; // measured with canvas text at 8 pt (#3662); the estimate where there is no canvas
  return (credit ? 12 : 11) * 19 + 4 + (lines - 1) * 11;
}
// where a new title block goes on a page of this paper: the bottom-right corner, above the credit line when the project has one -> { x, y }
export function titleBlockSpot(format, { credit = false, creditText = "" } = {}) {
  const { w, h } = pagePx(format), tbW = 340, bottom = credit ? creditsElement(format, creditText).y - 8 : h - PAGE_MARGIN;
  return { x: Math.max(20, w - PAGE_MARGIN - tbW), y: Math.max(20, bottom - titleBlockHeight({ credit, creditText, w: tbW })) };
}
// TASKS.csv #3714 — the company and the author are typed once for a document: a new title block starts with the Company and Drawn by of the first one that has them (Title and Figure stay per page).
// pages: [{ elements }] in order -> { Company?, "Drawn by"? }
export function sharedTitleRows(pages) {
  const out = {};
  for (const pg of pages || []) for (const el of pg?.elements || []) {
    if (el?.type !== "titleblock") continue;
    for (const label of ["Company", "Drawn by"]) {
      if (out[label]) continue;
      const v = String((el.rows || []).find((r) => String(r?.[0] || "").trim() === label)?.[1] ?? "").trim();
      if (v && !/^\{[a-z]+\}$/i.test(v)) out[label] = v;
    }
  }
  return out;
}
export function newTitleBlock(id, x, y, opts = {}) {
  return { id, type: "titleblock", x, y, w: 340, rows: defaultTitleBlockRows(opts), fontPt: 8, frameWidth: 1 };
}

// Starter templates: built in, at a set paper size, laid out from that page's size. A neatline 10 mm in, the figure title at
// the top, a title block in the bottom-right corner, and (on the plan) a north arrow; the map or section view goes in after.
const MM = 96 / 25.4;
export const STOCK_TEMPLATES = [
  { id: "stock_plan_a4", name: "Plan figure (A4 landscape)", format: { size: "a4", orientation: "landscape" }, kind: "plan" },
  { id: "stock_section_a3", name: "Section figure (A3 landscape)", format: { size: "a3", orientation: "landscape" }, kind: "section" },
];
export function stockTemplateElements(tpl, stamp = Date.now(), opts = {}) { // opts.credit: #3591
  const { w: W, h: H } = pagePx(tpl.format), m = Math.round(10 * MM), id = (k) => `${k}_${stamp}_${tpl.kind}`;
  const tb = newTitleBlock(id("titleblock"), 0, 0, opts), tbW = tpl.kind === "section" ? 380 : 340, tbH = titleBlockHeight({ credit: opts.credit, creditText: opts.creditText, w: tbW }); // about 19 px a row at 8 pt; the wrapped Data row: #3658
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
// TASKS.csv #3709 — what described ONE picture goes with it. A template saved from a section sheet kept that section's scale bar (marked 200 m, so 275 m long at the next section's scale), its 'Looking N' label and its legend, all
// linked to nothing: the next section sat beside two legends and a bar that measured 27 % short. Left as the starter page has them, the next picture ties to them (tieStarterFurniture): the bar back to its untouched 100 m,
// the label back to the north arrow it replaced, the picture's legend dropped. `gone`: the ids of the pictures left out (a template being saved); null: a template saved before this, whose links were already cleared (so an
// unbound bar that still has a picture's scale, and a label or legend that came from a picture, are the orphans).
export function furnitureOfOnePictureReset(list, gone = null) {
  const was = (v) => (gone ? v != null && gone.has(v) : false);
  const els = list.filter((e) => !(e?.type === "legend" && (was(e.boundViewportId) || (!gone && !e.boundViewportId && e.loadedCapturedAt != null && (e.loadedItems || []).length))));
  const hasNorth = els.some((e) => e?.id === "north");
  let tookNorth = hasNorth;
  return els.flatMap((e) => {
    if (e?.type === "scale" && (was(e.boundTo) || (!gone && !e.boundTo && e.pxPerMeter))) return [{ ...e, boundTo: null, pxPerMeter: undefined, meters: 100 }];
    if (e?.type === "text" && /^look_/.test(String(e.id)) && (was(e.boundTo) || (!gone && !e.boundTo))) { // the 'Looking N25°E' label sat where the starter's north arrow was (tieStarterFurniture)
      if (tookNorth) return [];
      tookNorth = true;
      return [{ id: "north", type: "north", x: (e.x || 0) + LOOK_SHIFT, y: e.y || 40 }];
    }
    if (e?.type === "north" && was(e.boundTo)) return [{ ...e, boundTo: null, rotation: null }];
    return [e];
  });
}
export function templateElements(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const gone = new Set(list.filter(isDataSnapshot).map((el) => el.id));
  const unlink = (v) => (v != null && gone.has(v) ? null : v);
  let cleared = 0;
  const kept = furnitureOfOnePictureReset(list.filter((el) => !gone.has(el.id)), gone);
  const out = kept.map((el) => {
    const e = { ...el };
    if (e.type === "viewport") { if (e.src) cleared++; for (const k of VIEWPORT_CAPTURE) delete e[k]; }
    for (const k of ["boundTo", "overviewOf", "boundViewportId"]) if (k in e) e[k] = unlink(e[k]);
    return e;
  });
  return { elements: out, dropped: gone.size, cleared };
}

// TASKS.csv #3612 (1) — the PDF's document title was 'GeoStrix' whatever the sheet said. It is the first page's title block Title (or its title text), else the project's name, else 'GeoStrix';
// a value that is only a token ('{project}') is not a title.
export function documentTitle(pages, project) {
  const els = pages?.[0]?.elements || [];
  const plain = (v) => { const t = String(v ?? "").trim(); return t && !/\{[a-z]+\}/i.test(t) ? t : ""; };
  const tb = els.find((e) => e?.type === "titleblock"), row = tb?.rows?.find((r) => String(r?.[0] || "").trim().toLowerCase() === "title");
  const text = els.find((e) => e?.type === "title");
  return plain(row?.[1]) || plain(text?.text) || plain(project?.name) || "GeoStrix";
}
