// TASKS.csv #3912 (platform redesign, P9) — one-click sheets in Layout: Plan map, Cross-section, Hole log, Intercepts table. Each is a NEW page laid
// out from what the project holds, with the existing Layout items only (a drill plan, a section or strip-log picture already sent to Layout, a Best
// intercepts table), so it prints and exports as any page does: no new export path. A sheet carries a title, its map or picture, a legend, the
// scale (a bar tied to the map, or the picture's own depth axis), a north arrow on a map (a section gets its 'looking' label, lib/layoutLinks.js) and
// the data credit (the store's addLayoutPages adds it to every new page, #3854). Text stays page-scaled, as on any page. Pure: the page module
// passes what it holds and adds the pages.
import { pagePx } from "./pageFormats.js";
import { starterLayout } from "./layoutCredits.js";
import { fitDrillPlan } from "./drillPlan.js";
import { legendBoxSize } from "./legendFit.js";
import { roundScaleSize, isSectionImage, isDepthImage } from "./layoutGeometry.js";
import { tieStarterFurniture } from "./layoutLinks.js";

export const SHEET_KINDS = ["plan", "section", "log", "intercepts"];
export const PLAIN_PLAN_KEY = [["Drillhole: collar and trace", "#1a2028"]]; // printed page text, English as the other page items
const M = 40, TOP = 90, GAP = 16; // the page margin, the frame's top (under the title), the gap before a legend

// the newest picture or table of each kind on any page (the last page, then the last element): what Cross-section, Hole log and Intercepts table lay out
export function sheetSources(pages) {
  const out = { section: null, log: null, intercepts: null };
  for (const pg of pages || []) for (const el of pg?.elements || []) {
    if (isSectionImage(el) && !el.planMap) out.section = el;
    else if (isDepthImage(el)) out.log = el;
    else if (el?.type === "table" && el.source === "static") out.intercepts = el;
  }
  return out;
}

// the frame a sheet's main item may use on a page, with room on the right for a legend of `legendW`, above the scale bar and credit
function frameOf(format, legendW, credit) {
  const { w, h } = pagePx(format), s = starterLayout(format, credit);
  const right = legendW > 0 ? legendW + GAP : 0;
  return { page: { w, h }, s, x: M, y: TOP, w: w - 2 * M - right, h: s.scale.y - 12 - TOP };
}
const titleEl = (text) => ({ id: "title", type: "title", x: M, y: 30, text, w: 600 });
const legendEl = (items, frame, idSuffix) => {
  if (!items?.length) return null;
  const box = legendBoxSize(items), x = frame.page.w - M - box.w, y = Math.max(TOP + 40, frame.y); // under the north arrow
  return { id: `legend_${idSuffix}`, type: "legend", items, x, y, w: box.w, h: Math.min(box.h, frame.s.scale.y - 12 - y) };
};
// the starter's north arrow and 100 m bar, at the starter's places, for tieStarterFurniture to tie to the map or picture
const furniture = (frame) => [{ id: "north", type: "north", x: frame.s.north.x, y: frame.s.north.y }, { id: "scale", type: "scale", x: M, y: frame.s.scale.y, meters: 100 }];

// Plan map: every hole (collars, planned holes as collars) on a drill plan at the largest round scale that holds them, its key as the legend,
// the north arrow and a scale bar tied to it. -> { elements } | null (no hole to show)
export function planSheet({ format = null, credit = "", collars, traces = null, legendItems: key = [], presets, stamp = 0, onlyChecked = false }) {
  const legendItems = key.length ? key : PLAIN_PLAN_KEY; // a plan whose holes are not coloured by anything has no key of its own: the sheet still says what the symbols are
  const legendW = legendItems.length ? legendBoxSize(legendItems).w : 0, frame = frameOf(format, legendW, credit);
  const fit = fitDrillPlan(collars, frame.w, frame.h, presets, traces);
  if (!fit) return null;
  const plan = { id: `drillplan_${stamp}`, type: "drillplan", x: frame.x, y: frame.y, w: Math.round(frame.w), h: Math.round(frame.h), labels: "all", fontPt: 7, frameWidth: 1, scale: fit.scale, centre: fit.centre, ...(onlyChecked ? { onlyChecked: true } : {}) };
  const els = [titleEl("{project}: drill plan"), plan, ...furniture(frame), legendEl(legendItems, frame, stamp)].filter(Boolean);
  return { elements: tieStarterFurniture(els, plan) };
}

// Cross-section: the newest section picture at the largest round scale that fits the frame, its own legend, its 'looking' label (in the north
// arrow's place) and a scale bar tied to it. -> { elements } | null
export function sectionSheet({ format = null, credit = "", source, presets, stamp = 0 }) {
  if (!isSectionImage(source)) return null;
  const items = source.legendItems || [], legendW = items.length ? legendBoxSize(items).w : 0, frame = frameOf(format, legendW, credit);
  const aspect = source.aspect || (source.naturalW && source.naturalH ? source.naturalW / source.naturalH : 16 / 9);
  const fit = roundScaleSize({ worldWidthAtCaptureM: source.worldWidthAtCaptureM, aspect }, presets, frame.w, frame.h);
  const w = fit ? fit.w : Math.min(frame.w, frame.h * aspect), h = fit ? fit.h : w / aspect;
  const pic = { ...source, id: `image_${stamp}`, x: frame.x, y: frame.y, w, h, aspect, boundTo: undefined };
  delete pic.sectionTabId; // a copy: a re-draw of the section goes to the original picture, not this sheet's
  const els = [titleEl(`{project}: ${source.label || "cross-section"}`), pic, ...furniture(frame), legendEl(items, frame, stamp)].filter(Boolean);
  return { elements: tieStarterFurniture(els, pic) };
}

// Hole log: the newest strip-log picture filling the page's height (its depth axis is its scale; nothing on it is a map, so no north arrow or
// map scale bar), its legend beside it. Portrait paper. -> { elements, portrait: true } | null
export function logSheet({ format = null, credit = "", source, stamp = 0 }) {
  if (!isDepthImage(source)) return null;
  const items = source.legendItems || [], legendW = items.length ? legendBoxSize(items).w : 0, frame = frameOf(format, legendW, credit);
  const aspect = source.aspect || (source.naturalW && source.naturalH ? source.naturalW / source.naturalH : 0.3);
  const h = Math.min(frame.h, frame.w / aspect), w = h * aspect;
  const pic = { ...source, id: `image_${stamp}`, x: frame.x, y: frame.y, w, h, aspect, boundTo: undefined };
  return { elements: [titleEl(`{project}: ${source.label || "hole log"}`), pic, legendEl(items, frame, stamp)].filter(Boolean) };
}

// Intercepts table: the newest Best intercepts table at the top of the page, as wide as it was; no map, so no north arrow or scale bar. -> { elements } | null
export function interceptsSheet({ format = null, credit = "", source, stamp = 0 }) {
  if (source?.type !== "table" || source.source !== "static") return null;
  const frame = frameOf(format, 0, credit);
  const table = { ...source, id: `table_${stamp}`, x: frame.x, y: frame.y, w: Math.min(Number(source.w) || frame.w, frame.w), boundTo: undefined };
  return { elements: [titleEl(`{project}: ${source.title || "intercepts"}`), table] };
}
