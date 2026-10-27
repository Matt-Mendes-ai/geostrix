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

// the {scale} placeholder: the page's first fixed-scale viewport, else its first captured one; an oblique capture says
// which plane the ratio holds in (#946)
export function pageScaleText(els) {
  const list = els || [];
  const v = list.find((e) => e.type === "viewport" && e.trueScale && e.capturedFixedScale > 0) || list.find((e) => e.type === "viewport" && metresPerPagePx(e));
  if (!v) return "";
  const text = v.trueScale && v.capturedFixedScale > 0 ? `1 : ${v.capturedFixedScale.toLocaleString()}` : `${v.trueScale ? "" : "~"}1 : ${Math.round(metresPerPagePx(v) / M_PER_PAGE_PX).toLocaleString()}`;
  return obliqueCapture(v) ? tr("{scale} in the view plane (oblique view)", { scale: text }) : text;
}

// TASKS.csv #399 — a top-down, true-scale (orthographic) capture: every pixel is the same size on the ground
export function utmGridReady(el) {
  return !!(el.planView && el.trueScale && el.targetWorld && el.worldHeightAtTarget && el.h && el.w);
}
export function niceGridStep(span) {
  const raw = span / 5, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
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
