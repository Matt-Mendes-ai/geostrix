// TASKS.csv #1625 (review #1497, Lawyers) — a plan of the Maps tab's own data in its main pane. It showed a fixed card ('switch tabs
// to see them'), so every raster, terrain or boundary edit was made blind and checked by a trip to the 3D View (1.5-36 s on Lawyers).
// A light 2D canvas, north up: the terrain's hillshade, the rasters at their extents (opacity, transparent colour #1623), the map
// layers, boundaries, collars and surface samples; wheel to zoom, drag to pan, Fit, the cursor's E / N and a scale bar. Pictures are
// decoded once and map layers drawn once per style into a cached bitmap, so a pan redraws bitmaps; the 3D scene is not touched.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { niceScaleBar } from "../lib/surfacePlan.js";
import { hillshadeValues } from "../lib/hillshade.js";
import { drawMapLayer, mapStyleSignature, mapTextureSize } from "../lib/mapLayers.js";
import { keyedCanvas } from "../lib/rasterKey.js";
import { planDataExtent } from "../lib/mapsPlan.js";

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
  const [xmin, ymin, xmax, ymax] = t.bbox;
  const v = hillshadeValues(t.elevations, t.gridW, t.gridH, (xmax - xmin) / Math.max(1, t.gridW - 1), (ymax - ymin) / Math.max(1, t.gridH - 1));
  const c = document.createElement("canvas");
  c.width = t.gridW; c.height = t.gridH;
  const ctx = c.getContext("2d"), img = ctx.createImageData(t.gridW, t.gridH);
  for (let i = 0; i < v.length; i++) { const g = Math.round(v[i] * 255); img.data[i * 4] = g; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = g; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}


export default function MapsPlanView() {
  const { rasters = [], terrain, mapLayers = [], boundaries = [], collars = [], surfaceSamples = [] } = useStore();
  const wrapRef = useRef(null), canvasRef = useRef(null), layerCache = useRef(new Map()), drag = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState(null); // { cx, cy, mPerPx }
  const [cursor, setCursor] = useState(null);
  const [tick, setTick] = useState(0); // an image finished decoding
  const extent = useMemo(() => planDataExtent({ rasters, terrain, mapLayers, boundaries, collars, surfaceSamples }), [rasters, terrain, mapLayers, boundaries, collars, surfaceSamples]);
  const hill = useMemo(() => (terrain?.elevations?.length && terrain.gridW > 2 ? hillshadeCanvas(terrain) : null), [terrain]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!extent]); // the frame exists only once there is data
  const fit = () => { if (extent) setView({ cx: (extent[0] + extent[2]) / 2, cy: (extent[1] + extent[3]) / 2, mPerPx: Math.max((extent[2] - extent[0]) / size.w, (extent[3] - extent[1]) / size.h) * 1.08 }); };
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
    ctx.lineJoin = "round";
    boundaries.forEach((b) => {
      if (b.visible === false) return;
      ctx.strokeStyle = b.color || "#e2a63c"; ctx.lineWidth = 1.5;
      (b.polylines || []).forEach((pl) => { if (pl.length < 2) return; ctx.beginPath(); pl.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke(); });
    });
    ctx.fillStyle = "rgba(90,96,104,0.55)";
    surfaceSamples.forEach((s) => { if (Number.isFinite(s.x)) ctx.fillRect(X(s.x) - 1, Y(s.y) - 1, 2, 2); });
    ctx.fillStyle = "#1a2028"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
    collars.forEach((c) => { if (!Number.isFinite(c.x)) return; ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
  }, [v?.cx, v?.cy, v?.mPerPx, size, rasters, terrain, hill, mapLayers, boundaries, collars, surfaceSamples, tick]);

  if (!extent || !v) return null;
  const sb = niceScaleBar(v.mPerPx, 140);
  const toWorld = (px, py) => ({ x: v.cx + (px - size.w / 2) * v.mPerPx, y: v.cy - (py - size.h / 2) * v.mPerPx });
  const onWheel = (e) => {
    const r = canvasRef.current.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, at = toWorld(px, py);
    const m = v.mPerPx * (e.deltaY > 0 ? 1.2 : 1 / 1.2);
    setView({ mPerPx: m, cx: at.x - (px - size.w / 2) * m, cy: at.y + (py - size.h / 2) * m });
  };
  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }; };
  const onMove = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    setCursor(toWorld(e.clientX - r.left, e.clientY - r.top));
    const d = drag.current;
    if (d) setView({ mPerPx: v.mPerPx, cx: d.cx - (e.clientX - d.x) * v.mPerPx, cy: d.cy + (e.clientY - d.y) * v.mPerPx });
  };
  const onUp = () => { drag.current = null; };
  const chip = { position: "absolute", background: "rgba(255,255,255,0.9)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 7px", fontSize: "var(--font-size-sm)", color: "#1a2028" };
  return (
    <div ref={wrapRef} className="ge-maps-plan" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h, display: "block", cursor: drag.current ? "grabbing" : "crosshair" }} aria-label={tr("Plan of the map data")}
        onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { onUp(); setCursor(null); }} onDoubleClick={fit} />
      <div style={{ ...chip, left: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ width: sb.px, height: 5, background: "#1a2028" }} />
        <span>{sb.label}</span>
      </div>
      <div style={{ ...chip, right: 10, top: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontWeight: 700 }}>{tr("N ↑")}</span>
        <button onClick={fit} style={{ fontSize: "var(--font-size-sm)", padding: "1px 7px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", cursor: "pointer" }}>{tr("Fit")}</button>
      </div>
      <div style={{ ...chip, right: 10, bottom: 10, fontVariantNumeric: "tabular-nums" }}>
        {cursor ? `E ${Math.round(cursor.x).toLocaleString()}  N ${Math.round(cursor.y).toLocaleString()}` : tr("Plan view · wheel to zoom, drag to pan, double-click to fit · drape and 3D in the 3D View")}
      </div>
    </div>
  );
}
