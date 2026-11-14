// TASKS.csv #3372 (review #3195) — a deep hole's strip log over as many Layout pages as its depth scale needs. 'Add to Layout' makes one
// picture: a 694 m log was 1 : 2,950 with 1.5 pt labels on one A4 page, or 753 mm tall at 1 : 1,000, and the only advice was to send
// shorter depth ranges by hand (each its own picture with its own key). The picture is the strip log window's SVG export
// (lib/svgExport.js exportSvgMarkup, furniture on top): a title / caption / key band of B px (the root viewBox starts at y = -B), then
// the window's own drawing: track headers in PAD_TOP px, the depth axis at pxPerMeter from there, and the axis captions (grade ranges)
// in the PAD_BOTTOM px under the last metre (components/StripLog.jsx: sy(d) = PAD_TOP + (d - d0) * pxPerMeter, H = sy(d1) + 30). A
// page shows slices of that one picture (an image element's `slice.parts`, [y0, y1] ranges in its own px, stacked): the first page the
// band, the headers and the first depths; every other page the headers again, its depths, and the axis captions; the last page the
// bottom of the hole. One key, on the first page. Nothing is drawn again, so the figure is the one the window made.
import { b64ToBytes } from "./base64.js";
export const PAD_TOP = 40; // mirrors components/StripLog.jsx (pinned by test/stripLogPages3372.test.mjs)
export const PAD_BOTTOM = 30;
const M_PER_PAGE_PX = 0.0254 / 96;

// The band height from the SVG data URL's root viewBox (only the first few kB are decoded). -> { bandPx, width, height } or null
export function stripLogSvgBox(src) {
  const m = /^data:image\/svg\+xml;base64,/.exec(src || "");
  if (!m) return null;
  let head = "";
  try {
    const b64 = src.slice(m[0].length, m[0].length + 4096);
    head = String.fromCharCode(...b64ToBytes(b64.slice(0, b64.length - (b64.length % 4)))); // the one decoder (#1114); 4 kB: no spread limit
  } catch { return null; }
  const root = /<svg\b[^>]*>/.exec(head);
  const vb = root && /\bviewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(root[0]);
  if (!vb) return null;
  const y = Number(vb[2]), width = Number(vb[3]), height = Number(vb[4]);
  if (!(width > 0) || !(height > 0)) return null;
  return { bandPx: y < 0 ? -y : 0, width, height };
}

// The depths the label gives ('Strip log — GC23-0976, 100-250 m'), else from 0
function rangeFromLabel(label) {
  const r = /,\s*(-?[\d.]+)-(-?[\d.]+) m\s*$/.exec(label || "");
  return r ? Number(r[1]) : 0;
}

// The geometry of a strip-log image element, or null when it is not one this can split (a PNG Atlas log, or no depth span).
export function stripLogGeometry(el) {
  if (!el || el.type !== "image" || !(el.depthHeightAtCaptureM > 0) || el.slice) return null;
  const box = stripLogSvgBox(el.src);
  if (!box) return null;
  const naturalH = el.naturalH || box.height, naturalW = el.naturalW || box.width;
  const ppm = naturalH / el.depthHeightAtCaptureM; // depthHeightAtCaptureM = the whole picture's height / pxPerMeter (StripLog addToLayout)
  const bodyTop = box.bandPx + PAD_TOP, bodyPx = naturalH - bodyTop - PAD_BOTTOM;
  if (!(ppm > 0) || !(bodyPx > 0)) return null;
  const d0 = rangeFromLabel(el.label);
  return { naturalW, naturalH, bandPx: box.bandPx, ppm, bodyTop, bodyPx, d0, d1: d0 + bodyPx / ppm };
}

// The depth scale at which the log is `usableW` page px wide, rounded up to a round 1 : N (1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8 x 10^n): the
// picture keeps its shape, so its width grows with the depth scale, and a page's width is the most its labels can grow to. A 13-track
// log of 1,000 px is 420 mm wide at 1 : 500; on an A4 portrait page it fits at about 1 : 1,000. Never larger than the picture's own size
// (its labels at about 7 pt): a 3-track log would otherwise be offered 1 : 250 over 15 pages with 18 pt labels.
const NICE = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
export function niceDenomUp(n) {
  if (!(n > 0)) return null;
  const mg = 10 ** Math.floor(Math.log10(n));
  return Math.round(NICE.find((m) => m * mg >= n * (1 - 1e-9)) * mg);
}
export function pageWidthDenom(el, usableW) {
  const g = stripLogGeometry(el);
  if (!g || !(usableW > 0)) return null;
  const k = Math.min(1, usableW / g.naturalW); // page px per picture px
  return niceDenomUp(el.depthHeightAtCaptureM / (k * g.naturalH * M_PER_PAGE_PX));
}
// the size the window's 9.5 px labels print at for page px per picture px k (as Layout's depth-scale panel says, #1641)
export const sliceLabelPt = (k) => (9.5 * k * 72) / 96;

const STEPS = [1, 2, 5, 10, 20, 25, 50, 100];
// Split it for pages pageW x pageH px at depth scale 1 : denom, from (x, y) on the first page and `top` on the others, leaving
// `bottom` px under each slice (its page caption). -> { k (page px per picture px), w, pages: [{ parts, h, from, to }] } or { error }
export function splitStripLog(el, { pageW, pageH, denom, x = 40, y = 40, top = 40, bottom = 64, right = 40 }) {
  const g = stripLogGeometry(el);
  if (!g) return { error: "not-svg" };
  const k = el.depthHeightAtCaptureM / (denom * M_PER_PAGE_PX) / g.naturalH;
  const w = g.naturalW * k;
  if (x + w > pageW - right + 0.5) return { error: "too-wide", w };
  const head = PAD_TOP, foot = PAD_BOTTOM;
  const room = (from, extra) => Math.floor((pageH - from - bottom) / k - extra); // body px a page can take
  const firstRoom = room(y, g.bodyTop + foot), nextRoom = room(top, head + foot);
  if (!(nextRoom > g.ppm) || !(firstRoom > 0)) return { error: "too-tall-header" };
  // cut at a round depth: a tick's label (drawn from about 6 px above its line to 3 px below) stays whole on the page above
  const cutAfter = (fromPx, roomPx) => {
    const end = fromPx + roomPx;
    if (end >= g.bodyPx) return g.bodyPx;
    const m = (roomPx / g.ppm), step = [...STEPS].reverse().find((s) => s * 4 <= m) || 1;
    const dEnd = g.d0 + (end - 4) / g.ppm, dCut = Math.floor(dEnd / step) * step;
    const px = (dCut - g.d0) * g.ppm + 4;
    return px > fromPx + g.ppm ? px : end;
  };
  const pages = [];
  let at = 0, fromD = g.d0; // fromD: the round depth the page starts at (its pixels start just under that tick's label)
  for (let guard = 0; at < g.bodyPx && guard < 500; guard++) {
    const first = !pages.length;
    const to = cutAfter(at, first ? firstRoom : nextRoom);
    const last = to >= g.bodyPx;
    const body = [g.bodyTop + at, g.bodyTop + to];
    const parts = first ? [[0, body[1]]] : [[g.bandPx, g.bandPx + head], body];
    if (last) parts[parts.length - 1] = [parts[parts.length - 1][0], g.naturalH];
    else parts.push([g.naturalH - foot, g.naturalH]);
    const hPx = parts.reduce((s, [a, b]) => s + (b - a), 0);
    const toD = last ? g.d1 : g.d0 + (to - 4) / g.ppm;
    pages.push({ parts, h: hPx * k, from: fromD, to: toD });
    at = to; fromD = toD;
  }
  return { k, w, pages };
}

// The Layout elements for one page's slice: the image (its own depth span, so the depth scale reads 1 : denom) and its caption.
// English: printed on the sheet.
export function stripLogSliceElements(el, split, i, { x, y, holeLabel, batchId }) {
  const p = split.pages[i], n = split.pages.length, k = split.k;
  const hPx = p.h / k;
  const fmt = (d) => String(Number(d.toFixed(1)));
  const img = {
    ...el, id: i === 0 ? el.id : `${el.id}_p${i + 1}`, x, y, w: split.w, h: p.h, aspect: split.w / p.h,
    depthHeightAtCaptureM: hPx / (el.naturalH / el.depthHeightAtCaptureM),
    slice: { parts: p.parts, page: i + 1, of: n, from: p.from, to: p.to, batch: batchId, whole: { h: el.h, w: el.w, aspect: el.aspect, depthHeightAtCaptureM: el.depthHeightAtCaptureM } },
  };
  const caption = { id: `${img.id}_cap`, type: "text", x, y: y + p.h + 8, w: Math.max(160, split.w), text: `${holeLabel}, ${fmt(p.from)}-${fmt(p.to)} m · page ${i + 1} of ${n}${i < n - 1 ? " · continued on the next page" : ""}`, sliceCaptionOf: img.id };
  return [img, caption];
}

// The whole picture again, from a slice (its first page's element). slice: undefined, not left out: Layout merges a patch into the element.
export function wholeStripLog(slice) {
  if (!slice?.slice?.whole) return slice;
  const { slice: s, ...rest } = slice;
  return { ...rest, ...s.whole, slice: undefined };
}
