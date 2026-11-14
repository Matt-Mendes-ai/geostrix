// TASKS.csv #1625 (review #1497, Lawyers) — a plan of the Maps tab's own data in its main pane. It showed a fixed card ('switch tabs
// to see them'), so every raster, terrain or boundary edit was made blind and checked by a trip to the 3D View (1.5-36 s on Lawyers).
// A light 2D canvas, north up: the terrain's hillshade, the rasters at their extents (opacity, transparent colour #1623), the map
// layers, boundaries, collars and surface samples; wheel to zoom, drag to pan, Fit, the cursor's E / N and a scale bar. Pictures are
// decoded once and map layers drawn once per style into a cached bitmap, so a pan redraws bitmaps; the 3D scene is not touched.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { niceScaleBar } from "../lib/surfacePlan.js";
import { hillshadeRGBA } from "../lib/hillshade.js"; // TASKS.csv #2990 — the no-data cells transparent
import { decodeNoDataMask } from "../lib/demFill.js"; // TASKS.csv #2990
import { drawMapLayer, mapStyleSignature, mapTextureSize } from "../lib/mapLayers.js";
import { keyedCanvas } from "../lib/rasterKey.js";
import { planDataExtent, planFarLayers } from "../lib/mapsPlan.js"; // planFarLayers: TASKS.csv #2125
import { figureSamples, colourFromStops } from "../lib/sampleGrid.js"; // TASKS.csv #1622
import { collarColourFields, perHoleAssay, collarColouring, declutterLabels } from "../lib/collarMapStyle.js"; // TASKS.csv #2459
import { collarSpacing, dotStyle, dotsInView, drawDots, polylineInView } from "../lib/planDots.js"; // TASKS.csv #2988 / #2989
import HoleValueGridPanel from "./HoleValueGridPanel.jsx"; // TASKS.csv #2658
import { planGridStep, planGridLines, gridLabel, measureLine, distanceText } from "../lib/planGrid.js"; // TASKS.csv #2128
import { trueNorthBearingInGridDeg } from "../lib/inversion.js"; // TASKS.csv #2128 — the convergence at the measured line
import { usePlanZoom, viewForBox } from "../lib/planZoom.js"; // TASKS.csv #2657
import { usePlanGt, showGtOnPlan, gtRadius, gtLegend } from "../lib/planGt.js"; // TASKS.csv #2755
import { topRasterValueAt } from "../lib/planRasterValue.js"; // TASKS.csv #2853 — the value under the cursor
import { perHoleValuesOf } from "../lib/holeValueGrid.js"; // TASKS.csv #2658; perHoleValuesOf: #2991 (a coded log's values too)

const imageCache = new Map(); // dataUrl (+ key colour) -> { img, ready }
function cachedImage(url, keyColour, onReady) {
  const k = keyColour ? `${keyColour}|${url}` : url;
  let e = imageCache.get(k);
  if (!e) {
    e = { img: null, ready: false };
    imageCache.set(k, e);
    const im = new Image();
    im.onload = () => { e.img = keyColour ? keyedCanvas(im, keyColour) : im; e.ready = true; onReady(); };
    im.src = url;
    if (imageCache.size > 64) imageCache.delete(imageCache.keys().next().value);
  }
  return e.ready ? e.img : null;
}

function hillshadeCanvas(t) {
  const c = document.createElement("canvas");
  c.width = t.gridW; c.height = t.gridH;
  const ctx = c.getContext("2d"), img = ctx.createImageData(t.gridW, t.gridH);
  img.data.set(hillshadeRGBA(t, decodeNoDataMask(t.noDataMask))); // #2990 — filled (no-data) cells left transparent
  ctx.putImageData(img, 0, 0);
  return c;
}


// TASKS.csv #2853 — the top visible grid's value at the cursor, after the E / N
const cursorValueText = (rasters, c) => { const t = topRasterValueAt(rasters, c.x, c.y); return t ? `  ·  ${t.name.length > 28 ? `…${t.name.slice(-27)}` : t.name}: ${t.value.toLocaleString(undefined, { maximumSignificantDigits: 4 })}${t.unit ? ` ${t.unit}` : ""}` : ""; };
export default function MapsPlanView() {
  const { rasters = [], terrain, mapLayers = [], boundaries = [], collars = [], surfaceSamples = [], assays = [], assayElements = [], layers = {}, customLayers = [], project, survey = [], desurveyMethod, addLayoutImage, goToModule } = useStore(); // addLayoutImage / goToModule: #3194 // assays: #2459; layers, customLayers: #2658; project: #2128; survey, desurveyMethod: #2991 (a coded RL figure)
  const wrapRef = useRef(null), canvasRef = useRef(null), layerCache = useRef(new Map()), drag = useRef(null), gridDrawn = useRef(false); // gridDrawn: #3194
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState(null); // { cx, cy, mPerPx }
  const [cursor, setCursor] = useState(null);
  const [tick, setTick] = useState(0); // an image finished decoding
  const extent = useMemo(() => planDataExtent({ rasters, terrain, mapLayers, boundaries, collars, surfaceSamples }), [rasters, terrain, mapLayers, boundaries, collars, surfaceSamples]);
  const farLayers = useMemo(() => planFarLayers({ rasters, terrain, mapLayers, boundaries, collars }), [rasters, terrain, mapLayers, boundaries, collars]); // #2125
  // TASKS.csv #2459 / #2591 — collars coloured by a collar field or a per-hole assay statistic, and labelled with their ids
  const [colourBy, setColourBy] = useState(""); // "" | "f:<field>" | "max:<element>" | "mean:<element>"
  const [showIds, setShowIds] = useState(false);
  // TASKS.csv #2755 — 3D Modelling > Grade × thickness in plan's per-hole totals, sent with 'Show on the Maps plan': circles sized by GT
  const gtPlan = usePlanGt();
  const gtMax = useMemo(() => { let m = 0; for (const h of gtPlan?.holes || []) if (h.gt > m) m = h.gt; return m; }, [gtPlan]);
  // TASKS.csv #2128 — a coordinate grid (on by default) and a two-click measure (session state)
  const [showGrid, setShowGrid] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [mPts, setMPts] = useState([]);
  const colourFields = useMemo(() => collarColourFields(collars), [collars]);
  const spacingM = useMemo(() => collarSpacing(collars), [collars]); // #2989 — the holes' typical spacing, for the dot size
  const colouring = useMemo(() => {
    if (!colourBy) return null;
    const [kind, key] = [colourBy.slice(0, colourBy.indexOf(":")), colourBy.slice(colourBy.indexOf(":") + 1)];
    return kind === "f" ? collarColouring(collars, { field: key }) : collarColouring(collars, { values: perHoleAssay(assays, key, kind) });
  }, [colourBy, collars, assays]);
  const hill = useMemo(() => (terrain?.elevations?.length && terrain.gridW > 2 ? hillshadeCanvas(terrain) : null), [terrain]);
  // TASKS.csv #1622 (review #1497) — a gridded surface-sample element in one figure: the top visible geochemistry grid, its samples
  // drawn on top in the grid's own colours (a sample's colour against the grid around it shows what the gridding did), its contour
  // layers, and a legend with the method and its parameters
  const figure = useMemo(() => {
    const r = [...rasters].reverse().find((x) => x.visible !== false && x.geochem && x.colourStops?.length);
    if (!r) return null;
    const contours = boundaries.filter((b) => b.visible !== false && b.contourLevels?.length && (b.sourceRaster === r.id || (!b.sourceRaster && String(b.name || "").startsWith(`${r.name} contours`))));
    const levels = [...new Set(contours.flatMap((b) => b.contourLevels))].sort((a, b) => a - b);
    return { r, pts: r.geochem.source === "holes" ? holeFigurePoints(r.geochem, { collars, assays, assayElements, layers, customLayers, survey, desurveyMethod }) : figureSamples(surfaceSamples, r.geochem), log: r.colourStyle?.stretch === "log", levels }; // holes: #2658
  }, [rasters, boundaries, surfaceSamples, collars, assays, assayElements, layers, customLayers, survey, desurveyMethod]); // survey, desurveyMethod: #2991

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!extent]); // the frame exists only once there is data
  const fit = () => { if (extent) setView({ cx: (extent[0] + extent[2]) / 2, cy: (extent[1] + extent[3]) / 2, mPerPx: Math.max((extent[2] - extent[0]) / size.w, (extent[3] - extent[1]) / size.h) * 1.08 }); };
  usePlanZoom((bbox) => setView(viewForBox(bbox, size.w, size.h))); // #2657 — a card's 'Zoom to'
  const v = view || (extent ? { cx: (extent[0] + extent[2]) / 2, cy: (extent[1] + extent[3]) / 2, mPerPx: Math.max((extent[2] - extent[0]) / size.w, (extent[3] - extent[1]) / size.h) * 1.08 } : null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !v) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(size.w * dpr); cv.height = Math.round(size.h * dpr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#f4f5f2"; ctx.fillRect(0, 0, size.w, size.h);
    const left = v.cx - (size.w / 2) * v.mPerPx, top = v.cy + (size.h / 2) * v.mPerPx;
    const X = (x) => (x - left) / v.mPerPx, Y = (y) => (top - y) / v.mPerPx;
    const drawAt = (img, b, alpha = 1) => { if (!img) return; ctx.globalAlpha = alpha; ctx.drawImage(img, X(b[0]), Y(b[3]), (b[2] - b[0]) / v.mPerPx, (b[3] - b[1]) / v.mPerPx); ctx.globalAlpha = 1; };
    const redraw = () => setTick((t) => t + 1);
    if (hill) drawAt(hill, terrain.bbox, 0.9);
    rasters.forEach((r) => { if (r.visible !== false && r.dataUrl && r.bbox) drawAt(cachedImage(r.dataUrl, !r.grid ? r.keyColour : null, redraw), r.bbox, r.opacity ?? 0.85); });
    mapLayers.forEach((l) => {
      if (l.visible === false || !l.bbox || !l.features?.length) return;
      const sig = mapStyleSignature(l), hit = layerCache.current.get(l.id);
      let c = hit && hit.sig === sig ? hit.canvas : null;
      if (!c) {
        const long = Math.max(l.bbox[2] - l.bbox[0], l.bbox[3] - l.bbox[1]);
        const { width, height } = mapTextureSize(l.bbox, { targetMetresPerPixel: Math.max(0.5, long / 2048), maxSize: 2048 });
        c = document.createElement("canvas"); c.width = width; c.height = height;
        drawMapLayer(c.getContext("2d"), l, l.bbox, width, height);
        layerCache.current.set(l.id, { sig, canvas: c });
      }
      drawAt(c, l.bbox, l.opacity ?? 0.6);
    });
    if (showGrid) { // #2128 — light lines at a round spacing, labelled on the top and left edges
      const step = planGridStep(v.mPerPx), { xs, ys } = planGridLines({ left, top, w: size.w, h: size.h, mPerPx: v.mPerPx }, step);
      ctx.strokeStyle = "rgba(30,40,52,0.16)"; ctx.lineWidth = 1;
      ctx.beginPath();
      xs.forEach((x) => { const px = Math.round(X(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, size.h); });
      ys.forEach((y) => { const py = Math.round(Y(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(size.w, py); });
      ctx.stroke();
      ctx.font = "10px sans-serif"; ctx.fillStyle = "rgba(30,40,52,0.7)"; ctx.textBaseline = "top";
      xs.forEach((x) => ctx.fillText(gridLabel(x, "E"), X(x) + 3, 3));
      ctx.textBaseline = "bottom";
      ys.forEach((y) => ctx.fillText(gridLabel(y, "N"), 3, Y(y) - 2));
    }
    ctx.lineJoin = "round";
    // TASKS.csv #2988 — the lines in view only (each line's box computed once), one path and one stroke per boundary
    const viewBox = [left, top - size.h * v.mPerPx, left + size.w * v.mPerPx, top];
    boundaries.forEach((b) => {
      if (b.visible === false) return;
      ctx.strokeStyle = b.color || "#e2a63c"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      (b.polylines || []).forEach((pl) => { if (pl.length < 2 || !polylineInView(pl, viewBox)) return; pl.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); });
      ctx.stroke();
      // TASKS.csv #3234 — the parts' names at each part's centre, when the boundary's row asks for them (#2673's 'Label the parts'), as in 3D
      if (b.partLabels && b.partNames?.some(Boolean)) {
        ctx.save(); ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "#1a2028";
        (b.polylines || []).forEach((pl, i) => {
          const name = b.partNames[i];
          if (!name || !pl?.length || !polylineInView(pl, viewBox)) return;
          let sx = 0, sy = 0; for (const q of pl) { sx += q.x; sy += q.y; }
          const cx = X(sx / pl.length), cy = Y(sy / pl.length);
          ctx.strokeText(String(name), cx, cy); ctx.fillText(String(name), cx, cy);
        });
        ctx.restore();
      }
    });
    ctx.fillStyle = "rgba(90,96,104,0.55)";
    surfaceSamples.forEach((s) => { if (Number.isFinite(s.x)) ctx.fillRect(X(s.x) - 1, Y(s.y) - 1, 2, 2); });
    if (figure) {
      ctx.lineWidth = 0.8; ctx.strokeStyle = "rgba(20,24,30,0.85)";
      const rad = Math.max(2.2, Math.min(4.5, 3 * Math.sqrt(30 / Math.max(1, v.mPerPx)))); // smaller when zoomed out
      for (const q of figure.pts) {
        const c = colourFromStops(figure.r.colourStops, q.v, figure.log);
        if (!c) continue;
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    // TASKS.csv #2988 / #2989 — the dots in view only, one path per colour (was a beginPath / fill / stroke per hole); the dot shrinks with the
    // holes' spacing on screen and loses its outline when the dots would touch (#2459: a hole with no value under the colouring: a grey ring)
    const ds = dotStyle(spacingM, v.mPerPx, !!colouring);
    drawDots(ctx, dotsInView(collars, colouring ? (c) => colouring.colourOf(c) : () => "#1a2028", X, Y, size.w, size.h, ds.r + 1), { ...ds, stroke: colouring ? "#1a2028" : "#ffffff" });
    if (gtPlan && gtMax > 0) { // #2755 — at each hole's intercept position (holeTotals: their length-weighted mid-points), area in proportion to GT
      ctx.lineWidth = 1;
      for (const h of gtPlan.holes) {
        if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
        const r = gtRadius(h.gt, gtMax);
        ctx.beginPath(); ctx.arc(X(h.x), Y(h.y), r ?? 3, 0, Math.PI * 2);
        if (r) { ctx.fillStyle = "rgba(194,65,12,0.55)"; ctx.fill(); }
        ctx.strokeStyle = "#7c2d12"; ctx.stroke(); // a hole assayed with no intercept: a hollow ring (GT 0)
      }
    }
    if (showIds) { // #2459 — the hole ids, decluttered: a label that would overlap one already drawn is left out
      ctx.font = "10px sans-serif"; ctx.textBaseline = "middle"; ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.fillStyle = "#1a2028";
      const pts = collars.map((c) => (Number.isFinite(c.x) ? { x: X(c.x), y: Y(c.y) } : null)).map((p) => (p && p.x > -60 && p.y > -10 && p.x < size.w + 10 && p.y < size.h + 10 ? p : { x: NaN, y: NaN }));
      const w = Math.min(90, 8 + Math.max(0, ...collars.slice(0, 500).map((c) => ctx.measureText(String(c.hole_id ?? "")).width)));
      for (const l of declutterLabels(pts, w, 13)) { const t = String(collars[l.i].hole_id ?? ""); ctx.strokeText(t, l.x + 5, l.y); ctx.fillText(t, l.x + 5, l.y); }
    }
    if (measuring && mPts.length) { // #2128 — the measured line
      ctx.strokeStyle = "#c2185b"; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); mPts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#c2185b"; mPts.forEach((p) => { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 3.5, 0, Math.PI * 2); ctx.fill(); });
    }
    gridDrawn.current = showGrid; // #3194 — what the canvas holds now
  }, [v?.cx, v?.cy, v?.mPerPx, size, rasters, terrain, hill, mapLayers, boundaries, collars, surfaceSamples, tick, figure, colouring, spacingM /* #2989 */, showIds, showGrid, measuring, mPts, gtPlan, gtMax]); // gtPlan: #2755

  if (!extent || !v) return null;
  const sb = niceScaleBar(v.mPerPx, 140);
  const toWorld = (px, py) => ({ x: v.cx + (px - size.w / 2) * v.mPerPx, y: v.cy - (py - size.h / 2) * v.mPerPx });
  const onWheel = (e) => {
    const r = canvasRef.current.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, at = toWorld(px, py);
    const m = v.mPerPx * (e.deltaY > 0 ? 1.2 : 1 / 1.2);
    setView({ mPerPx: m, cx: at.x - (px - size.w / 2) * m, cy: at.y + (py - size.h / 2) * m });
  };
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }; };
  // #2128 — a click (not a drag) while measuring sets a point; a third click starts a new line
  const measureClick = (e) => {
    const d = drag.current;
    if (!measuring || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    const r = canvasRef.current.getBoundingClientRect(), p = toWorld(e.clientX - r.left, e.clientY - r.top);
    setMPts((q) => (q.length >= 2 ? [p] : [...q, p]));
  };
  const onMove = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    setCursor(toWorld(e.clientX - r.left, e.clientY - r.top));
    const d = drag.current;
    if (d) setView({ mPerPx: v.mPerPx, cx: d.cx - (e.clientX - d.x) * v.mPerPx, cy: d.cy + (e.clientY - d.y) * v.mPerPx });
  };
  const onUp = (e) => { if (e) measureClick(e); drag.current = null; };
  // #2128 — the measured line's distance and grid bearing, and where true north is there (a projected project CRS only)
  const measured = measuring && mPts.length === 2 ? (() => {
    const m = measureLine(mPts[0], mPts[1]);
    const conv = project?.crsSet !== false && project?.epsg ? trueNorthBearingInGridDeg((mPts[0].x + mPts[1].x) / 2, (mPts[0].y + mPts[1].y) / 2, project.epsg) : null;
    return { ...m, conv: Number.isFinite(conv) ? conv : null };
  })() : null;
  // TASKS.csv #3194 (Matt) — the view as it is on screen, to the Layout page (lib/mapSnapshot.js, loaded on use): north up, at its scale,
  // with its centre and extent for Layout's scale bar and coordinate grid, and a legend of what it draws
  const toLayout = async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const { mapSnapshotPayload } = await import("../lib/mapSnapshot.js");
    // the plan's own grid is left off the picture (its labels shrink with it): Layout draws a labelled one at the sheet's scale, ticked when
    // the plan's was on. The canvas is redrawn without it, captured, and the grid put back.
    const hadGrid = showGrid;
    if (hadGrid) {
      setShowGrid(false);
      for (let i = 0; i < 30 && gridDrawn.current; i++) await new Promise((r) => requestAnimationFrame(r));
    }
    const collarTitle = colouring ? (colourBy.startsWith("f:") ? colourBy.slice(2) : colourBy.replace(/^(max|mean):/, "")) : "";
    const src = cv.toDataURL("image/png");
    if (hadGrid) setShowGrid(true);
    addLayoutImage({ ...mapSnapshotPayload({ src, pxW: cv.width, pxH: cv.height, view: v, size, mapLayers, boundaries, rasters, collarLegend: colouring?.legend || null, collarTitle, collars: collars.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y)).length, samples: surfaceSamples.filter((s) => Number.isFinite(s.x)).length, label: project?.name ? `Map view: ${project.name}` : "Map view" }), utmGrid: hadGrid });
    goToModule("layout");
  };
  const chip = { position: "absolute", background: "rgba(255,255,255,0.9)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 7px", fontSize: "var(--font-size-sm)", color: "#1a2028" };
  return (
    <div ref={wrapRef} className="ge-maps-plan" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h, display: "block", cursor: drag.current ? "grabbing" : "crosshair" }} aria-label={tr("Plan of the map data")}
        onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setCursor(null); }} onDoubleClick={measuring ? undefined : fit /* #2128 — a double-click while measuring sets points */} />
      {figure && <FigureLegend f={figure} chip={chip} />}
      {collars.length > 0 && ( /* TASKS.csv #2459 / #2591 — the collars' colour and labels, and their legend */
        <div style={{ ...chip, left: 10, top: 10, maxWidth: 270, display: "flex", flexDirection: "column", gap: 4, lineHeight: 1.35 }} onMouseDown={(e) => e.stopPropagation()}>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {tr("Collars")}
            <select value={colourBy} onChange={(e) => setColourBy(e.target.value)} aria-label={tr("Colour collars by")} style={{ fontSize: "var(--font-size-sm)", flex: 1, minWidth: 0 }}>
              <option value="">{tr("One colour")}</option>
              {colourFields.length > 0 && <optgroup label={tr("Collar field")}>{colourFields.map((f) => <option key={f.key} value={`f:${f.key}`}>{f.key}</option>)}</optgroup>}
              {assayElements.length > 0 && <optgroup label={tr("Per hole, from the assays")}>
                {assayElements.flatMap((e) => [<option key={`max:${e.symbol}`} value={`max:${e.symbol}`}>{tr("Highest {el} in the hole", { el: e.symbol })}</option>, <option key={`mean:${e.symbol}`} value={`mean:${e.symbol}`}>{tr("{el}, length-weighted mean of the hole", { el: e.symbol })}</option>])}
              </optgroup>}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="checkbox" checked={showIds} onChange={(e) => setShowIds(e.target.checked)} />{tr("Hole ids")}</label>
          <HoleValueGridPanel /> {/* TASKS.csv #2658 */}
          {gtPlan && gtMax > 0 && ( /* TASKS.csv #2755 */
            <div aria-label={tr("Grade × thickness legend")} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", fontVariantNumeric: "tabular-nums" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("GT per hole ({u}), from 3D Modelling > Grade × thickness in plan", { u: gtPlan.label })}
                <button type="button" onClick={() => showGtOnPlan(null)} style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>{tr("Clear")}</button></span>
              <span style={{ color: "var(--color-text-muted)" }}>{gtPlan.title}</span>
              <span style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                {gtLegend(gtMax).map((l) => <span key={l.gt} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}><svg width={l.r * 2 + 2} height={l.r * 2 + 2} aria-hidden="true"><circle cx={l.r + 1} cy={l.r + 1} r={l.r} fill="rgba(194,65,12,0.55)" stroke="#7c2d12" /></svg>{l.gt.toLocaleString()}</span>)}
                <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}><svg width={8} height={8} aria-hidden="true"><circle cx={4} cy={4} r={3} fill="none" stroke="#7c2d12" /></svg>0</span>
              </span>
              <span style={{ color: "var(--color-text-muted)" }}>{tr("Circle area in proportion to GT; a hollow ring is a hole assayed with no intercept. Each sits at its intercepts' mid-point.")}</span>
            </div>
          )}
          {colouring && (
            <div aria-label={tr("Collar legend")} style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "var(--font-size-xs)", fontVariantNumeric: "tabular-nums", maxHeight: 220, overflowY: "auto" }}>
              {/* TASKS.csv #2989 — the legend says what it shows, with the element's unit */}
              <span style={{ fontWeight: 600 }}>{(() => {
                const [kind, key] = [colourBy.slice(0, colourBy.indexOf(":")), colourBy.slice(colourBy.indexOf(":") + 1)];
                const unit = assayElements.find((e) => e.symbol === key)?.unit;
                const u = unit ? ` (${unit})` : "";
                return kind === "max" ? tr("Highest {el} in the hole{u}", { el: key, u }) : kind === "mean" ? tr("{el}{u}, length-weighted mean of the hole", { el: key, u }) : key;
              })()}</span>
              {colouring.legend.map((l) => <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: "50%", border: "1px solid #14181e", background: l.colour, flex: "0 0 auto" }} />{l.label}</span>)}
              {colourBy.startsWith("max:") || colourBy.startsWith("mean:") ? <span>{tr("Classes at the quintiles of the holes' values; a grey ring is a hole with no value.")}</span> : null}
            </div>
          )}
        </div>
      )}
      <div style={{ ...chip, left: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ width: sb.px, height: 5, background: "#1a2028" }} />
        <span>{sb.label}</span>
      </div>
      <div style={{ ...chip, right: 10, top: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 700 }}>{tr("N ↑")}</span>
        <button onClick={fit} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}>{tr("Fit")}</button>
        <label style={{ display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />{tr("Grid")}</label>{/* #2128 */}
        <button onClick={toLayout} title={tr("Put this view on the Layout page, north up at its scale, with a legend of its layers")} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}>{tr("Snapshot to Layout")}</button>{/* #3194 — the 3D View's own words for the same thing */}
        <button onClick={() => { setMeasuring((m) => !m); setMPts([]); }} aria-pressed={measuring} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: `1px solid ${measuring ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 4, background: measuring ? "var(--color-selected-bg)" : "var(--color-bg)", cursor: "pointer" }}>{tr("Measure")}</button>
      </div>
      {measuring && ( /* TASKS.csv #2128 */
        <div role="status" aria-label={tr("Measured line")} style={{ ...chip, right: 10, bottom: 40, maxWidth: 340, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>
          {measured
            ? <>{tr("{d} · grid bearing {b}°", { d: distanceText(measured.distM), b: measured.bearingDeg.toFixed(1) })}{measured.conv != null && Math.abs(measured.conv) >= 0.01 ? " " + tr("(true north is {c}° {dir} of grid north here)", { c: Math.abs(measured.conv).toFixed(2), dir: measured.conv >= 0 ? tr("east") : tr("west") }) : ""}</>
            : tr("Click two points on the plan to measure between them.")}
        </div>
      )}
      {farLayers.length > 0 && ( /* TASKS.csv #2125 — what Fit leaves out */
        <div role="note" style={{ ...chip, right: 10, top: 44, maxWidth: 340, lineHeight: 1.4 }}>
          {tr("Fit frames the drillholes and leaves out {n} layer(s) far from them: {names}.", { n: farLayers.length, names: farLayers.slice(0, 3).map((l) => `${l.name} (${Math.round(l.far.distM / 1000).toLocaleString()} km)`).join(", ") + (farLayers.length > 3 ? ", …" : "") })}
        </div>
      )}
      <div style={{ ...chip, right: 10, bottom: 10, fontVariantNumeric: "tabular-nums" }}>
        {cursor ? `E ${Math.round(cursor.x).toLocaleString()}  N ${Math.round(cursor.y).toLocaleString()}${cursorValueText(rasters, cursor)}` : tr("Plan view · wheel to zoom, drag to pan, double-click to fit · drape and 3D in the 3D View")}
      </div>
    </div>
  );
}

// TASKS.csv #2658 — a per-hole value grid's figure points: the collars with the value the grid was made from (recomputed: the project
// file does not keep a second copy), [{ x, y, v }]
function holeFigurePoints(g, ctx) {
  const vals = perHoleValuesOf(g, ctx); // #2991 — a coded log (thickness, depth or RL of a strand) as well as an assay or a numeric log
  const out = [];
  for (const c of ctx.collars || []) { const v = vals.get(c.hole_id); if (Number.isFinite(v) && Number.isFinite(c.x) && Number.isFinite(c.y)) out.push({ x: c.x, y: c.y, v }); }
  return out;
}

// TASKS.csv #1622 — the figure's legend: the grid, how it was made, its colour scale in the unit, the samples and the contour levels
const fmtV = (x) => (Math.abs(x) > 0 && Math.abs(x) < 0.01 ? Number(x.toPrecision(2)).toString() : Number(x.toPrecision(3)).toLocaleString());
function FigureLegend({ f, chip }) {
  const g = f.r.geochem, stops = f.r.colourStops, unit = g.unit || "";
  const how = g.method === "mincurv" ? tr("minimum curvature, tension {t}", { t: g.tension }) : g.method === "natneigh" ? tr("natural neighbour") : g.method === "spline" ? tr("spline") : tr("IDW power {pw}", { pw: g.power ?? 2 }); // #1985 spline
  const parts = [how, tr("{c} m cells", { c: g.cellM }), g.log ? tr("on log10 values") : null, g.blankM ? tr("blank beyond {d} m", { d: g.blankM }) : null].filter(Boolean);
  const grad = `linear-gradient(to right, ${stops.map((s, i) => `${s.color} ${Math.round((100 * i) / Math.max(1, stops.length - 1))}%`).join(", ")})`;
  return (
    <div style={{ ...chip, left: 10, bottom: 52, maxWidth: 300, display: "flex", flexDirection: "column", gap: 4, lineHeight: 1.35 }} aria-label={tr("Figure legend")}>
      <span style={{ fontWeight: 700 }}>{f.r.name}</span>
      <span style={{ fontSize: "var(--font-size-xs)" }}>{parts.join(" · ")}</span>
      <div style={{ height: 9, background: grad, border: "1px solid rgba(0,0,0,0.25)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--font-size-xs)", fontVariantNumeric: "tabular-nums" }}>
        <span>{fmtV(stops[0].value)}</span><span>{f.log ? tr("{unit}, log scale", { unit }) : unit}</span><span>{fmtV(stops[stops.length - 1].value)}</span>
      </div>
      <span style={{ fontSize: "var(--font-size-xs)", display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", border: "1px solid #14181e", background: stops[Math.floor(stops.length / 2)].color, flex: "0 0 auto" }} />
        {g.source === "holes" ? tr("{n} holes at their collars, on the grid's colour scale", { n: f.pts.length.toLocaleString() }) /* #2658 */ : tr("{n} {el} samples{m}, on the grid's colour scale", { n: f.pts.length.toLocaleString(), el: g.symbol, m: g.medium ? tr(" ({medium})", { medium: g.medium }) : "" })}
      </span>
      {f.levels.length > 0 && <span style={{ fontSize: "var(--font-size-xs)", display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 0, borderTop: "2px solid #d62f2f", flex: "0 0 auto" }} />{tr("Contours: {levels} {unit}", { levels: f.levels.map(fmtV).join(", "), unit })}</span>}
    </div>
  );
}
