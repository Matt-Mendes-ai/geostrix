// Layout element links (TASKS.csv #909 / #920 / #924): a scale bar bound to a viewport or image, and an overview
// viewport showing another's footprint. Pure functions, out of LayoutModule.jsx so they can be tested (review #918).
import { niceScaleNumber } from "./figureScale.js";
import { obliqueCapture, capturedSize } from "./layoutGeometry.js";

const SCALE_BAR_PX = 180; // LayoutModule's default bar length (px) for a fresh bar

// TASKS.csv #909 — a scale bar assigned to a viewport follows that viewport's CURRENT scale (QGIS links its scale bar to
// the map): the bar used to keep the px-per-metre of the moment it was assigned, so a viewport re-captured at 1:30,000
// still showed the 1:5,000 bar beside it - the one thing on a plot nobody double-checks. A bar whose view is gone, or
// not captured yet, keeps its own ratio.
// TASKS.csv #920 — the bar keeps the length the user gave while it draws between BAR_MIN_PX and BAR_MAX_PX at the live
// scale; outside that it takes a round length near the default size. It used to keep its metres and be clamped to 20 px
// on screen, so a 200 m bar of a view re-captured at 1:50,000 printed 265 m long under a "200 m" label.
const BAR_MIN_PX = 40, BAR_MAX_PX = 600;
export function withLiveScaleBars(els) {
  return (els || []).map((el) => {
    if (el.type === "north" && el.boundTo) return liveNorth(el, els);
    if (el.type !== "scale" || !el.boundTo) return el;
    const vp = els.find((v) => v.id === el.boundTo);
    if (!vp) return el;
    const { w: imgW, h: imgH } = capturedSize(vp);
    let ppm = null;
    if (vp.type === "viewport" && vp.worldHeightAtTarget && imgH) ppm = imgH / vp.worldHeightAtTarget;
    else if (vp.type === "image" && vp.worldWidthAtCaptureM && imgW) ppm = imgW / vp.worldWidthAtCaptureM;
    if (!(ppm > 0)) return el;
    const px = (el.meters || 100) * ppm;
    // TASKS.csv #946 — an oblique (non-plan) orthographic capture is to scale in the view plane only: ground along the
    // line of sight is foreshortened, so the bar says which plane it measures
    const viewPlane = vp.type === "viewport" && obliqueCapture(vp);
    return { ...el, pxPerMeter: ppm, viewPlane, ...(px < BAR_MIN_PX || px > BAR_MAX_PX ? { meters: niceScaleNumber(SCALE_BAR_PX / ppm) } : {}) };
  });
}

// TASKS.csv #1632 (review #1497, Lawyers) — a north arrow tied to a view follows it as the bar does: its rotation is the view's
// camera azimuth plus the frame's own rotation on the sheet (#1477), at every refresh, fit, rescale or theme rebind. It was set
// once: after Fit the holes turned the frame north-up, the arrow still showed the first oblique capture's 45°. A view without
// a camera azimuth (an image, a section snapshot), or one that is gone, leaves the arrow as it was.
export const northRotationOf = (vp) => (vp && vp.cameraAzimuthDeg != null ? ((((vp.cameraAzimuthDeg + (Number(vp.rotation) || 0)) % 360) + 360) % 360) : null);
function liveNorth(el, els) {
  const deg = northRotationOf(els.find((v) => v.id === el.boundTo));
  return deg == null || deg === el.rotation ? el : { ...el, rotation: deg };
}

// TASKS.csv #1320 — the default page's scale bar and north arrow start tied to nothing: beside a view 10 km across the bar
// still printed "100 m", wrong by 100 times. The first view placed on the page takes them. A bar from Add scale bar has its
// own pxPerMeter, and a retyped length differs from the starter's 100 m: those were the user's choice and stay free.
export function tieStarterFurniture(els, view, { bar: wantBar = true, north: wantNorth = true } = {}) {
  const { w: imgW, h: imgH } = capturedSize(view);
  const ppm = view.type === "viewport" ? (view.worldHeightAtTarget && imgH ? imgH / view.worldHeightAtTarget : 0) : (view.worldWidthAtCaptureM && imgW ? imgW / view.worldWidthAtCaptureM : 0);
  const bar = wantBar && ppm > 0 ? els.find((el) => el.type === "scale" && !el.boundTo && !el.pxPerMeter && el.meters === 100) : null;
  const north = wantNorth && view.cameraAzimuthDeg != null ? els.find((el) => el.type === "north" && el.rotation == null) : null;
  if (!bar && !north) return els;
  return els.map((el) => {
    if (el === bar) return { ...el, boundTo: view.id, pxPerMeter: ppm, meters: niceScaleNumber(SCALE_BAR_PX / ppm) };
    if (el === north) return { ...el, rotation: northRotationOf(view), boundTo: view.id }; // #1632 — and follows it
    return el;
  });
}

// TASKS.csv #1634 (review #1497, Lawyers) — an element sent to another page takes what is bound to it (its scale bar, legend, overview
// frame, north arrow), relinked for a copy, and the destination's untouched starter bar / arrow then bind to it as for a fresh
// snapshot. A moved section used to leave its 200 m bar and legend beside the plan, while its new page printed a starter "100 m"
// bar that measured 238 m at 1:5,000. -> { from, to } element lists, or null when the element is not on `from`.
const boundToId = (el, id) => el.boundTo === id || el.boundViewportId === id || el.overviewOf === id;
export function sendElementWithFurniture(from, to, elementId, move, newId = (el) => `${el.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`) {
  const el = (from || []).find((e) => e.id === elementId);
  if (!el) return null;
  const deps = from.filter((e) => e.id !== elementId && boundToId(e, elementId));
  let sent = [el, ...deps];
  if (!move) {
    const idMap = new Map(sent.map((e) => [e.id, newId(e)]));
    sent = relinkCopies(sent.map((e) => ({ ...e, id: idMap.get(e.id) })), idMap, false).map((e) => ("boundViewportId" in e && idMap.has(e.boundViewportId) ? { ...e, boundViewportId: idMap.get(e.boundViewportId) } : e));
  }
  const view = sent[0];
  let dest = [...(to || []), ...sent];
  if (view.type === "viewport" || view.type === "image") dest = tieStarterFurniture(dest, view, { bar: !deps.some((e) => e.type === "scale"), north: !deps.some((e) => e.type === "north") });
  const sentIds = new Set([el.id, ...deps.map((e) => e.id)]);
  return { from: move ? from.filter((e) => !sentIds.has(e.id)) : from, to: dest };
}

// TASKS.csv #924 — copied elements get new ids, so a copied scale bar / overview must follow its copied viewport
// (idMap: old id -> new id). A link to an element that was not copied stays on the original when duplicating (a bar
// copied alone still measures the same view), and is dropped when loading a template (that element is not on the page).
export function relinkCopies(copies, idMap, dropOutside) {
  const relink = (id) => (id == null ? id : idMap.has(id) ? idMap.get(id) : dropOutside ? null : id);
  return copies.map((el) => ({ ...el, ...("boundTo" in el ? { boundTo: relink(el.boundTo) } : {}), ...("overviewOf" in el ? { overviewOf: relink(el.overviewOf) } : {}) }));
}
