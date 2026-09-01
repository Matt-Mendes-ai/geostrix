import React, { useState } from "react";
import { X, Globe, Loader2, Download } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, label as labelStyle, sel, inp, btn } from "../lib/modalStyles.js";
import { fetchWmsLayers, fetchWmsMapAsRaster, fetchWfsFeatureTypes, fetchWfsFeaturesAsBoundary } from "../lib/webLayers.js";
import BasemapView from "./BasemapView.jsx";

// TASKS.csv #127 — "many exploration geologists pull government geological/geophysical WMS layers
// (provincial bedrock geology, airborne mag WMS, claim-tenure WFS) directly in QGIS. GeoStrix has no
// generic 'add a WMS/WMTS/WFS layer by URL' capability." WMTS isn't covered by this modal — it's
// tile-based like the existing OSM/Tracestrack/satellite basemap layers (src/lib/baseLayers.js), not a
// one-shot fetch like WMS/WFS, so it's out of scope for "import a layer into the project" here; a
// custom WMTS basemap URL is a separate, smaller addition to baseLayers.js if ever needed.
//
// WMS -> one rendered image for a chosen area, imported as a raster drape (addRaster). WFS -> real
// vector features, imported as a boundary polylines layer (addBoundary). Both go through
// src/lib/webLayers.js, which does the actual GetCapabilities/GetMap/GetFeature work.
export default function AddWebLayerModal({ onClose, addRaster, addBoundary, projectEpsg, defaultBboxLonLat, collarsLoaded }) {
  useEscapeKey(onClose);
  useFocusTrap(); // TASKS.csv #238
  const [service, setService] = useState("wms"); // "wms" | "wfs"
  const [url, setUrl] = useState("");
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [capsError, setCapsError] = useState(null);
  const [layers, setLayers] = useState(null); // [{name,title,...}] once fetched
  const [selectedName, setSelectedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {ok, text}
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [bboxLonLat, setBboxLonLat] = useState(null); // WMS only
  const [clipToArea, setClipToArea] = useState(true); // WFS only

  const selectedLayer = layers?.find((l) => l.name === selectedName) || null;

  const fetchCapabilities = async () => {
    if (!url.trim()) return;
    setLoadingCaps(true); setCapsError(null); setLayers(null); setSelectedName(""); setResult(null);
    try {
      const found = service === "wms" ? await fetchWmsLayers(url.trim()) : await fetchWfsFeatureTypes(url.trim());
      if (!found.length) { setCapsError("No layers found in this service's capabilities — double check the URL."); return; }
      setLayers(found);
      if (service === "wms") {
        const first = found[0];
        setBboxLonLat(first.bboxLonLat || defaultBboxLonLat || null);
      }
    } catch (err) {
      setCapsError(err.message);
    } finally {
      setLoadingCaps(false);
    }
  };

  const selectLayer = (name) => {
    setSelectedName(name);
    if (service === "wms") {
      const l = layers.find((x) => x.name === name);
      setBboxLonLat(l?.bboxLonLat || defaultBboxLonLat || null);
    }
  };

  const doImport = async () => {
    if (!selectedLayer) return;
    setBusy(true); setResult(null);
    try {
      if (service === "wms") {
        if (!bboxLonLat) throw new Error("No area set — this layer has no declared extent and there's no project area to default to. Draw an area first.");
        const raster = await fetchWmsMapAsRaster({ baseUrl: url.trim(), layerName: selectedLayer.name, bboxLonLat, projectEpsg });
        addRaster({ name: `WMS: ${selectedLayer.title || selectedLayer.name}`, bbox: raster.bbox, dataUrl: raster.dataUrl });
        setResult({ ok: true, text: `Imported "${selectedLayer.title || selectedLayer.name}" as a raster drape.` });
      } else {
        const clip = clipToArea && defaultBboxLonLat ? defaultBboxLonLat : null;
        const boundary = await fetchWfsFeaturesAsBoundary({ baseUrl: url.trim(), typeName: selectedLayer.name, projectEpsg, clipBboxLonLat: clip });
        addBoundary({ name: `WFS: ${selectedLayer.title || selectedLayer.name}`, polylines: boundary.polylines });
        const clipNote = boundary.clippedCount ? ` (${boundary.clippedCount} of ${boundary.totalFeatures} feature(s) outside the project area were skipped)` : "";
        setResult({ ok: true, text: `Imported ${boundary.polylines.length} feature part(s) as a boundary layer${clipNote}.` });
      }
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={panel({ width: 560, maxHeight: "85vh" })} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}><Globe size={15} /> Add web layer (WMS / WFS)</div>
          <button onClick={onClose} title="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.75, lineHeight: 1.4 }}>
            Point this at a government/company OGC service URL (e.g. a provincial bedrock geology WMS, an
            airborne mag WMS, or a claim-tenure WFS) — the same kind of service you'd add in QGIS.
            WMS layers import as a raster drape for a chosen area; WFS layers import as a boundary/vector layer.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={service} onChange={(e) => { setService(e.target.value); setLayers(null); setSelectedName(""); setResult(null); setCapsError(null); }} style={{ ...sel, width: 100 }}>
              <option value="wms">WMS</option>
              <option value="wfs">WFS</option>
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.gov/geoserver/wms"
              style={{ ...inp, flex: 1 }}
              onKeyDown={(e) => { if (e.key === "Enter") fetchCapabilities(); }}
            />
            <button onClick={fetchCapabilities} disabled={!url.trim() || loadingCaps} style={{ ...btn(true), width: "auto", padding: "0 12px", display: "flex", alignItems: "center", gap: 6, opacity: url.trim() && !loadingCaps ? 1 : 0.5 }}>
              {loadingCaps ? <Loader2 size={13} className="spin" /> : null} Fetch layers
            </button>
          </div>
          {capsError && <div style={{ fontSize: 11.5, color: "#c0392b" }}>{capsError}</div>}

          {layers && (
            <div>
              <div style={labelStyle}>{layers.length} layer{layers.length === 1 ? "" : "s"} found</div>
              <select value={selectedName} onChange={(e) => selectLayer(e.target.value)} style={{ ...sel, width: "100%" }}>
                <option value="">Choose a layer…</option>
                {layers.map((l) => <option key={l.name} value={l.name}>{l.title || l.name}</option>)}
              </select>
              {selectedLayer?.abstract && <div style={{ fontSize: 10.5, opacity: 0.7, marginTop: 6, lineHeight: 1.4 }}>{selectedLayer.abstract}</div>}
            </div>
          )}

          {selectedLayer && service === "wms" && (
            <div>
              <div style={labelStyle}>Area</div>
              {bboxLonLat ? (
                <div style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>~{(bboxLonLat[2] - bboxLonLat[0]).toFixed(3)}° × {(bboxLonLat[3] - bboxLonLat[1]).toFixed(3)}°</span>
                  <button onClick={() => setAreaPickerOpen(true)} style={{ ...btn(false), width: "auto", padding: "4px 8px" }}>Draw a different area…</button>
                </div>
              ) : (
                <button onClick={() => setAreaPickerOpen(true)} style={{ ...btn(false), width: "auto", padding: "4px 8px" }}>Draw an area…</button>
              )}
            </div>
          )}

          {selectedLayer && service === "wfs" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }} title={collarsLoaded ? undefined : "No collars loaded yet — nothing to clip against, so this has no effect."}>
              <input type="checkbox" checked={clipToArea} disabled={!collarsLoaded} onChange={(e) => setClipToArea(e.target.checked)} />
              Limit to the current project area (recommended for province/country-wide layers)
            </label>
          )}

          {result && <div style={{ fontSize: 11.5, color: result.ok ? "#2f8f5b" : "#c0392b" }}>{result.text}</div>}

          {selectedLayer && (
            <button onClick={doImport} disabled={busy || (service === "wms" && !bboxLonLat)} style={{ ...btn(true), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={13} className="spin" /> : <Download size={13} />} {busy ? "Importing…" : "Import this layer"}
            </button>
          )}
        </div>
      </div>
      {areaPickerOpen && (
        <BasemapView
          mode="draw"
          initialBboxLonLat={bboxLonLat || defaultBboxLonLat}
          title="Draw the area to fetch this WMS layer for"
          confirmLabel="Use this area"
          onClose={() => setAreaPickerOpen(false)}
          onConfirm={(bbox) => { setBboxLonLat(bbox); setAreaPickerOpen(false); }}
        />
      )}
    </div>
  );
}
