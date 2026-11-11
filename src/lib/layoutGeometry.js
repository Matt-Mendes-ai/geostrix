// TASKS.csv #961 — Layout's print-scale geometry, out of LayoutModule.jsx so it can be tested (review #918: every Layout
// defect that review found sat in these unexported helpers). Page px are CSS px at 96 dpi; a captured viewport keeps
// the frame size it was rendered at in capW / capH (#906), which every scale figure must read instead of w / h.
import { t as tr } from "./i18n.js";

const M_PER_PAGE_PX = 0.0254 / 96;

// #906 — the size the image was captured at (the frame's size until it is resized after the capture)
export const capturedSize = (el) => ({ w: el.capW || el.w, h: el.capH || el.h });

// #398 — the orthographic half-height that puts N x the frame's printed width of ground across a frame elementW page px
// wide (ViewerModule's capture); the height follows from the frame's aspect
export const fixedScaleHalfHeight = (fixedScale, elementW, aspect) => (fixedScale * elementW * M_PER_PAGE_PX) / 2 / aspect;
// TASKS.csv #1486 — the other way: the 1:N a frame elementW page px wide shows when it holds 2 x halfH of world at this aspect (what the
// user's zoom framed in 'Enter & adjust view' while a fixed scale ignored it), and that N rounded to two significant figures
export const scaleForHalfHeight = (halfH, elementW, aspect) => (elementW > 0 && aspect > 0 ? (2 * halfH * aspect) / (elementW * M_PER_PAGE_PX) : null);
export const roundScale = (n) => { if (!(n > 0)) return null; const p = 10 ** (Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; };

// #906 — the capW / capH (and, for an old request without a height, h) store.jsx writes when a capture comes back
export function capturedFrameFields(el, reqW, reqH, aspect, fixedScale) {
  if (reqH) return { capW: reqW, capH: reqH };
  const w = el.w || 700, h = fixedScale ? w / aspect : Math.round(w / aspect);
  return { h, capW: w, capH: h };
}

// ground metres one page px of the image covers, or null before a capture
export function metresPerPagePx(el) {
  const { h } = capturedSize(el);
  return el.worldHeightAtTarget && h ? el.worldHeightAtTarget / h : null;
}

// the ground a fixed-scale frame shows, w x h metres
export const groundFrameSize = (fixedScale, el) => {
  const { w, h } = capturedSize(el);
  return { w: fixedScale * w * M_PER_PAGE_PX, h: fixedScale * h * M_PER_PAGE_PX };
};

// TASKS.csv #946 — a captured 3D viewport that was not looking straight down (ViewerModule's planView): to scale in the
// view plane only. Captures saved before #399 carry no planView at all and are left as they were.
export const obliqueCapture = (el) => !!(el && el.src && el.planView === false);

// "1 : N" for a viewport: a fixed-scale capture IS that scale (#906: the derived figure read 1 : 5,002 from the image's
// rounded pixel size); otherwise from metres per page px, with "~" for a perspective capture (#69). null before a capture.
export function viewportScaleText(el) {
  if (el.trueScale && el.fixedScale > 0 && el.capturedFixedScale === el.fixedScale) return `1 : ${el.fixedScale.toLocaleString()}`;
  const m = metresPerPagePx(el);
  if (!m) return null;
  return `${el.trueScale ? "" : "~"}1 : ${Math.round(m / M_PER_PAGE_PX).toLocaleString()}`;
}

// TASKS.csv #944 — a cross-section snapshot (an image carrying worldWidthAtCaptureM: the metres its full width shows):
// its horizontal plot scale at its size on the page, and the width that gives 1 : N (the height follows its aspect)
export const isSectionImage = (el) => !!(el && el.type === "image" && el.worldWidthAtCaptureM > 0);
export const sectionScaleDenom = (el) => (isSectionImage(el) && el.w > 0 ? el.worldWidthAtCaptureM / (el.w * M_PER_PAGE_PX) : null);
export const sectionWidthForScale = (el, n) => el.worldWidthAtCaptureM / (n * M_PER_PAGE_PX);
// TASKS.csv #1480 (review #1352) — a strip log (an image carrying depthHeightAtCaptureM: the metres of hole its full height spans at
// its own px per metre, furniture included, since the whole drawing scales together): its depth scale on the page, and the height
// that gives 1 : N (the width follows its aspect)
export const isDepthImage = (el) => !!(el && el.type === "image" && el.depthHeightAtCaptureM > 0);
export const depthScaleDenom = (el) => (isDepthImage(el) && el.h > 0 ? el.depthHeightAtCaptureM / (el.h * M_PER_PAGE_PX) : null);
export const depthHeightForScale = (el, n) => el.depthHeightAtCaptureM / (n * M_PER_PAGE_PX);
// "1 : 1,000 along the section" (+ the vertical exaggeration when it is not 1)
export function sectionScaleText(el) {
  const d = sectionScaleDenom(el);
  if (!d) return null;
  const n = Math.round(d), ve = el.verticalExaggeration || 1;
  if (el.planMap) return tr("1 : {n} (a plan: the same scale in both directions)", { n: n.toLocaleString() }); // TASKS.csv #1864
  return ve !== 1 ? tr("1 : {n} along the section, {ve}x vertical exaggeration", { n: n.toLocaleString(), ve }) : tr("1 : {n} along the section", { n: n.toLocaleString() });
}

// the {scale} placeholder: the page's first fixed-scale viewport, else its first captured one; an oblique capture says
// which plane the ratio holds in (#946); a page with no viewport takes its first cross-section snapshot (#944)
export function pageScaleText(els) {
  const list = els || [];
  // #2606 — a true map scale before an oblique estimate: a drill plan, or a plan viewport, names the page's scale; an oblique view's
  // '~1 : 72,096 in the view plane' only when nothing else on the page has a scale
  const plan0 = list.find((e) => e.type === "drillplan" && Number(e.scale) > 0);
  const v = list.find((e) => e.type === "viewport" && e.trueScale && e.capturedFixedScale > 0) || (plan0 ? null : list.find((e) => e.type === "viewport" && metresPerPagePx(e) && !obliqueCapture(e))) || (plan0 ? null : list.find((e) => e.type === "viewport" && metresPerPagePx(e)));
  if (!v) {
    const sec = list.find(isSectionImage);
    if (sec) return sectionScaleText(sec);
    // TASKS.csv #2474 (review #2325, WA uranium) — a drill-plan page: its plan's own scale (the title block's Scale row and {scale} were blank)
    const plan = list.find((e) => e.type === "drillplan" && Number(e.scale) > 0);
    return plan ? `1 : ${Math.round(Number(plan.scale)).toLocaleString()}` : "";
  }
  const text = v.trueScale && v.capturedFixedScale > 0 ? `1 : ${v.capturedFixedScale.toLocaleString()}` : `${v.trueScale ? "" : "~"}1 : ${Math.round(metresPerPagePx(v) / M_PER_PAGE_PX).toLocaleString()}`;
  const out = obliqueCapture(v) ? tr("{scale} in the view plane (oblique view)", { scale: text }) : text;
  return v.ve > 1 ? tr("{scale}, vertical exaggeration {ve}×", { scale: out, ve: v.ve }) : out; // #2628 — the snapshot is stretched vertically
}

// TASKS.csv #399 — a top-down, true-scale (orthographic) capture: every pixel is the same size on the ground
export function utmGridReady(el) {
  return !!(el.planView && el.trueScale && el.targetWorld && el.worldHeightAtTarget && el.h && el.w);
}
export function niceGridStep(span) {
  const raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
}

// TASKS.csv #1488 (review #1352, Layout) — a typed UTM grid spacing of 30 m at 1:25,000 drew lines 1.2 mm apart on paper and
// smeared every label into the frame's edge. The grid is drawn no closer than MIN_GRID_MM on paper: a tighter spacing is
// raised to the next round step (1, 2, 2.5, 5 x 10^n) that clears it, and the sidebar says so. mPerPx: metres per page px.
export const PAGE_PX_PER_MM = 96 / 25.4; // the Layout page is laid out at 96 px per inch
export const MIN_GRID_MM = 10;
export function legibleGridStep(step, mPerPx, minMm = MIN_GRID_MM) {
  if (!(step > 0) || !(mPerPx > 0)) return { step, bumped: false, mm: null };
  const mm = step / mPerPx / PAGE_PX_PER_MM;
  const min = minMm * PAGE_PX_PER_MM * mPerPx;
  if (step >= min * (1 - 1e-9)) return { step, bumped: false, mm };
  const mag = 10 ** Math.floor(Math.log10(min));
  return { step: [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= min * (1 - 1e-9)), bumped: true, mm };
}
// Labels that would print over one another: keep each only if its box clears every box kept before it (in order, so pass
// the ones that must stay first). boxes: [{ x, y, w, h }] (page px) -> a parallel array of booleans.
export function keepLabelsApart(boxes, pad = 2) {
  const kept = [];
  return boxes.map((b) => {
    const hit = kept.some((k) => b.x < k.x + k.w + pad && k.x < b.x + b.w + pad && b.y < k.y + k.h + pad && k.y < b.y + b.h + pad);
    if (!hit) kept.push(b);
    return !hit;
  });
}

// TASKS.csv #912 — page px of a viewport's image (from its centre: u right, v down) <-> world E / N, for a top-down,
// true-scale capture (the UtmGridOverlay maths: screen-up points at bearing -azimuth). overviewPolygon: the corners of
// `target`'s image in `overview`'s image px (from its top-left), or null when either is not such a capture.
export function vpToWorld(el, u, v) {
  const m = metresPerPagePx(el), b = (-(el.cameraAzimuthDeg || 0) * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  return [el.targetWorld.x + m * (u * cb - v * sb), el.targetWorld.y - m * (u * sb + v * cb)];
}
export function worldToVp(el, E, N) {
  const m = metresPerPagePx(el), b = (-(el.cameraAzimuthDeg || 0) * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  const a = (E - el.targetWorld.x) / m, c = -(N - el.targetWorld.y) / m;
  return [a * cb + c * sb, -a * sb + c * cb];
}
// TASKS.csv #1633 (review #1497, Lawyers) — the holes a top-down, true-scale frame shows: the collar, the middle or the end of the
// hole (straight from the collar's azimuth / dip / length; a survey bends it little at legend precision) inside the captured
// image. null when the frame is not such a capture (an oblique view has no ground extent to test).
export function holesInFrame(el, collars) {
  if (!utmGridReady(el)) return null;
  const { w, h } = capturedSize(el), out = new Set();
  const inside = (E, N) => { const [x, y] = worldToVp(el, E, N); return Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2; };
  for (const c of collars || []) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
    const az = ((Number(c.azimuth) || 0) * Math.PI) / 180, dip = ((Math.abs(Number(c.dip)) || 90) * Math.PI) / 180, horiz = (Number(c.length) || 0) * Math.cos(dip);
    const at = (t) => [c.x + Math.sin(az) * horiz * t, c.y + Math.cos(az) * horiz * t];
    if ([0, 0.5, 1].some((t) => inside(...at(t)))) out.add(c.hole_id);
  }
  return out;
}
export function overviewPolygon(overview, target) {
  if (!target || !utmGridReady(overview) || !utmGridReady(target)) return null;
  const { w: tw, h: th } = capturedSize(target), { w: ow, h: oh } = capturedSize(overview);
  return [[-tw / 2, -th / 2], [tw / 2, -th / 2], [tw / 2, th / 2], [-tw / 2, th / 2]].map(([u, v]) => {
    const [E, N] = vpToWorld(target, u, v), [x, y] = worldToVp(overview, E, N);
    return [Math.round((x + ow / 2) * 10) / 10, Math.round((y + oh / 2) * 10) / 10];
  });
}

// TASKS.csv #910 — the nearest snap of any of `vals` to any of `lines` within thr: { delta, at } (at = the line, or null)
export function snapToGuides(vals, lines, thr) {
  let best = null;
  for (const v of vals) for (const l of lines) { const d = l - v; if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: l }; }
  return best || { delta: 0, at: null };
}

// TASKS.csv #1479 (review #1352) — the long side, in pixels, to render a Layout frame's capture at: 300 dpi of the frame's printed
// size (elementW / elementH in page px at 96 dpi), at least 600 px, at most `max`. Every capture used to be 3,000 px long, so a
// 60 x 40 mm overview frame was drawn at a pixel ratio of up to 13 (points and labels overdrawn) and froze the window for seconds.
// No frame size (a capture that is not for a Layout frame): `max`.
export function captureLongPx(elementW, elementH, max = 3000) {
  if (!(elementW > 0)) return max;
  return Math.min(max, Math.max(600, Math.round((Math.max(elementW, elementH || 0) * 300) / 96)));
}

// TASKS.csv #1485 (review #1352, Silvertip) — a section snapshot is drawn so that its caption prints at `captionPt` when the image is
// `placedW` page px wide (theme PLACED_W; SectionWindow atPrintSize). Sized to another width on the page (a plot scale), its text
// prints at captionPt x width / placedW; a snapshot taken again with `textFactor` keeps that factor on the element.
// sectionTextPt(el) -> the caption's printed size at the element's width, or null
export function sectionTextPt(el, { captionPt = 7, placedW = 700 } = {}) {
  if (!el || !(el.w > 0)) return null;
  return +((captionPt * el.w * (el.textFactor || 1)) / placedW).toFixed(1);
}
// the factor a new snapshot needs so its caption prints at captionPt at the element's width
export function sectionTextFactor(el, { placedW = 700 } = {}) {
  return el && el.w > 0 ? +(placedW / el.w).toFixed(3) : 1;
}
