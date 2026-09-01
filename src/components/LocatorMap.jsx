import React, { useMemo, useState } from "react";
import { X, Maximize2, Layers } from "lucide-react";
import LayerPicker from "./LayerPicker.jsx";
import CachedTile from "./CachedTile.jsx";
import { getSavedLayerId, saveLayerId, getSavedTracestrackKey, saveTracestrackKey, tileUrlFor, getBaseLayer } from "../lib/baseLayers.js";

// Persistent locator mini-map, docked in a corner of the 3D viewport — TASKS.csv, user request: "have
// that open street map... just so the user can easily locate" (a lightweight orientation aid, not a
// basemap/imagery importer — that's a separate, much bigger feature with real licensing questions, see
// the discussion that led here). Shows a small OpenStreetMap tile mosaic centered on wherever the
// project's collars actually sit in the real world, with a pin at the exact point.
//
// Deliberately plain <img> tags in a CSS grid, not a canvas mosaic — a locator only needs to be looked
// at, never read back as pixel data, so there's no reason to fight canvas cross-origin tainting for
// zero benefit. Tiles come straight from tile.openstreetmap.org, OSM's standard tile endpoint — light,
// occasional use (a handful of tiles once when this opens or re-centers, not continuous polling) is
// well within their tile usage policy; this is NOT the "extract a GeoTIFF from satellite imagery" idea
// that got scoped out over licensing concerns — OSM's own map is free to display, just not to be
// scraped and redistributed as your own dataset, and this does neither.
const TILE = 256;
const GRID = 3; // 3x3 tiles — enough context around the pin without being a real interactive map
const DISPLAY = 168; // px, on-screen size of the whole mosaic

function lonLatToWorldPx(lon, lat, zoom) {
  const n = 2 ** zoom;
  const worldPxX = ((lon + 180) / 360) * n * TILE;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const worldPxY = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n * TILE;
  return { worldPxX, worldPxY };
}

export default function LocatorMap({ lon, lat, zoom = 12, onClose, onExpand }) {
  const [baseLayerId, setBaseLayerId] = useState(getSavedLayerId());
  const [tracestrackKey, setTracestrackKey] = useState(getSavedTracestrackKey());
  const [layerPickerOpen, setLayerPickerOpen] = useState(false);
  const activeLayer = getBaseLayer(baseLayerId);
  const effectiveLayerId = activeLayer.needsKey && !tracestrackKey ? "standard" : baseLayerId;
  const layout = useMemo(() => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const { worldPxX, worldPxY } = lonLatToWorldPx(lon, lat, zoom);
    const x0 = Math.floor(worldPxX / TILE), y0 = Math.floor(worldPxY / TILE);
    const half = Math.floor(GRID / 2);
    const originPxX = (x0 - half) * TILE, originPxY = (y0 - half) * TILE;
    const scale = DISPLAY / (GRID * TILE);
    const markerX = (worldPxX - originPxX) * scale;
    const markerY = (worldPxY - originPxY) * scale;
    const tiles = [];
    for (let ty = 0; ty < GRID; ty++) {
      for (let tx = 0; tx < GRID; tx++) {
        tiles.push({ x: x0 - half + tx, y: y0 - half + ty, key: `${tx}_${ty}` });
      }
    }
    return { tiles, markerX, markerY };
  }, [lon, lat, zoom]);

  if (!layout) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 10, fontSize: 11, color: "#7b8794", textAlign: "center" }}>
          No real-world location yet — import collars (or a georeferenced raster/terrain) first.
        </div>
        <button onClick={onClose} title="Hide locator map" style={closeBtnStyle}><X size={12} /></button>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ position: "relative", width: DISPLAY, height: DISPLAY, overflow: "hidden", borderRadius: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID}, ${DISPLAY / GRID}px)`, gridTemplateRows: `repeat(${GRID}, ${DISPLAY / GRID}px)`, width: DISPLAY, height: DISPLAY }}>
          {layout.tiles.map((t) => (
            <CachedTile
              key={t.key}
              layerId={effectiveLayerId}
              z={zoom}
              x={t.x}
              y={t.y}
              url={tileUrlFor(effectiveLayerId, zoom, t.x, t.y, tracestrackKey)}
              alt=""
              width={DISPLAY / GRID}
              height={DISPLAY / GRID}
              draggable={false}
              style={{ display: "block", width: DISPLAY / GRID, height: DISPLAY / GRID, objectFit: "cover" }}
              onError={(e) => { e.currentTarget.style.background = "#e4e6ea"; }}
            />
          ))}
        </div>
        {/* pin at the project's exact real-world location within the mosaic */}
        <div style={{ position: "absolute", left: layout.markerX, top: layout.markerY, width: 0, height: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: -7, top: -18, width: 14, height: 18 }}>
            <svg width="14" height="18" viewBox="0 0 14 18">
              <path d="M7 0C3.13 0 0 3.13 0 7c0 5.25 7 11 7 11s7-5.75 7-11c0-3.87-3.13-7-7-7z" fill="#e05a4a" stroke="#7a2018" strokeWidth="0.75" />
              <circle cx="7" cy="7" r="2.6" fill="#ffffff" />
            </svg>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 9, color: "#9aa5b3", textAlign: "center", marginTop: 3 }}>{getBaseLayer(effectiveLayerId).attribution}</div>
      {onExpand && (
        <button onClick={onExpand} title="Expand to full-screen map" style={expandBtnStyle}><Maximize2 size={11} /></button>
      )}
      <div style={{ position: "absolute", bottom: -8, left: -8 }}>
        <button onClick={() => setLayerPickerOpen((v) => !v)} title="Base layer" style={{ ...closeBtnStyle, position: "static" }}><Layers size={11} /></button>
        {layerPickerOpen && (
          <div style={{ position: "relative" }}>
            <LayerPicker
              layerId={baseLayerId}
              onSelectLayer={(id) => { setBaseLayerId(id); saveLayerId(id); }}
              tracestrackKey={tracestrackKey}
              onSaveKey={(k) => { setTracestrackKey(k); saveTracestrackKey(k); }}
              onClose={() => setLayerPickerOpen(false)}
              openUpward
            />
          </div>
        )}
      </div>
      <button onClick={onClose} title="Hide locator map" style={closeBtnStyle}><X size={12} /></button>
    </div>
  );
}

const panelStyle = {
  position: "relative",
  background: "#ffffff",
  border: "1px solid #c7ccd3",
  borderRadius: 8,
  padding: 6,
  boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
};
const closeBtnStyle = {
  position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: "50%",
  background: "#ffffff", border: "1px solid #c7ccd3", color: "#55606e",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
};
const expandBtnStyle = {
  position: "absolute", top: -8, left: -8, width: 20, height: 20, borderRadius: "50%",
  background: "#ffffff", border: "1px solid #c7ccd3", color: "#55606e",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
};
