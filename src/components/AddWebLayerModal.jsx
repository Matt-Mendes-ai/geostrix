import React, { useState } from "react";
import { X, Globe, Loader2, Download } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, label as labelStyle, sel, inp, btn } from "../lib/modalStyles.js";
import { fetchWmsLayers, fetchWmsMapAsRaster, fetchWfsFeatureTypes, fetchWfsFeaturesAsBoundary, defaultWmsArea, wfsTruncationText, pickWfsStyleField, WMS_DETAIL, wmsImageSize, wmsPixelMetres, wmsTilePlan, WMS_DEFAULT_MAX_REQUEST } from "../lib/webLayers.js";
import { buildLayer, autoColorFor } from "../lib/mapLayerBuild.js";
import { autoCategories } from "../lib/mapLayers.js";
import BasemapView from "./BasemapView.jsx";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language

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
export default function AddWebLayerModal({ onClose, addRaster, addBoundary, addMapLayer, projectEpsg, defaultBboxLonLat, collarsLoaded }) {
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
  const [wfsAs, setWfsAs] = useState("map"); // TASKS.csv #544 — "map": Map layer with attributes | "lines": boundary lines
  // TASKS.csv #840 — WMS image detail (longest side), remembered per computer like the satellite fetch's level
  const [wmsDetail, setWmsDetailState] = useState(() => { try { const v = localStorage.getItem("geostrix_wms_detail"); return WMS_DETAIL[v] ? v : "standard"; } catch { return "standard"; } });
  const setWmsDetail = (v) => { setWmsDetailState(v); try { localStorage.setItem("geostrix_wms_detail", v); } catch { /* private window: session only */ } };
  const [wmsProgress, setWmsProgress] = useState(null);

  const selectedLayer = layers?.find((l) => l.name === selectedName) || null;

  const fetchCapabilities = async () => {
    if (!url.trim()) return;
    setLoadingCaps(true); setCapsError(null); setLayers(null); setSelectedName(""); setResult(null);
    try {
      const found = service === "wms" ? await fetchWmsLayers(url.trim()) : await fetchWfsFeatureTypes(url.trim());
      if (!found.length) { setCapsError(tr("No layers found in this service's capabilities — double check the URL.")); return; }
      setLayers(found);
      if (service === "wms") {
        const first = found[0];
        setBboxLonLat(defaultWmsArea(first.bboxLonLat, defaultBboxLonLat)); // #543 — the project area first
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
      setBboxLonLat(defaultWmsArea(l?.bboxLonLat, defaultBboxLonLat)); // #543
    }
  };

  const doImport = async () => {
    if (!selectedLayer) return;
    setBusy(true); setResult(null);
    try {
      if (service === "wms") {
        if (!bboxLonLat) throw new Error(tr("No area set — this layer has no declared extent and there's no project area to default to. Draw an area first."));
        const raster = await fetchWmsMapAsRaster({ baseUrl: url.trim(), layerName: selectedLayer.name, bboxLonLat, projectEpsg, longPx: WMS_DETAIL[wmsDetail].longPx,
          maxRequest: { width: selectedLayer.maxWidth, height: selectedLayer.maxHeight }, onProgress: (done, total) => setWmsProgress(total > 1 ? { done, total } : null) }); // #840
        addRaster({ name: `WMS: ${selectedLayer.title || selectedLayer.name}`, bbox: raster.bbox, dataUrl: raster.dataUrl });
        const title = selectedLayer.title || selectedLayer.name;
        const failedNote = raster.failedTiles ? " " + tr("{n} of {total} requests failed and are left transparent.", { n: raster.failedTiles, total: raster.tiles }) : "";
        setResult({ ok: !raster.failedTiles, warn: !!raster.failedTiles, text: tr("Imported \"{title}\" as a raster drape: {w} × {h} px, ~{m} m pixels ({tiles} map requests).", { title, w: raster.width, h: raster.height, m: fmtM(raster.pixelM), tiles: raster.tiles }) + failedNote });
      } else {
        const clip = clipToArea && defaultBboxLonLat ? defaultBboxLonLat : null;
        const boundary = await fetchWfsFeaturesAsBoundary({ baseUrl: url.trim(), typeName: selectedLayer.name, projectEpsg, clipBboxLonLat: clip });
        const title = selectedLayer.title || selectedLayer.name;
        const clipNote = boundary.clippedCount ? tr(" ({clippedCount} part(s) outside the project area were skipped)", { clippedCount: boundary.clippedCount }) : "";
        const more = wfsTruncationText(boundary); // #544
        // #544 — polygons / lines come in as a Map layer that keeps every attribute (tenure number, owner...); points,
        // mixed geometry, or the user's choice go to boundary lines as before
        const layer = wfsAs === "map" && boundary.geomType && addMapLayer
          ? buildLayer({ name: `WFS: ${title}`, geomType: boundary.geomType, features: boundary.mapFeatures, epsg: projectEpsg }, { sourceName: `WFS: ${title}`, projectEpsg, qml: null, sourceOverride: null })
          : null;
        if (layer) {
          // #544 — a WFS layer's first field is usually its id (one colour per claim is no colouring at all)
          const field = pickWfsStyleField(layer.features, layer.fields, layer.styleField);
          if (field !== layer.styleField) { layer.styleField = field; layer.categories = autoCategories(layer.features, field, autoColorFor()); }
          addMapLayer(layer);
          setResult({ ok: !more, warn: !!more, text: `Imported ${layer.features.length} feature(s) as a Map layer with ${layer.fields.length} attribute field(s)${layer.styleField ? `, coloured by ${layer.styleField}` : ""}${clipNote}.${more ? " " + more : ""}` });
        } else {
          addBoundary({ name: `WFS: ${title}`, polylines: boundary.polylines });
          const why = wfsAs === "map" && !boundary.geomType ? " (points or mixed geometry — Map layers take polygons or lines)" : "";
          setResult({ ok: !more, warn: !!more, text: `Imported ${boundary.polylines.length} feature part(s) as boundary lines${why}${clipNote}.${more ? " " + more : ""}` });
        }
      }
    } catch (err) {
      setResult({ ok: false, text: err.message });
    } finally {
      setBusy(false);
      setWmsProgress(null);
    }
  };
  // #840 — what the chosen detail gives for this area: image size, ground pixel, number of GetMap requests
  const wmsPlan = (() => {
    if (service !== "wms" || !selectedLayer || !bboxLonLat) return null;
    const longPx = WMS_DETAIL[wmsDetail].longPx, { width, height } = wmsImageSize(bboxLonLat, longPx);
    const maxW = Math.min(4096, selectedLayer.maxWidth || WMS_DEFAULT_MAX_REQUEST), maxH = Math.min(4096, selectedLayer.maxHeight || selectedLayer.maxWidth || WMS_DEFAULT_MAX_REQUEST);
    return { width, height, m: wmsPixelMetres(bboxLonLat, longPx), requests: wmsTilePlan(width, height, maxW, maxH).length };
  })();

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={panel({ width: 560, maxHeight: "85vh" })} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-lg)", fontWeight: 600 }}><Globe size={14} />{" "}{tr("Add web layer (WMS / WFS)")}</div>
          <button onClick={onClose} title={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.75, lineHeight: 1.4 }}>{tr("Point this at a government/company OGC service URL (e.g. a provincial bedrock geology WMS, an airborne mag WMS, or a claim-tenure WFS) — the same kind of service you'd add in QGIS. WMS layers import as a raster drape for a chosen area; WFS layers import as a boundary/vector layer.")}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={service} onChange={(e) => { setService(e.target.value); setLayers(null); setSelectedName(""); setResult(null); setCapsError(null); }} style={{ ...sel, width: 100 }}>
              <option value="wms">{tr("WMS")}</option>
              <option value="wfs">{tr("WFS")}</option>
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={tr("https://example.gov/geoserver/wms")}
              style={{ ...inp, flex: 1 }}
              onKeyDown={(e) => { if (e.key === "Enter") fetchCapabilities(); }}
            />
            <button onClick={fetchCapabilities} disabled={!url.trim() || loadingCaps} style={{ ...btn(true), width: "auto", padding: "0 12px", display: "flex", alignItems: "center", gap: 6, opacity: url.trim() && !loadingCaps ? 1 : 0.5 }}>
              {loadingCaps ? <Loader2 size={14} className="spin" /> : null}{" "}{tr("Fetch layers")}</button>
          </div>
          {capsError && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-danger-solid)" }}>{capsError}</div>}

          {layers && (
            <div>
              <div style={labelStyle}>{tr("{layers} {v} found", { layers: layers.length, v: tr(layers.length === 1 ? "layer" : "layers") })}</div>
              <select value={selectedName} onChange={(e) => selectLayer(e.target.value)} style={{ ...sel, width: "100%" }}>
                <option value="">{tr("Choose a layer…")}</option>
                {layers.map((l) => <option key={l.name} value={l.name}>{l.title || l.name}</option>)}
              </select>
              {selectedLayer?.abstract && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7, marginTop: 6, lineHeight: 1.4 }}>{selectedLayer.abstract}</div>}
            </div>
          )}

          {selectedLayer && service === "wms" && (
            <div>
              <div style={labelStyle}>{tr("Area")}</div>
              {bboxLonLat ? (
                <div style={{ fontSize: "var(--font-size-sm)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>~{(bboxLonLat[2] - bboxLonLat[0]).toFixed(3)}° × {(bboxLonLat[3] - bboxLonLat[1]).toFixed(3)}°</span>
                  <button onClick={() => setAreaPickerOpen(true)} style={{ ...btn(false), width: "auto", padding: "4px 8px" }}>{tr("Draw a different area…")}</button>
                </div>
              ) : (
                <button onClick={() => setAreaPickerOpen(true)} style={{ ...btn(false), width: "auto", padding: "4px 8px" }}>{tr("Draw an area…")}</button>
              )}
              <div style={{ ...labelStyle, marginTop: 10 }}>{tr("Detail")}</div>{/* TASKS.csv #840 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)", flexWrap: "wrap" }}>
                <select value={wmsDetail} onChange={(e) => setWmsDetail(e.target.value)} aria-label={tr("Image detail")} style={{ ...sel, width: "auto" }}
                  title={tr("The longest side of the imported image. Larger images are fetched as several map requests and stitched; they take longer and make the project file bigger.")}>
                  {Object.entries(WMS_DETAIL).map(([k, d]) => <option key={k} value={k}>{tr("{label} ({px} px)", { label: tr(d.label), px: d.longPx.toLocaleString() })}</option>)}
                </select>
                {wmsPlan && <span style={{ opacity: 0.75 }}>{tr("~{m} m pixels · {w} × {h} px · {n} map requests", { m: fmtM(wmsPlan.m), w: wmsPlan.width, h: wmsPlan.height, n: wmsPlan.requests })}</span>}
              </div>
              <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>{tr("Only as sharp as the service's own imagery: past its native resolution a higher detail just enlarges the same pixels. Use services whose terms allow you to save their images.")}</div>
            </div>
          )}

          {selectedLayer && service === "wfs" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }} title={collarsLoaded ? undefined : tr("No collars loaded yet — nothing to clip against, so this has no effect.")}>
              <input type="checkbox" checked={clipToArea} disabled={!collarsLoaded} onChange={(e) => setClipToArea(e.target.checked)} />{tr("Limit to the current project area (recommended for province/country-wide layers)")}</label>
          )}
          {selectedLayer && service === "wfs" && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }}>{tr("Import as")}<select value={wfsAs} onChange={(e) => setWfsAs(e.target.value)} style={{ ...sel, width: "auto" }}>
                <option value="map">{tr("Map layer (keeps attributes)")}</option>
                <option value="lines">{tr("Boundary lines (3D outlines only)")}</option>
              </select>
            </label>
          )}

          {result && <div style={{ fontSize: "var(--font-size-base)", color: result.ok ? "#2f8f5b" : result.warn ? "var(--color-warn-text)" : "var(--color-danger-solid)" }}>{result.text}</div>}

          {selectedLayer && (
            <button onClick={doImport} disabled={busy || (service === "wms" && !bboxLonLat)} style={{ ...btn(true), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={14} className="spin" /> : <Download size={14} />} {busy ? (wmsProgress ? tr("Fetching {done}/{total}…", wmsProgress) : tr("Importing…")) : tr("Import this layer")}
            </button>
          )}
        </div>
      </div>
      {areaPickerOpen && (
        <BasemapView
          mode="draw"
          initialBboxLonLat={bboxLonLat || defaultBboxLonLat}
          title={tr("Draw the area to fetch this WMS layer for")}
          confirmLabel="Use this area"
          onClose={() => setAreaPickerOpen(false)}
          onConfirm={(bbox) => { setBboxLonLat(bbox); setAreaPickerOpen(false); }}
        />
      )}
    </div>
  );
}

// TASKS.csv #840 — a ground pixel size for the plan line: one decimal under 10 m, whole metres above
const fmtM = (m) => (m < 10 ? m.toFixed(1) : Math.round(m).toLocaleString());
