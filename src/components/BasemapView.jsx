import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Minus, Move, Square, Check, Crosshair, Layers } from "lucide-react";
import LayerPicker from "./LayerPicker.jsx";
import CachedTile from "./CachedTile.jsx";
import { getSavedLayerId, saveLayerId, getSavedTracestrackKey, saveTracestrackKey, tileUrlFor, getBaseLayer } from "../lib/baseLayers.js";
import { fetchAndCacheTile } from "../lib/tileCache.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { useSetTaskProgress } from "../lib/store.jsx";
import { Download } from "lucide-react";

const TILE = 256;

function lonLatToWorldPx(lon, lat, zoom) {
  const n = 2 ** zoom;
  const wx = ((lon + 180) / 360) * n * TILE;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const wy = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n * TILE;
  return { wx, wy };
}
function worldPxToLonLat(wx, wy, zoom) {
  const n = 2 ** zoom;
  const lon = (wx / (n * TILE)) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / (n * TILE))));
  return { lon, lat: (latRad * 180) / Math.PI };
}

// Full-viewport OpenStreetMap slippy map — user request: "display the open street sat map on the
// view and not on a small viewport" (the persistent corner LocatorMap.jsx is deliberately tiny, a
// glance-only orientation aid — this is the "I want to actually look at/use the map" counterpart), and
// "an option to draw a rectangle on the view when we click generate SRTM so we can get it expanded to
// where we wish" (the SRTM auto-fetch's bbox was collar-derived only, with no way to widen/move it).
//
// Same from-scratch tile math LocatorMap.jsx and srtmFetch.js already use (no mapping-library
// dependency, still just tile.openstreetmap.org — display-only, same licensing posture as the corner
// locator, see that file's header comment) — generalized here to a real pannable/zoomable viewport
// with an optional draw-a-rectangle interaction, instead of a fixed 3x3 mosaic.
//
// Two modes:
//  - "locate": expanded read-only view of the corner locator — pan/zoom freely, pin shows the
//    project's real-world location, no editing. Opened from ViewerModule's Expand button.
//  - "draw": the SRTM fetch-area picker — opened from GeophysicsModule's "Fetch SRTM for this area"
//    button, pre-seeded with the same collar-derived bbox the old one-click auto-fetch used to send
//    straight to fetchSRTMTerrain, but now shown as an editable rectangle the user can accept as-is or
//    redraw/expand before confirming.
export default function BasemapView({
  mode = "locate", // "locate" | "draw"
  lon, lat, // marker (locate) / fallback center + "Locate" recenter target (draw, if known)
  initialBboxLonLat = null, // [lonMin, latMin, lonMax, latMax], draw mode only
  areaOptions = null, // TASKS.csv #200 — draw mode only: [{id, label, bboxLonLat}], existing
  // boundary/raster layers offered as a ready-made fetch area instead of drawing one by hand.
  title = "Draw the area to fetch SRTM elevation for", // draw mode only — TASKS.csv #204 reuses this
  // same picker for satellite imagery, where "fetch SRTM" wording would be wrong.
  confirmLabel = "Fetch SRTM for this area", // draw mode only, same reason as `title` above.
  onClose,
  onConfirm, // (bboxLonLat) => void, draw mode only
}) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 650 });
  const [zoom, setZoom] = useState(11);
  const [center, setCenter] = useState(null); // { wx, wy } world px at current zoom
  const [bbox, setBbox] = useState(initialBboxLonLat);
  const [subMode, setSubMode] = useState(mode === "draw" ? "draw" : "pan");
  const dragRef = useRef(null);
  const [baseLayerId, setBaseLayerId] = useState(getSavedLayerId());
  const [tracestrackKey, setTracestrackKey] = useState(getSavedTracestrackKey());
  const [layerPickerOpen, setLayerPickerOpen] = useState(false);
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const setTaskProgress = useSetTaskProgress();
  const activeLayer = getBaseLayer(baseLayerId);
  // Falls back to Standard whenever the active layer needs a key that isn't set (e.g. Tracestrack
  // picked before a key was ever saved) — never shows broken/unauthorized tile requests.
  const effectiveLayerId = activeLayer.needsKey && !tracestrackKey ? "standard" : baseLayerId;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width && r.height) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centers/zooms the view to fit a given lon/lat bbox — shared by the initial seed-bbox placement
  // below and by picking an existing boundary/raster layer as the fetch area (TASKS.csv #200): both
  // need the same "zoom out until the box fits comfortably in the viewport" search.
  const fitToBbox = (bboxLonLat) => {
    const [lonMin, latMin, lonMax, latMax] = bboxLonLat;
    const clon = (lonMin + lonMax) / 2, clat = (latMin + latMax) / 2;
    let z = 11;
    for (let zz = 17; zz >= 3; zz--) {
      const a = lonLatToWorldPx(lonMin, latMax, zz), b = lonLatToWorldPx(lonMax, latMin, zz);
      if (Math.abs(b.wx - a.wx) <= size.w * 0.65 && Math.abs(b.wy - a.wy) <= size.h * 0.65) { z = zz; break; }
    }
    setZoom(z);
    setCenter(lonLatToWorldPx(clon, clat, z));
  };

  // Set the initial center/zoom exactly once — center of the seed bbox (draw mode) or the marker
  // point (locate mode), with a zoom picked to roughly fit the seed bbox if there is one.
  useEffect(() => {
    if (center) return;
    if (initialBboxLonLat) { fitToBbox(initialBboxLonLat); return; }
    let clon = lon, clat = lat;
    if (!Number.isFinite(clon) || !Number.isFinite(clat)) { clon = 0; clat = 20; }
    setZoom(11);
    setCenter(lonLatToWorldPx(clon, clat, 11));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  // TASKS.csv #200 — "the option to select a polygon or a raster to use as boundary": picking an
  // existing boundary/raster layer's extent sets the same `bbox` the free-hand "Draw area" tool
  // would, then pans/zooms to fit it, so the rest of the confirm flow (accept-as-is or nudge it
  // first) works identically either way.
  const pickAreaFromLayer = (bboxLonLat) => {
    setBbox(bboxLonLat);
    fitToBbox(bboxLonLat);
  };

  const tiles = useMemo(() => {
    if (!center || !size.w || !size.h) return [];
    const n = 2 ** zoom;
    const x0 = Math.floor((center.wx - size.w / 2) / TILE) - 1;
    const x1 = Math.floor((center.wx + size.w / 2) / TILE) + 1;
    const y0 = Math.floor((center.wy - size.h / 2) / TILE) - 1;
    const y1 = Math.floor((center.wy + size.h / 2) / TILE) + 1;
    const list = [];
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % n) + n) % n;
        list.push({ tx, y: ty, x: wrapped, key: `${tx}_${ty}` });
      }
    }
    return list;
  }, [center, size, zoom]);

  const offsetX = center ? size.w / 2 - center.wx : 0;
  const offsetY = center ? size.h / 2 - center.wy : 0;

  const changeZoom = (delta) => {
    setZoom((z0) => {
      const z1 = Math.max(3, Math.min(18, z0 + delta));
      if (z1 !== z0) {
        setCenter((c) => (c ? { wx: c.wx * 2 ** (z1 - z0), wy: c.wy * 2 ** (z1 - z0) } : c));
      }
      return z1;
    });
  };

  // TASKS.csv #237 sub-item (5) — explicit "prep before I lose signal" pre-cache: walks the current
  // viewport at this zoom plus 2 closer levels (roughly a 21x tile count vs. one level, still a
  // modest, finite download for one screenful of area — not the whole property, which is what
  // CachedTile's passive background caching already covers as the user pans around normally) and
  // fetches+caches every tile via tileCache.js. Limited concurrency (6 in flight) so this doesn't try
  // to fire hundreds of requests at once.
  // TASKS.csv #300 — OSM began returning 403 "Access blocked — App is not following the tile usage
  // policy" for every tile, and this function was the main reason. OSM's tile usage policy forbids bulk
  // downloading outright: their tiles come from volunteer-funded servers, and sweeping three zoom levels
  // of a viewport is precisely the "download an area for later" pattern the policy exists to stop. The
  // 21x-tile-count reasoning in the comment above is a fair description of the cost but not a
  // justification — a modest bulk download is still a bulk download.
  //
  // So this is now refused for OSM Standard specifically, rather than throttled. Offline pre-caching is
  // legitimate against providers whose terms allow it — Tracestrack, which the user supplies their own
  // API key for, and EOX's satellite mosaic — so the feature stays for those. Passive caching of tiles
  // the user has ALREADY viewed (CachedTile.jsx) is ordinary browser behaviour and is untouched; the
  // deliberate area sweep is the part that was over the line.
  const BULK_CACHE_BLOCKED_LAYERS = new Set(["standard"]);
  const bulkCacheBlocked = BULK_CACHE_BLOCKED_LAYERS.has(effectiveLayerId);
  const EXTRA_ZOOM_LEVELS = 2;
  const downloadAreaOffline = async () => {
    if (!center || offlineDownloading) return;
    if (bulkCacheBlocked) {
      setTaskProgress({
        label: "OpenStreetMap's tile policy doesn't allow downloading areas in advance — switch to Topo or Satellite to pre-cache.",
        pct: 100,
      });
      setTimeout(() => setTaskProgress(null), 6000);
      return;
    }
    setOfflineDownloading(true);
    const centerLonLat = worldPxToLonLat(center.wx, center.wy, zoom);
    const targets = [];
    for (let zz = zoom; zz <= Math.min(18, zoom + EXTRA_ZOOM_LEVELS); zz++) {
      const c = lonLatToWorldPx(centerLonLat.lon, centerLonLat.lat, zz);
      const n = 2 ** zz;
      const x0 = Math.floor((c.wx - size.w / 2) / TILE) - 1;
      const x1 = Math.floor((c.wx + size.w / 2) / TILE) + 1;
      const y0 = Math.floor((c.wy - size.h / 2) / TILE) - 1;
      const y1 = Math.floor((c.wy + size.h / 2) / TILE) + 1;
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = x0; tx <= x1; tx++) targets.push({ z: zz, x: ((tx % n) + n) % n, y: ty });
      }
    }
    const total = targets.length;
    let done = 0;
    const label = `Downloading ${total} map tiles for offline use…`;
    setTaskProgress({ label, pct: 0 });
    // TASKS.csv #300 — was 6. Tile providers generally ask for a small number of parallel connections
    // (OSM's policy names 2), and there is no user-visible benefit to saturating someone else's server:
    // this is a background "prep before I lose signal" task, not something anyone is watching finish.
    const CONCURRENCY = 2;
    let idx = 0;
    const worker = async () => {
      while (idx < targets.length) {
        const t = targets[idx++];
        const tileUrl = tileUrlFor(effectiveLayerId, t.z, t.x, t.y, tracestrackKey);
        if (tileUrl) await fetchAndCacheTile(effectiveLayerId, t.z, t.x, t.y, tileUrl);
        done++;
        setTaskProgress((cur) => (cur && cur.label === label ? { ...cur, pct: Math.round((done / total) * 100) } : cur));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    const doneLabel = `Cached ${total} map tiles for offline use.`;
    setTaskProgress({ label: doneLabel, pct: 100 });
    setTimeout(() => setTaskProgress((cur) => (cur && cur.label === doneLabel ? null : cur)), 2500);
    setOfflineDownloading(false);
  };

  const recenter = () => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    setCenter(lonLatToWorldPx(lon, lat, zoom));
  };

  const screenToLonLat = (sx, sy) => {
    if (!center) return null;
    return worldPxToLonLat(center.wx + (sx - size.w / 2), center.wy + (sy - size.h / 2), zoom);
  };

  const onMouseDown = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (subMode === "draw") {
      dragRef.current = { kind: "draw", start: screenToLonLat(sx, sy) };
      setBbox(null);
    } else {
      dragRef.current = { kind: "pan", startSx: sx, startSy: sy, startCenter: center };
    }
  };
  const onMouseMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = containerRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (d.kind === "pan") {
      setCenter({ wx: d.startCenter.wx - (sx - d.startSx), wy: d.startCenter.wy - (sy - d.startSy) });
    } else if (d.kind === "draw" && d.start) {
      const cur = screenToLonLat(sx, sy);
      if (cur) {
        setBbox([
          Math.min(d.start.lon, cur.lon), Math.min(d.start.lat, cur.lat),
          Math.max(d.start.lon, cur.lon), Math.max(d.start.lat, cur.lat),
        ]);
      }
    }
  };
  const onMouseUp = () => { dragRef.current = null; };

  const markerPx = mode === "locate" && center && Number.isFinite(lon) && Number.isFinite(lat)
    ? (() => { const p = lonLatToWorldPx(lon, lat, zoom); return { x: p.wx + offsetX, y: p.wy + offsetY }; })()
    : null;

  const bboxPx = bbox && center
    ? (() => {
        const a = lonLatToWorldPx(bbox[0], bbox[3], zoom); // NW corner
        const b = lonLatToWorldPx(bbox[2], bbox[1], zoom); // SE corner
        return { left: a.wx + offsetX, top: a.wy + offsetY, width: b.wx - a.wx, height: b.wy - a.wy };
      })()
    : null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={topBarStyle}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "#2a323c" }}>
          {mode === "draw" ? title : "Locate"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Number.isFinite(lon) && Number.isFinite(lat) && (
            <button onClick={recenter} title="Center on project location" style={iconBtnStyle}><Crosshair size={14} /></button>
          )}
          <button onClick={onClose} title="Close" style={iconBtnStyle}><X size={18} /></button>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{ position: "relative", flex: 1, overflow: "hidden", cursor: subMode === "draw" ? "crosshair" : "grab", background: "#dfe3e8" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={(e) => { e.preventDefault(); changeZoom(e.deltaY < 0 ? 1 : -1); }}
      >
        {tiles.map((t) => (
          <CachedTile
            key={t.key}
            layerId={effectiveLayerId}
            z={zoom}
            x={t.x}
            y={t.y}
            url={tileUrlFor(effectiveLayerId, zoom, t.x, t.y, tracestrackKey)}
            alt=""
            draggable={false}
            style={{ position: "absolute", left: t.tx * TILE + offsetX, top: t.y * TILE + offsetY, width: TILE, height: TILE, userSelect: "none" }}
            onError={(e) => { e.currentTarget.style.background = "#e4e6ea"; }}
          />
        ))}
        {markerPx && (
          <div style={{ position: "absolute", left: markerPx.x - 7, top: markerPx.y - 18, width: 14, height: 18, pointerEvents: "none" }}>
            <svg width="14" height="18" viewBox="0 0 14 18">
              <path d="M7 0C3.13 0 0 3.13 0 7c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z" fill="#e05a4a" stroke="#7a2018" strokeWidth="0.75" />
              <circle cx="7" cy="7" r="2.6" fill="#ffffff" />
            </svg>
          </div>
        )}
        {bboxPx && (
          <div style={{ position: "absolute", left: bboxPx.left, top: bboxPx.top, width: bboxPx.width, height: bboxPx.height, border: "2px solid var(--color-primary)", background: "rgba(47,111,224,0.15)", pointerEvents: "none" }} />
        )}
        <div style={zoomCtrlStyle}>
          <button onClick={() => changeZoom(1)} style={iconBtnStyle} title="Zoom in"><Plus size={14} /></button>
          <button onClick={() => changeZoom(-1)} style={iconBtnStyle} title="Zoom out"><Minus size={14} /></button>
          {mode === "locate" && (
            <button
              onClick={downloadAreaOffline}
              disabled={offlineDownloading}
              // TASKS.csv #300 — left clickable rather than disabled when the layer is OSM, so the click
              // can explain WHY. A greyed-out button with no reason is the thing that sends someone
              // hunting through settings for a problem that isn't theirs.
              title={bulkCacheBlocked
                ? "Offline pre-download isn't available on the OpenStreetMap layer — their tile policy doesn't permit downloading areas in advance. Switch to Topo or Satellite to pre-cache."
                : "Download this area's map tiles for offline use (this zoom level + 2 closer levels)"}
              style={{ ...iconBtnStyle, opacity: offlineDownloading ? 0.5 : bulkCacheBlocked ? 0.55 : 1, cursor: offlineDownloading ? "default" : "pointer" }}
            ><Download size={14} /></button>
          )}
          <div style={{ position: "relative" }}>
            <button onClick={() => setLayerPickerOpen((v) => !v)} title="Base layer" style={{ ...iconBtnStyle, ...(layerPickerOpen ? { background: "#eef3fb", borderColor: "var(--color-selected-border)" } : {}) }}><Layers size={14} /></button>
            {layerPickerOpen && (
              <LayerPicker
                layerId={baseLayerId}
                onSelectLayer={(id) => { setBaseLayerId(id); saveLayerId(id); }}
                tracestrackKey={tracestrackKey}
                onSaveKey={(k) => { setTracestrackKey(k); saveTracestrackKey(k); }}
                onClose={() => setLayerPickerOpen(false)}
              />
            )}
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 6, left: 8, fontSize: "var(--font-size-xs)", color: "#5a6472", background: "rgba(255,255,255,0.75)", padding: "1px 5px", borderRadius: 3 }}>
          {getBaseLayer(effectiveLayerId).attribution}
        </div>
      </div>
      {mode === "draw" && (
        <div style={bottomBarStyle}>
          <button onClick={() => setSubMode("pan")} style={subMode === "pan" ? toolBtnActiveStyle : toolBtnStyle} title="Pan the map to find the area">
            <Move size={14} /> Pan
          </button>
          <button onClick={() => setSubMode("draw")} style={subMode === "draw" ? toolBtnActiveStyle : toolBtnStyle} title="Drag on the map to draw the fetch area">
            <Square size={14} /> Draw area
          </button>
          {areaOptions && areaOptions.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                const opt = areaOptions.find((o) => o.id === e.target.value);
                if (opt) pickAreaFromLayer(opt.bboxLonLat);
                e.target.value = "";
              }}
              style={{ ...toolBtnStyle, padding: "6px 8px" }}
              title="Use an existing boundary or raster layer's extent as the fetch area"
            >
              <option value="" disabled>Use existing layer as area…</option>
              {areaOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          )}
          <div style={{ flex: 1 }} />
          {bbox && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "#5a6472", marginRight: 10 }}>
              ~{(bbox[2] - bbox[0]).toFixed(3)}° × {(bbox[3] - bbox[1]).toFixed(3)}°
            </div>
          )}
          <button onClick={onClose} style={toolBtnStyle}>Cancel</button>
          <button
            onClick={() => bbox && onConfirm(bbox)}
            disabled={!bbox}
            style={{ ...toolBtnActiveStyle, opacity: bbox ? 1 : 0.5, cursor: bbox ? "pointer" : "not-allowed" }}
          >
            <Check size={14} /> {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}

const overlayStyle = { position: "fixed", inset: 0, zIndex: 500, background: "var(--color-bg)", display: "flex", flexDirection: "column" };
const topBarStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--color-divider)" };
const bottomBarStyle = { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderTop: "1px solid var(--color-divider)" };
const iconBtnStyle = { width: 28, height: 28, borderRadius: 6, border: "1px solid var(--color-border-light)", background: "var(--color-bg)", color: "#3a4048", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const zoomCtrlStyle = { position: "absolute", top: 10, right: 10, display: "flex", flexDirection: "column", gap: 4 };
const toolBtnStyle = { display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border-light)", background: "var(--color-bg)", color: "#3a4048", fontSize: "var(--font-size-base)", cursor: "pointer" };
const toolBtnActiveStyle = { ...toolBtnStyle, background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#ffffff" };
