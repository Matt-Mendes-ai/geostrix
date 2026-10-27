// Layout element links (TASKS.csv #909 / #920 / #924): a scale bar bound to a viewport or image, and an overview
// viewport showing another's footprint. Pure functions, out of LayoutModule.jsx so they can be tested (review #918).
import { niceScaleNumber } from "./figureScale.js";

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
    if (el.type !== "scale" || !el.boundTo) return el;
    const vp = els.find((v) => v.id === el.boundTo);
    const imgH = vp?.capH || vp?.h, imgW = vp?.capW || vp?.w;
    if (!vp) return el;
    let ppm = null;
    if (vp.type === "viewport" && vp.worldHeightAtTarget && imgH) ppm = imgH / vp.worldHeightAtTarget;
    else if (vp.type === "image" && vp.worldWidthAtCaptureM && imgW) ppm = imgW / vp.worldWidthAtCaptureM;
    if (!(ppm > 0)) return el;
    const px = (el.meters || 100) * ppm;
    return { ...el, pxPerMeter: ppm, ...(px < BAR_MIN_PX || px > BAR_MAX_PX ? { meters: niceScaleNumber(SCALE_BAR_PX / ppm) } : {}) };
  });
}

// TASKS.csv #924 — copied elements get new ids, so a copied scale bar / overview must follow its copied viewport
// (idMap: old id -> new id). A link to an element that was not copied stays on the original when duplicating (a bar
// copied alone still measures the same view), and is dropped when loading a template (that element is not on the page).
export function relinkCopies(copies, idMap, dropOutside) {
  const relink = (id) => (id == null ? id : idMap.has(id) ? idMap.get(id) : dropOutside ? null : id);
  return copies.map((el) => ({ ...el, ...("boundTo" in el ? { boundTo: relink(el.boundTo) } : {}), ...("overviewOf" in el ? { overviewOf: relink(el.overviewOf) } : {}) }));
}
