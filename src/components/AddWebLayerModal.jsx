import React, { useMemo, useRef, useState } from "react";
import AreaChooser, { useFetchArea } from "./AreaChooser.jsx"; // TASKS.csv #3954
import { Loader2 } from "./icons.js";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { label as labelStyle, sel, inp } from "../lib/modalStyles.js";
import { fetchWmsLayers, fetchWmsMapAsRaster, fetchWfsFeatureTypes, fetchWfsFeaturesAsBoundary, defaultWmsArea, wfsTruncationText, pickWfsStyleField, WMS_DETAIL, wmsImageSize, wmsPixelMetres, wmsTilePlan, WMS_DEFAULT_MAX_REQUEST } from "../lib/webLayers.js";
import { buildLayer, autoColorFor } from "../lib/mapLayerBuild.js";
import { autoCategories } from "../lib/mapLayers.js";
import BasemapView from "./BasemapView.jsx";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786 — messages in the interface language
import { COMMON_WEB_SERVICES, presetService, servicesFirst } from "../lib/webServices.js"; // TASKS.csv #1468; servicesFirst: #3000
import { useStartProjectJob } from "../lib/store.jsx"; // TASKS.csv #3953 — the stable starter only (no re-render on store writes)
import { landed, noJob } from "../lib/projectJobs.js"; // TASKS.csv #3953 — a layer lands only in the project it was fetched for

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
export default function AddWebLayerModal({ onClose, addRaster, addBoundary, addMapLayer, projectEpsg, defaultBboxLonLat, areaOptions = null }) {
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const startProjectJob = useStartProjectJob(); // TASKS.csv #3953
  const [service, setService] = useState("wms"); // "wms" | "wfs"
  const [url, setUrl] = useState("");
  const [presetId, setPresetId] = useState(""); // #1468 — a common service picked from the list
  const preset = COMMON_WEB_SERVICES.find((p) => p.id === presetId && (p.wms === url || p.wfs === url)) || null;
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [capsError, setCapsError] = useState(null);
  const [layers, setLayers] = useState(null); // [{name,title,...}] once fetched
  const [fetchedFor, setFetchedFor] = useState(""); // TASKS.csv #4073 — the service and URL the layers came from: Back to the first step and on again asks nothing new
  const [selectedName, setSelectedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {ok, text}
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [clipToArea, setClipToArea] = useState(true); // WFS only
  const [wfsAs, setWfsAs] = useState("map"); // TASKS.csv #544 — "map": Map layer with attributes | "lines": boundary lines
  // TASKS.csv #840 — WMS image detail (longest side), remembered per computer like the satellite fetch's level
  const [wmsDetail, setWmsDetailState] = useState(() => { try { const v = localStorage.getItem("geostrix_wms_detail"); return WMS_DETAIL[v] ? v : "standard"; } catch { return "standard"; } });
  const setWmsDetail = (v) => { setWmsDetailState(v); try { localStorage.setItem("geostrix_wms_detail", v); } catch { /* private window: session only */ } };
  const [wmsProgress, setWmsProgress] = useState(null);

  const selectedLayer = layers?.find((l) => l.name === selectedName) || null;
  // TASKS.csv #3954 — the WMS area from the shared chooser (lib/fetchAreas.js); #543: the project area first, the layer's own extent only without one
  const options = useMemo(() => {
    const base = areaOptions || (defaultBboxLonLat ? [{ id: "project", kind: "project", label: tr("Project area"), bboxLonLat: defaultBboxLonLat }] : []);
    return base.length || !selectedLayer?.bboxLonLat ? base : [{ id: "layer", kind: "layer", label: tr("The layer's extent"), bboxLonLat: defaultWmsArea(selectedLayer.bboxLonLat, null) }];
  }, [areaOptions, defaultBboxLonLat, selectedLayer]);
  const area = useFetchArea("web", options);
  const bboxLonLat = area.bboxLonLat; // WMS only

  // svc / u / want: a common service picked from the list (#1468), fetched at once with its layer chosen
  // TASKS.csv #3835 — choosing a common service used to ask it for its layers at once, before 'Fetch layers' was pressed: nothing goes online until the button (or Enter in the URL box). The layer a preset wants is kept for then.
  const wantRef = useRef(null);
  const fetchCapabilities = async (svc = service, u = url, want = wantRef.current) => {
    if (!u.trim()) return false;
    setLoadingCaps(true); setCapsError(null); setLayers(null); setSelectedName(""); setResult(null);
    try {
      const found = svc === "wms" ? await fetchWmsLayers(u.trim()) : await fetchWfsFeatureTypes(u.trim());
      if (!found.length) { setCapsError(tr("No layers found in this service's capabilities — double check the URL.")); return false; }
      setLayers(found); setFetchedFor(`${svc} ${u.trim()}`);
      const pick = want && found.find((l) => l.name === want);
      if (pick) setSelectedName(pick.name);
      return true;
    } catch (err) {
      setCapsError(err.message);
      return false;
    } finally {
      setLoadingCaps(false);
    }
  };
  // TASKS.csv #4073 — Fetch layers is the first step's gold button (and Enter in the URL box): the layers found, it goes on to them
  const fetchAndNext = async () => { if (await fetchCapabilities()) setAt(1); };

  const selectLayer = (name) => {
    setSelectedName(name);
  };

  const doImport = async () => {
    if (!selectedLayer) return;
    setBusy(true); setResult(null);
    const job = startProjectJob ? startProjectJob({ label: tr("Web layers") }) : noJob(tr("Web layers")); // TASKS.csv #3953
    try {
      if (service === "wms") {
        if (!bboxLonLat) throw new Error(tr("Draw an area first: this layer has no declared extent and there is no project area to default to."));
        const raster = await fetchWmsMapAsRaster({ baseUrl: url.trim(), layerName: selectedLayer.name, bboxLonLat, projectEpsg, longPx: WMS_DETAIL[wmsDetail].longPx,
          maxRequest: { width: selectedLayer.maxWidth, height: selectedLayer.maxHeight }, onProgress: (done, total) => setWmsProgress(total > 1 ? { done, total } : null), signal: job.signal /* #3963 */ }); // #840
        if (!(await landed(job))) return; // TASKS.csv #3953 — into the project it started in (the finally clears the busy state)
        addRaster({ name: `WMS: ${selectedLayer.title || selectedLayer.name}`, bbox: raster.bbox, dataUrl: raster.dataUrl });
        const title = selectedLayer.title || selectedLayer.name;
        const failedNote = raster.failedTiles ? " " + tr("{n} of {total} requests failed and are left transparent.", { n: raster.failedTiles, total: raster.tiles }) : "";
        setResult({ ok: !raster.failedTiles, warn: !!raster.failedTiles, text: tr("Imported \"{title}\" as a raster drape: {w} × {h} px, ≈ {m} m pixels ({tiles} map requests).", { title, w: raster.width, h: raster.height, m: fmtM(raster.pixelM), tiles: raster.tiles }) + failedNote });
      } else {
        const clip = clipToArea && defaultBboxLonLat ? defaultBboxLonLat : null;
        const boundary = await fetchWfsFeaturesAsBoundary({ baseUrl: url.trim(), typeName: selectedLayer.name, projectEpsg, clipBboxLonLat: clip, signal: job.signal /* #3963 */ });
        if (!(await landed(job))) return; // TASKS.csv #3953
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
          setResult({ ok: !more, warn: !!more, text: tr("Imported {n} feature(s) as a Map layer with {f} attribute field(s){coloured}{clip}.", { n: layer.features.length, f: layer.fields.length, coloured: layer.styleField ? tr(", coloured by {v}", { v: layer.styleField }) : "", clip: clipNote }) + (more ? " " + more : "") }); // #1974
        } else {
          addBoundary({ name: `WFS: ${title}`, polylines: boundary.polylines });
          const why = wfsAs === "map" && !boundary.geomType ? tr(" (points or mixed geometry — Map layers take polygons or lines)") : "";
          setResult({ ok: !more, warn: !!more, text: tr("Imported {n} feature part(s) as boundary lines{why}{clip}.", { n: boundary.polylines.length, why, clip: clipNote }) + (more ? " " + more : "") });
        }
      }
    } catch (err) {
      if (!job.gone) setResult({ ok: false, text: err.message }); // #3963 — a project closed mid-download: the banner says it
    } finally {
      setBusy(false);
      setWmsProgress(null);
      job.end(); // TASKS.csv #3953
    }
  };
  // #840 — what the chosen detail gives for this area: image size, ground pixel, number of GetMap requests
  const wmsPlan = (() => {
    if (service !== "wms" || !selectedLayer || !bboxLonLat) return null;
    const longPx = WMS_DETAIL[wmsDetail].longPx, { width, height } = wmsImageSize(bboxLonLat, longPx);
    const maxW = Math.min(4096, selectedLayer.maxWidth || WMS_DEFAULT_MAX_REQUEST), maxH = Math.min(4096, selectedLayer.maxHeight || selectedLayer.maxWidth || WMS_DEFAULT_MAX_REQUEST);
    return { width, height, m: wmsPixelMetres(bboxLonLat, longPx), requests: wmsTilePlan(width, height, maxW, maxH).length };
  })();

  // TASKS.csv #4073 (Matt: "similar for all pop up windows") — three steps: 1 Service (a common one or a URL; Fetch layers is its gold button and
  // the only thing that goes online), 2 Layer, 3 Import (WMS: the area and detail; WFS: the clip and what it becomes). The long explanations are in the Help card
  const fetched = !!layers && fetchedFor === `${service} ${url.trim()}`;
  const heading = tr("Add web layer (WMS / WFS)");
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{heading}</summary>
      <div style={note}>{tr("Point this at an OGC service URL, as in QGIS. A WMS imports as a raster drape for a chosen area; a WFS as a Map layer that keeps its attributes, or as boundary lines.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Only as sharp as the service's own imagery: past its native resolution, more detail just enlarges pixels. Use services whose terms allow saving their images.")}</div>
      <div style={{ ...note, marginTop: 6 }}>{tr("Limiting a WFS to the project area is recommended for province- or country-wide layers.")}</div>
    </details>
  );
  const steps = [
    { key: "service", label: tr("Service"), primary: fetched ? { label: tr("Next: layer") } : { label: loadingCaps ? tr("Fetching…") : tr("Fetch layers"), onClick: fetchAndNext, disabled: !url.trim() || loadingCaps }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* TASKS.csv #1468 — common open services: picking one fills the URL and lists its layer */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)" }}>{tr("Common services")}
          <select value={preset ? presetId : ""} aria-label={tr("Common services")} style={{ ...sel, flex: 1 }}
            onChange={(e) => { const p = COMMON_WEB_SERVICES.find((x) => x.id === e.target.value); if (!p) { setPresetId(""); return; } const s = presetService(p, service); setPresetId(p.id); setService(s); setUrl(p[s]); wantRef.current = p.layer || null; setLayers(null); setSelectedName(""); setResult(null); setCapsError(null); }}>
            <option value="">{tr("Choose one, or type a URL below…")}</option>
            {servicesFirst(COMMON_WEB_SERVICES, defaultBboxLonLat ? { lon: (defaultBboxLonLat[0] + defaultBboxLonLat[2]) / 2, lat: (defaultBboxLonLat[1] + defaultBboxLonLat[3]) / 2 } : null).map((p) => <option key={p.id} value={p.id}>{p.label}{p.wfs ? "" : ` (${tr("WMS only")})`}</option>)}
          </select>
        </label>
        {/* what goes online, and when, stays seen (TASKS.csv #3835); so does the licence */}
        <div style={{ fontSize: "var(--font-size-xs)", opacity: 0.7 }}>{tr("Choosing a service only fills the URL. Nothing goes online until you press Fetch layers.")}</div>
        {preset && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.75 }}>{tr("Licence: {v}. Credit the publisher in figures you share.", { v: preset.licence })}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <select value={service} aria-label={tr("Service")} onChange={(e) => { const s = e.target.value; setService(s); setLayers(null); setSelectedName(""); setResult(null); setCapsError(null); if (preset) { if (preset[s]) setUrl(preset[s]); else { setPresetId(""); setUrl(""); } } }} style={{ ...sel, width: 100 }}>
            <option value="wms">{tr("WMS")}</option>
            <option value="wfs">{tr("WFS")}</option>
          </select>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={service === "wfs" ? tr("https://example.gov/geoserver/wfs") : tr("https://example.gov/geoserver/wms")}
            style={{ ...inp, flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") fetchAndNext(); }}
          />
          {loadingCaps && <Loader2 size={14} className="spin" style={{ alignSelf: "center" }} />}
        </div>
        {capsError && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-danger-solid)" }}>{capsError}</div>}
      </div>
    ) },
    { key: "layer", label: tr("Layer"), primary: { label: tr("Next: details"), disabled: !selectedLayer }, hint: layers ? "" : tr("Fetch layers first."), render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
        {layers && (
          <div>
            <div style={labelStyle}>{tr("{layers} {v} found", { layers: layers.length, v: tr(layers.length === 1 ? "layer" : "layers") })}</div>
            <select value={selectedName} onChange={(e) => selectLayer(e.target.value)} aria-label={tr("Layer")} style={{ ...sel, width: "100%" }}>
              <option value="">{tr("Choose a layer…")}</option>
              {layers.map((l) => <option key={l.name} value={l.name}>{l.title || l.name}</option>)}
            </select>
            {selectedLayer?.abstract && <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7, marginTop: 6, lineHeight: 1.4 }}>{selectedLayer.abstract}</div>}
          </div>
        )}
      </div>
    ) },
    { key: "import", label: tr("Details"), primary: { label: busy ? (wmsProgress ? tr("Fetching {done}/{total}…", wmsProgress) : tr("Importing…")) : tr("Import this layer"), onClick: doImport, disabled: !selectedLayer || busy || (service === "wms" && !bboxLonLat) },
      render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {selectedLayer && <div style={{ fontWeight: 600, fontSize: "var(--font-size-base)" }}>{selectedLayer.title || selectedLayer.name}</div>}
        {selectedLayer && service === "wms" && (
          <div>
            <AreaChooser options={options} area={area} disabled={busy} onDraw={() => setAreaPickerOpen(true)} />{/* #3954 */}
            <div style={{ ...labelStyle, marginTop: 10 }}>{tr("Detail")}</div>{/* TASKS.csv #840 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)", flexWrap: "wrap" }}>
              <select value={wmsDetail} onChange={(e) => setWmsDetail(e.target.value)} aria-label={tr("Image detail")} style={{ ...sel, width: "auto" }}
                title={tr("The longest side of the imported image. Larger ones take several requests, take longer and make a bigger project file.")}>
                {Object.entries(WMS_DETAIL).map(([k, d]) => <option key={k} value={k}>{tr("{label} ({px} px)", { label: tr(d.label), px: d.longPx.toLocaleString() })}</option>)}
              </select>
              {wmsPlan && <span style={{ opacity: 0.75 }}>{tr("≈ {m} m pixels · {w} × {h} px · {n} map requests", { m: fmtM(wmsPlan.m), w: wmsPlan.width, h: wmsPlan.height, n: wmsPlan.requests })}</span>}
            </div>
            {/* the permission line stays seen where the image is fetched; why more detail may not help is in the Help card */}
            <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>{tr("Use services whose terms allow saving their images.")}</div>
          </div>
        )}

        {selectedLayer && service === "wfs" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }} title={defaultBboxLonLat ? undefined : tr("No project area yet (no drillholes, terrain, map layers or samples): nothing to clip against, so this has no effect.")}>{/* #1970 — the clip needs the project area, not drillholes */}
            <input type="checkbox" checked={clipToArea} disabled={!defaultBboxLonLat} onChange={(e) => setClipToArea(e.target.checked)} />{tr("Limit to the project area")}</label>
        )}
        {selectedLayer && service === "wfs" && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)" }}>{tr("Import as")}<select value={wfsAs} onChange={(e) => setWfsAs(e.target.value)} style={{ ...sel, width: "auto" }}>
              <option value="map">{tr("Map layer (keeps attributes)")}</option>
              <option value="lines">{tr("Boundary lines (3D outlines only)")}</option>
            </select>
          </label>
        )}

        {result && <div style={{ fontSize: "var(--font-size-base)", color: result.ok ? "#2f8f5b" : result.warn ? "var(--color-warn-text)" : "var(--color-danger-solid)" }}>{result.text}</div>}
      </div>
    ) },
  ];
  return (
    <>
      {/* a click on the dimmed view around it closes it, as before */}
      <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(560px, 94vw)" overlayProps={{ onClick: (e) => { if (e.target === e.currentTarget) onClose(); } }} />
      {areaPickerOpen && (
        <BasemapView
          mode="draw"
          initialBboxLonLat={bboxLonLat || defaultBboxLonLat}
          title={tr("Draw the area to fetch this WMS layer for")}
          confirmLabel="Use this area"
          onClose={() => setAreaPickerOpen(false)}
          areaOptions={options} /* #3954 */
          onConfirm={(bbox) => { area.setDrawn(bbox); setAreaPickerOpen(false); }}
        />
      )}
    </>
  );
}

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
// TASKS.csv #840 — a ground pixel size for the plan line: one decimal under 10 m, whole metres above
const fmtM = (m) => (m < 10 ? m.toFixed(1) : Math.round(m).toLocaleString());
