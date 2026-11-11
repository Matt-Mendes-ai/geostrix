// Layout element links (TASKS.csv #909 / #920 / #924): a scale bar bound to a viewport or image, and an overview
// viewport showing another's footprint. Pure functions, out of LayoutModule.jsx so they can be tested (review #918).
import { niceScaleNumber } from "./figureScale.js";
import { obliqueCapture, capturedSize } from "./layoutGeometry.js";
import { pxPerMetre } from "./drillPlan.js"; // TASKS.csv #1639

const SCALE_BAR_PX = 180; // LayoutModule's default bar length (px) for a fresh bar

// TASKS.csv #909 — a scale bar assigned to a viewport follows that viewport's CURRENT scale (QGIS links its scale bar to
// the map): the bar used to keep the px-per-metre of the moment it was assigned, so a viewport re-captured at 1:30,000
// still showed the 1:5,000 bar beside it - the one thing on a plot nobody double-checks. A bar whose view is gone, or
// not captured yet, keeps its own ratio.
// TASKS.csv #920 — the bar keeps the length the user gave while it draws between BAR_MIN_PX and BAR_MAX_PX at the live
// scale; outside that it takes a round length near the default size. It used to keep its metres and be clamped to 20 px
// on screen, so a 200 m bar of a view re-captured at 1:50,000 printed 265 m long under a "200 m" label.
const BAR_MIN_PX = 40, BAR_MAX_PX = 600;
// On-page pixels per real metre of a captured viewport or a section / plan snapshot; null when it has no scale yet.
export function viewPxPerMetre(vp) {
  if (!vp) return null;
  const { w: imgW, h: imgH } = capturedSize(vp);
  const ppm = vp.type === "viewport" ? (vp.worldHeightAtTarget && imgH ? imgH / vp.worldHeightAtTarget : 0) : vp.type === "image" ? (vp.worldWidthAtCaptureM && imgW ? imgW / vp.worldWidthAtCaptureM : 0) : vp.type === "drillplan" ? pxPerMetre(vp.scale) : 0; // drillplan: #1639
  return ppm > 0 ? ppm : null;
}
// TASKS.csv #1635 (review #1497, Lawyers) — what a scale bar can be bound to on a page, and a new bar bound on insert: to the
// selected view, else the page's only one. Insert > Scale bar used to add a free '100 m' at an implied 1:2,117 over a 1:20,000
// plan (the bar measured 952 m). With no view or several and none selected the bar stays free and its sidebar says so.
export const scaleBarTargets = (els) => (els || []).filter((e) => viewPxPerMetre(e) != null);
export function bindScaleBar(bar, view) {
  const ppm = viewPxPerMetre(view);
  return ppm ? { ...bar, boundTo: view.id, pxPerMeter: ppm, meters: niceScaleNumber(SCALE_BAR_PX / ppm) } : { ...bar, boundTo: null };
}
export function insertScaleBar(base, els, selectedId) {
  const ts = scaleBarTargets(els);
  const view = ts.find((v) => v.id === selectedId) || (ts.length === 1 ? ts[0] : null);
  return view ? { ...bindScaleBar(base, view), x: view.x, y: view.y + (view.h || 0) + 14 } : base;
}
export function withLiveScaleBars(els) {
  return (els || []).map((el) => {
    if (el.type === "north" && el.boundTo) return liveNorth(el, els);
    if (el.type !== "scale" || !el.boundTo) return el;
    const vp = els.find((v) => v.id === el.boundTo);
    if (!vp) return el;
    const ppm = viewPxPerMetre(vp); // #1639 — one rule for viewports, snapshots and drill plans
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
// TASKS.csv #1489 (review #1352) — a north arrow on a vertical-section page means nothing; a section snapshot that is the page's
// view replaces the untouched starter arrow with the direction the section is seen in ("Looking N25°E": the section is drawn
// with its start on the left, so the viewer faces its azimuth - 90°). English: it is page text, saved with the project.
export function bearingText(az) {
  const a = ((Math.round(Number(az)) % 360) + 360) % 360;
  if (a === 0) return "N";
  if (a === 90) return "E";
  if (a === 180) return "S";
  if (a === 270) return "W";
  return a < 90 ? `N${a}°E` : a < 180 ? `S${180 - a}°E` : a < 270 ? `S${a - 180}°W` : `N${360 - a}°W`;
}
export const sectionLookText = (sectionAzimuth) => `Looking ${bearingText(Number(sectionAzimuth) - 90)}`;
export function tieStarterFurniture(els, view, { bar: wantBar = true, north: wantNorth = true } = {}) {
  if (wantNorth && view?.type === "image" && !view.planMap && Number.isFinite(view.sectionAzimuth)) {
    const starter = els.find((el) => el.type === "north" && el.rotation == null && !el.boundTo);
    if (starter) els = els.map((el) => (el === starter ? { id: `look_${view.id}`, type: "text", x: Math.max(0, (el.x || 0) - 60), y: el.y || 40, w: 160, text: sectionLookText(view.sectionAzimuth), boundTo: view.id } : el));
  }
  const { w: imgW, h: imgH } = capturedSize(view);
  const ppm = view.type === "viewport" ? (view.worldHeightAtTarget && imgH ? imgH / view.worldHeightAtTarget : 0) : view.type === "drillplan" ? pxPerMetre(view.scale) /* #2302 */ : (view.worldWidthAtCaptureM && imgW ? imgW / view.worldWidthAtCaptureM : 0);
  const bar = wantBar && ppm > 0 ? els.find((el) => el.type === "scale" && !el.boundTo && !el.pxPerMeter && el.meters === 100) : null;
  // TASKS.csv #2606 (review #2486) — an oblique view added to a page that already holds a map (a drill plan, or a true-scale plan viewport)
  // took the page's north arrow (turned 45 degrees beside a north-up plan): the arrow stays with the map
  const pageHasMap = els.some((el) => el !== view && (el.type === "drillplan" || (el.type === "viewport" && el.planView && el.trueScale)));
  const north = wantNorth && view.cameraAzimuthDeg != null && !(pageHasMap && obliqueCapture(view)) ? els.find((el) => el.type === "north" && el.rotation == null) : null;
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
  let deps = from.filter((e) => e.id !== elementId && boundToId(e, elementId));
  // the page's own starter bar / arrow (fixed ids "scale" / "north") tied to this view by its snapshot: on a move they stay on
  // their page, untied, when the destination has an untouched starter of that type (which then ties to the view); when the
  // destination's starter is already someone else's, they travel under a new id, so no page holds two elements of one id
  let kept = [];
  const origDepIds = deps.map((e) => e.id); // removed from the source whatever id they travel under
  if (move) {
    const untouched = (e) => (e.type === "scale" ? !e.boundTo && !e.pxPerMeter && e.meters === 100 : e.type === "north" ? e.rotation == null : false);
    const untie = (e) => (e.type === "scale" ? { ...e, boundTo: null, pxPerMeter: undefined, meters: 100 } : { ...e, boundTo: null, rotation: null });
    deps = deps.flatMap((e) => {
      const twin = (to || []).find((t) => t.id === e.id);
      if (!twin) return [e];
      if ((e.type === "scale" || e.type === "north") && untouched(twin)) { kept.push(untie(e)); return []; }
      return [{ ...e, id: newId(e) }];
    });
  }
  let sent = [el, ...deps];
  if (!move) {
    const idMap = new Map(sent.map((e) => [e.id, newId(e)]));
    sent = relinkCopies(sent.map((e) => ({ ...e, id: idMap.get(e.id) })), idMap, false).map((e) => ("boundViewportId" in e && idMap.has(e.boundViewportId) ? { ...e, boundViewportId: idMap.get(e.boundViewportId) } : e));
  }
  const view = sent[0];
  let dest = [...(to || []), ...sent];
  if (view.type === "viewport" || view.type === "image") dest = tieStarterFurniture(dest, view, { bar: !deps.some((e) => e.type === "scale"), north: !deps.some((e) => e.type === "north") });
  const keptById = new Map(kept.map((e) => [e.id, e])), sentIds = new Set([el.id, ...origDepIds.filter((id) => !keptById.has(id))]);
  return { from: move ? from.filter((e) => !sentIds.has(e.id)).map((e) => keptById.get(e.id) || e) : from, to: dest };
}

// TASKS.csv #924 — copied elements get new ids, so a copied scale bar / overview must follow its copied viewport
// (idMap: old id -> new id). A link to an element that was not copied stays on the original when duplicating (a bar
// copied alone still measures the same view), and is dropped when loading a template (that element is not on the page).
export function relinkCopies(copies, idMap, dropOutside) {
  const relink = (id) => (id == null ? id : idMap.has(id) ? idMap.get(id) : dropOutside ? null : id);
  return copies.map((el) => ({ ...el, ...("boundTo" in el ? { boundTo: relink(el.boundTo) } : {}), ...("overviewOf" in el ? { overviewOf: relink(el.overviewOf) } : {}) }));
}
