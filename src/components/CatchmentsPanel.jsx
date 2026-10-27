// TASKS.csv #845 — catchments of stream-sediment sites from the project terrain, Hawkes' dilution correction, the
// drainage ranking and the follow-up reaches (lib/hydrology.js, lib/catchments.js). One sample type at a time. The
// terrain is routed once per terrain in a worker (lib/hydrologyClient.js); everything else recomputes instantly.
import React, { useEffect, useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { routeTerrainAsync } from "../lib/hydrologyClient.js";
import { analyseCatchments, catchmentImage, streamNetwork, followUpGpx, STREAM_MEDIA, DEFAULT_CATCHMENT_OPTS } from "../lib/catchments.js";
import { pointTransform } from "../lib/reproject.js";
import { ensureExportCrs } from "../lib/projectCrsRequest.js"; // TASKS.csv #1021
import { gridToGeoTIFF, nodeGridGeometry, saveGeoTIFF } from "../lib/gridExport.js"; // TASKS.csv #854
import { makeValueGrid } from "../lib/raster.js";
import { f32ToB64 } from "../lib/inversion.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { saveFile } from "../lib/desktop.js";
import { overlay, backdropProps, sel, th, td, panel, header, rowBtn as btn } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped

const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : Math.abs(v) >= 1 || v === 0 ? v.toFixed(d) : v.toPrecision(Math.max(2, d))); // small values (Cu in %) keep their digits

export default function CatchmentsPanel({ onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const { surfaceSamples, surfaceElements, terrain, mapLayers = [], geochemThresholds = [], addRaster, addBoundary, project } = useStore();
  const units = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const media = useMemo(() => { const have = new Set(surfaceSamples.map((s) => s.medium)); const st = STREAM_MEDIA.filter((m) => have.has(m)); return st.length ? st : [...have]; }, [surfaceSamples]);
  const [opts, setOpts] = useState(() => ({ ...DEFAULT_CATCHMENT_OPTS, medium: media[0] || "stream sediment", symbol: surfaceElements.find((e) => e.symbol === "Cu")?.symbol || surfaceElements[0]?.symbol || null }));
  const set = (p) => setOpts((o) => ({ ...o, ...p }));
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!terrain) return;
    let alive = true;
    setStatus("routing");
    const t0 = performance.now();
    routeTerrainAsync(terrain).then((r) => { if (alive) { setRoute(r); setStatus({ ms: Math.round(performance.now() - t0) }); } }).catch((e) => alive && setStatus({ failed: e.message }));
    return () => { alive = false; };
  }, [terrain]);
  const a = useMemo(() => (route && opts.symbol ? analyseCatchments(surfaceSamples, route, terrain, opts, { units, thresholds: geochemThresholds, mapLayers }) : null), [route, surfaceSamples, terrain, opts, units, geochemThresholds, mapLayers]);
  const polyLayers = mapLayers.filter((l) => l.geomType === "polygon" && l.features?.length);
  const lithoLayer = polyLayers.find((l) => String(l.id) === String(opts.lithoLayer));
  const unit = units[opts.symbol] || "ppm";

  const showCatchments = () => {
    const img = catchmentImage(a), c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const [x0, y0, x1, y1] = terrain.bbox, hx = a.g.dx / 2, hy = a.g.dy / 2; // node grid -> pixel edges
    // TASKS.csv #851 — the productivity (or, without one, the class) rides along as the raster's values (#326 grid, block-
    // averaged like an imported GeoTIFF) so the Evidence overlay can use the ranked catchments as an evidence layer
    const { g, cls, prod } = cellBands(), band = prod.some(Number.isFinite) ? prod : cls;
    const vg = makeValueGrid(band, g.nx, g.ny, g.x0, g.yTop, g.dx, g.dy, (v) => !Number.isFinite(v));
    let valid = 0; for (let i = 0; i < vg.values.length; i++) if (Number.isFinite(vg.values[i])) valid++;
    addRaster({ name: `Catchments: ${opts.symbol} in ${opts.medium} (${a.thresholdLabel})`, bbox: [x0 - hx, y0 - hy, x1 + hx, y1 + hy], dataUrl: c.toDataURL("image/png"), drapeMode: "terrain", opacity: 0.8, grid: { ...vg, values: f32ToB64(vg.values), valid } });
    setMsg(tr("Added the catchments as a map layer draped on the terrain: red = anomalous, orange = above background, blue = background. The catchment {band} rides along as the raster's values, for the Targeting evidence overlay and GeoTIFF export.", { band: band === prod ? tr("productivity") : tr("class") }));
  };
  // class / site rank / productivity per terrain node: the GeoTIFF bands (#854) and the map raster's values (#851)
  const cellBands = () => {
    const g = nodeGridGeometry(terrain), n = g.nx * g.ny;
    const cls = new Float32Array(n).fill(NaN), rank = new Float32Array(n).fill(NaN), prod = new Float32Array(n).fill(NaN);
    for (let k = 0; k < n; k++) {
      const s = a.label[k];
      if (s < 0) continue;
      const r = a.results[s];
      if (!r?.placed) continue;
      cls[k] = r.anomalous ? 3 : r.value != null && a.background != null && r.value > a.background ? 2 : 1;
      if (r.rank) rank[k] = r.rank;
      if (r.productivity != null) prod[k] = r.productivity;
    }
    return { g, cls, rank, prod };
  };
  const showStreams = () => {
    const lines = streamNetwork(route, terrain, a.minCells);
    // open lines (#408: boundaries without closedFlags are drawn closed), lifted clear of the terrain mesh
    addBoundary({ name: `Streams (over ${opts.minAreaKm2} km², Strahler order 1-${Math.max(0, ...lines.map((l) => l.order))})`, polylines: lines.map((l) => l.points.map(([x, y]) => ({ x, y }))), closedFlags: lines.map(() => false), lift: 4, color: "#2f7fc1", drapeMode: "terrain" });
    setMsg(tr("Added {n} stream links as lines draped on the terrain.", { n: lines.length }));
  };
  const showReaches = () => {
    const rs = a.results.filter((r) => r.reach?.length > 1);
    addBoundary({ name: `Follow-up reaches: ${opts.symbol} in ${opts.medium}`, polylines: rs.map((r) => r.reach.map(([x, y]) => ({ x, y }))), closedFlags: rs.map(() => false), lift: 6, color: "#d7301f", drapeMode: "terrain" });
    setMsg(tr("Added {n} follow-up reach(es) as lines.", { n: rs.length }));
  };
  // TASKS.csv #1021 — the coordinate system is asked for if it was never chosen, and a GPS file is never written with raw
  // x / y as latitude / longitude (when no transform to WGS 84 loads it says so instead)
  const exportGpx = async () => {
    const epsg = await ensureExportCrs(project); if (!epsg) return;
    const T = pointTransform(epsg, 4326);
    if (!T) { setMsg(tr("EPSG:{epsg} could not be converted to latitude / longitude, so no GPS file was written.", { epsg })); return; }
    saveFile({ suggestedName: `follow_up_${opts.symbol}.gpx`, filters: [{ name: "GPX", extensions: ["gpx"] }], content: followUpGpx(a, (x, y) => T(x, y), `Follow-up reaches: ${opts.symbol} in ${opts.medium}`) });
  };
  // TASKS.csv #854 — the catchment grid for QGIS: class / site rank / productivity per cell
  const exportTif = async () => {
    const epsg = await ensureExportCrs(project); if (!epsg) return; // #1021
    const { g, cls, rank, prod } = cellBands();
    saveGeoTIFF(`catchments_${opts.symbol}.tif`, gridToGeoTIFF({ ...g, bands: [{ values: cls }, { values: rank }, { values: prod }], epsg }));
    setMsg(tr("GeoTIFF: band 1 = class (1 background, 2 above background, 3 anomalous), band 2 = site rank, band 3 = productivity; no data −9999; {epsg}.", { epsg: `EPSG:${epsg}` }));
  };
  const exportCsv = () => saveFile({ suggestedName: `catchments_${opts.symbol}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(a.results.map((r) => ({
    rank: r.rank ?? "", sample_id: r.sample_id, x: r.x, y: r.y, [`${opts.symbol}_${unit}`]: r.value ?? "", catchment_km2: r.placed ? r.areaKm2.toFixed(4) : "", own_km2: r.placed ? r.ownKm2.toFixed(4) : "",
    strahler: r.order ?? "", snapped_m: r.placed ? r.moved.toFixed(0) : "", productivity: r.productivity == null ? "" : r.productivity.toFixed(3), anomalous: r.anomalous ? "yes" : "no",
    follow_up_reach_m: r.reachM ? r.reachM.toFixed(0) : "", lithology: r.lith ? r.lith.slice(0, 3).map((l) => `${l.unit} ${l.pct.toFixed(0)}%`).join("; ") : "",
    background: a.background, threshold: a.threshold, rule: a.thresholdLabel, note: r.placed ? "" : "outside the terrain / not placed",
  }))) });

  if (!terrain) return (
    <Shell onClose={onClose}><div style={note}>{tr("Catchments are computed from the project terrain: load a DEM or fetch SRTM / Copernicus terrain (Maps tab) over your sample area first. A finer terrain (High or Very high detail) resolves small first-order catchments.")}</div></Shell>
  );
  return (
    <Shell onClose={onClose} sub={status === "routing" ? tr("Routing the terrain…") : status?.failed ? tr("Routing failed: {m}", { m: status.failed }) : route ? tr("Terrain {w} × {h} cells of {dx} × {dy} m, routed in {ms} ms; {f} cells raised to fill depressions.", { w: route.w, h: route.h, dx: Math.round(route.dx), dy: Math.round(route.dy), ms: status?.ms ?? "—", f: route.filledCells.toLocaleString() }) : ""}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={ctl}>{tr("Sample type")}<select value={opts.medium} onChange={(e) => set({ medium: e.target.value })} style={{ ...sel, display: "block", marginTop: 4 }}>{media.map((m) => <option key={m} value={m}>{tr(m)}</option>)}</select></label>
        <label style={ctl}>{tr("Element")}<select value={opts.symbol || ""} onChange={(e) => set({ symbol: e.target.value })} style={{ ...sel, display: "block", marginTop: 4 }}>{surfaceElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({e.unit})</option>)}</select></label>
        <label style={ctl}>{tr("Snap sites within (m)")}<input type="number" min="0" step="10" value={opts.snapM} onChange={(e) => set({ snapM: Math.max(0, Number(e.target.value) || 0) })} style={{ ...sel, display: "block", marginTop: 4, width: 90 }} /></label>
        <label style={ctl}>{tr("Streams from (km²)")}<input type="number" min="0.01" step="0.1" value={opts.minAreaKm2} onChange={(e) => set({ minAreaKm2: Math.max(0.001, Number(e.target.value) || 0.5) })} style={{ ...sel, display: "block", marginTop: 4, width: 90 }} /></label>
        <label style={ctl}>{tr("Background")}<select value={opts.background} onChange={(e) => set({ background: e.target.value })} style={{ ...sel, display: "block", marginTop: 4 }}><option value="median">{tr("Median of the sites")}</option><option value="value">{tr("A value")}</option></select></label>
        {opts.background === "value" && <label style={ctl}>{unit}<input type="number" min="0" step="any" value={opts.backgroundValue ?? ""} onChange={(e) => set({ backgroundValue: Number(e.target.value) || null })} style={{ ...sel, display: "block", marginTop: 4, width: 90 }} /></label>}
        <label style={ctl}>{tr("Anomalous from")}<select value={opts.anomalyFrom} onChange={(e) => set({ anomalyFrom: e.target.value })} style={{ ...sel, display: "block", marginTop: 4 }}><option value="saved">{tr("Saved threshold (Geochem > Thresholds)")}</option><option value="percentile">{tr("A percentile")}</option></select></label>
        {opts.anomalyFrom === "percentile" && <label style={ctl}>{tr("Percentile")}<input type="number" min="50" max="99.9" step="1" value={opts.percentile} onChange={(e) => set({ percentile: Math.min(99.9, Math.max(50, Number(e.target.value) || 90)) })} style={{ ...sel, display: "block", marginTop: 4, width: 70 }} /></label>}
        <label style={ctl}>{tr("Catchment geology (optional)")}<select value={opts.lithoLayer || ""} onChange={(e) => set({ lithoLayer: e.target.value || null, lithoField: null })} style={{ ...sel, display: "block", marginTop: 4, maxWidth: 170 }}><option value="">{tr("— none —")}</option>{polyLayers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        {lithoLayer && <label style={ctl}>{tr("Unit field")}<select value={opts.lithoField || ""} onChange={(e) => set({ lithoField: e.target.value || null })} style={{ ...sel, display: "block", marginTop: 4 }}><option value="">—</option>{(lithoLayer.fields || []).map((f) => <option key={f} value={f}>{f}</option>)}</select></label>}
      </div>

      {a && (
        <>
          <div style={note}>
            {tr("{n} {medium} sites; background {bg} {unit} ({how}); anomalous from {thr} {unit} ({rule}). Productivity = (value − background) × catchment area (Hawkes 1976), in {unit}·km²: it assumes uniform erosion and clastic transport, over-corrects big catchments with lakes or flat valleys, and does nothing for metals carried in solution.", { n: a.results.length, medium: tr(opts.medium), bg: fmt(a.background), unit, how: opts.background === "value" ? tr("your value") : tr("median of the sites"), thr: fmt(a.threshold), rule: a.thresholdLabel })}
          </div>
          {a.notes.map((n) => <div key={n.text} style={{ ...note, color: "var(--color-warn-text)" }}>{tr(n.text, n.params)}</div>)}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={btn(true)} onClick={showCatchments}>{tr("Show catchments on the map")}</button>
            <button type="button" style={btn(false)} onClick={showStreams}>{tr("Add the stream network")}</button>
            <button type="button" style={btn(false)} onClick={showReaches} disabled={!a.results.some((r) => r.reach?.length > 1)}>{tr("Add follow-up reaches")}</button>
            <button type="button" style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6 }} onClick={exportGpx} disabled={!a.results.some((r) => r.anomalous)}><Download size={14} />GPX</button>
            <button type="button" style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6 }} onClick={exportCsv}><Download size={14} />CSV</button>
            <button type="button" style={{ ...btn(false), display: "flex", alignItems: "center", gap: 6 }} onClick={exportTif} title={tr("The catchment grid as a GeoTIFF for QGIS")}><Download size={14} />GeoTIFF</button>
          </div>
          {msg && <div style={{ ...note, color: "var(--color-text)" }}>{msg}</div>}
          <div style={{ overflow: "auto", maxHeight: 380 }}>
            <table style={tbl}>
              <thead><tr><th style={th}>{tr("Rank")}</th><th style={{ ...th, textAlign: "left" }}>{tr("Site")}</th><th style={th}>{opts.symbol} ({unit})</th><th style={th}>{tr("Catchment km²")}</th><th style={th}>{tr("Own km²")}</th><th style={th}>{tr("Order")}</th><th style={th}>{tr("Productivity")}</th><th style={th}>{tr("Follow-up reach")}</th>{lithoLayer && opts.lithoField && <th style={{ ...th, textAlign: "left" }}>{tr("Catchment geology")}</th>}</tr></thead>
              <tbody>{[...a.results].sort((x, y) => (x.rank ?? 1e9) - (y.rank ?? 1e9)).map((r) => (
                <tr key={r.k} style={{ color: r.placed ? undefined : "var(--color-text-muted)" }}>
                  <td style={td}>{r.rank ?? "—"}</td>
                  <td style={{ ...td, textAlign: "left" }}>{r.sample_id || `#${r.k + 1}`}</td>
                  <td style={{ ...td, color: r.anomalous ? "var(--color-danger-fg)" : undefined, fontWeight: r.anomalous ? 600 : 400 }}>{fmt(r.value, 3)}</td>
                  <td style={td}>{r.placed ? fmt(r.areaKm2) : tr("not placed")}</td>
                  <td style={td}>{r.placed ? fmt(r.ownKm2) : ""}</td>
                  <td style={td}>{r.order || "—"}</td>
                  <td style={td}>{fmt(r.productivity)}</td>
                  <td style={td}>{r.reachM ? `${Math.round(r.reachM).toLocaleString()} m` : r.anomalous ? tr("anomalous upstream") : ""}</td>
                  {lithoLayer && opts.lithoField && <td style={{ ...td, textAlign: "left" }}>{r.lith ? r.lith.slice(0, 2).map((l) => `${l.unit} ${l.pct.toFixed(0)}%`).join(", ") : ""}</td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={note}>{tr("Follow-up reach: an anomalous site with no anomalous site upstream; the channel above it, up to the next sites or the stream head, is the one to walk. 'Anomalous upstream': the anomaly comes from further up.")}</div>
        </>
      )}
    </Shell>
  );
}

function Shell({ onClose, sub, children }) {
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelBox} role="dialog" aria-modal="true" aria-label={tr("Stream catchments")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Stream catchments")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{sub || tr("Catchments, dilution correction and drainage ranking for stream programs")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        <div style={{ display: "flex", padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}><span style={{ flex: 1 }} /><button type="button" style={btn(false)} onClick={onClose}>{tr("Close")}</button></div>
      </div>
    </div>
  );
}

const panelBox = panel({ width: "min(1100px, 96vw)", maxHeight: "92vh" }); // TASKS.csv #997 — the shared modal chrome
const ctl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const tbl = { borderCollapse: "collapse", fontSize: "var(--font-size-sm)", width: "100%" };
