// TASKS.csv #3491 (follow-up of #3484) — Layout asks the Maps plan for a fresh picture of a placed Maps snapshot at the frame's own size and dpi, as it asks the
// 3D View for a viewport (#1479): a snapshot dragged larger on the sheet stays sharp. The picture is drawn again over the SAME ground and centre
// (the plan's metres per pixel recorded with the snapshot, `mapsCapture`) at the frame's aspect, so the frame's scale and its labelled grid do not move.
// The plan is not mounted while Layout shows, so the request is kept for the plan that mounts next (as planZoom.js does). Pure but for the hook.
import { useEffect, useRef } from "react";

const EVENT = "geostrix-plan-recapture";
const PENDING_MS = 30000; // the Maps chunk can be slow to arrive on a cold start
let pending = null; // { spec, at }

export function requestPlanRecapture(spec) {
  pending = { spec, at: Date.now() };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { spec } }));
}

export function usePlanRecapture(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const on = (e) => { pending = null; ref.current(e.detail.spec); };
    window.addEventListener(EVENT, on);
    if (pending && Date.now() - pending.at < PENDING_MS) { const s = pending.spec; pending = null; ref.current(s); }
    return () => window.removeEventListener(EVENT, on);
  }, []);
}

export const RECAPTURE_DPI = 300;
const MAX_PIXELS = 36e6, MAX_SIDE = 16000; // the same ceiling as the snapshot itself (#3484), and a canvas side every engine allows

// the dpi a placed picture prints at: its pixels over its frame's printed width (page px are 96 per inch)
export const pictureDpi = (el) => (el?.naturalW > 0 && el?.w > 0 ? (el.naturalW * 96) / el.w : null);

// What a placed Maps snapshot can be redrawn at, from the element alone.
//   { ok: false, reason: "old" }    no plan scale kept with it (sent before this existed): send it again from Maps
//   { ok: false, reason: "sharp", dpi }  it already prints at the dpi asked
//   { ok: true, elementId, view, w, h, ratio, pxW, pxH, capped, dpi }
// w x h: the plan's CSS size to draw (the snapshot's own width at the frame's aspect); ratio: the pixel ratio that makes the frame's printed width
// `dpi` (reduced to keep within the pixel ceiling: capped).
// TASKS.csv #3828 — the plan's text is drawn in screen pixels (a hole id 10 px, a pad call-out in its box): a 1,614 px plan placed in a 185 mm frame printed its hole ids at about 3 pt.
// printTextPt: the size the text prints at, in points (a 10 px label, 0.75 pt a pixel, scaled by the frame over the plan's CSS width); null when the element has no plan scale kept
export const PLAN_TEXT_PX = 10;
export function printTextPt(el) { const mc = el?.mapsCapture; return mc?.cssW > 0 && el?.w > 0 ? +((PLAN_TEXT_PX * 0.75 * el.w) / mc.cssW).toFixed(1) : null; }
// printText: the plan is drawn at the FRAME's own CSS size (page px are 96 an inch) over the same ground, so its labels print at their screen size (10 px = 7.5 pt) and the call-outs are laid out at that size
export function recaptureSpec(el, dpi = RECAPTURE_DPI, { printText = false } = {}) {
  const mc = el?.mapsCapture;
  if (!el?.mapsView || !(mc?.mPerPx > 0) || !(mc?.cssW > 0) || !(el.w > 0) || !(el.h > 0) || !el.targetWorld || !Number.isFinite(el.targetWorld.x) || !Number.isFinite(el.targetWorld.y)) return { ok: false, reason: "old" };
  if (printText) {
    const w = Math.max(1, Math.round(el.w)), h = Math.max(1, Math.round(el.h));
    let ratio = dpi / 96, capped = false;
    const limit = Math.min(Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / Math.max(w, h));
    if (ratio > limit) { ratio = limit; capped = true; }
    return { ok: true, textPrint: true, elementId: el.id, view: { cx: el.targetWorld.x, cy: el.targetWorld.y, mPerPx: (mc.mPerPx * mc.cssW) / w }, w, h, ratio, pxW: Math.round(w * ratio), pxH: Math.round(h * ratio), capped, dpi: Math.round(ratio * 96) };
  }
  const have = pictureDpi(el);
  if (have != null && have >= dpi * 0.95) return { ok: false, reason: "sharp", dpi: have };
  const w = mc.cssW, h = Math.max(1, Math.round((mc.cssW * el.h) / el.w));
  let ratio = (el.w * dpi) / 96 / w, capped = false;
  const limit = Math.min(Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / Math.max(w, h));
  if (ratio > limit) { ratio = limit; capped = true; }
  if (have != null && ratio * w <= el.naturalW) return { ok: false, reason: "sharp", dpi: have }; // the ceiling leaves nothing to gain
  return { ok: true, elementId: el.id, view: { cx: el.targetWorld.x, cy: el.targetWorld.y, mPerPx: mc.mPerPx }, w, h, ratio, pxW: Math.round(w * ratio), pxH: Math.round(h * ratio), capped, dpi: Math.round(((w * ratio) * 96) / el.w) };
}

// the fields of the element a fresh payload (lib/mapSnapshot.js) replaces: the picture, its pixels and what is derived from the view; the frame, the label and the
// element's own settings stay
export function recaptureFields(payload) {
  const { src, naturalW, naturalH, worldWidthAtCaptureM, worldHeightAtTarget, targetWorld, legendItems, mapsCapture } = payload;
  return { src, naturalW, naturalH, aspect: naturalW / naturalH, worldWidthAtCaptureM, worldHeightAtTarget, targetWorld, legendItems: legendItems || null, mapsCapture };
}
