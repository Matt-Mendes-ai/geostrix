// TASKS.csv #2005 — Maps > Web layers > Macrostrat geology: the geologic map for the project area as a raster drape (the layer's eye
// turns it off, the bin removes it), and the map units at the project centre with their original maps. Data CC BY 4.0: the credit is
// shown here, kept in the layer's name and provenance. Nothing is requested until a button is pressed.
import React, { useState } from "react";
import { X, Globe, Loader2 } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, btn } from "../lib/modalStyles.js";
import { fetchMacrostratRaster, fetchMacrostratUnits } from "../lib/macrostratFetch.js";
import { MACROSTRAT_CREDIT, MACROSTRAT_TILE_URL } from "../lib/macrostrat.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };

export default function MacrostratModal({ onClose, addRaster, projectEpsg, bboxLonLat }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [units, setUnits] = useState(null);
  const centre = bboxLonLat ? [(bboxLonLat[1] + bboxLonLat[3]) / 2, (bboxLonLat[0] + bboxLonLat[2]) / 2] : null; // lat, lng
  const addLayer = async () => {
    setMsg(null); setBusy(tr("Fetching Macrostrat tiles…"));
    try {
      const r = await fetchMacrostratRaster({ bboxLonLat, projectEpsg, onProgress: (d, n) => setBusy(tr("Fetching Macrostrat tiles… {d} of {n}", { d, n })) });
      addRaster({ name: "Macrostrat geology (CC BY 4.0)", bbox: r.bbox, dataUrl: r.dataUrl, opacity: 0.7,
        provenance: { tool: "Macrostrat geologic map tiles", source: MACROSTRAT_TILE_URL("{z}", "{x}", "{y}"), zoom: r.zoom, areaLonLat: bboxLonLat, credit: MACROSTRAT_CREDIT, fetched: new Date().toISOString().slice(0, 10) } });
      setMsg({ ok: !r.failedTiles, text: tr("Added \"Macrostrat geology (CC BY 4.0)\" as a raster drape: {w} × {h} px, ~{m} m pixels, from {n} tiles at zoom {z}. Turn it off with its eye in GeoTIFF / GXF.", { w: r.width, h: r.height, m: Math.round(r.pixelM), n: r.tiles, z: r.zoom }) + (r.failedTiles ? " " + tr("{n} of {total} requests failed and are left transparent.", { n: r.failedTiles, total: r.tiles }) : "") });
    } catch (e) { setMsg({ ok: false, text: tr("Macrostrat: {message}", { message: e.message }) }); }
    setBusy(null);
  };
  const listUnits = async () => {
    setMsg(null); setBusy(tr("Asking Macrostrat for the units at the project centre…"));
    try { setUnits(await fetchMacrostratUnits(centre[0], centre[1])); } catch (e) { setMsg({ ok: false, text: tr("Macrostrat: {message}", { message: e.message }) }); }
    setBusy(null);
  };
  return (
    <div style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={tr("Macrostrat geology")} style={{ ...panel, width: 560, maxWidth: "94vw", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={header}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Globe size={16} />{tr("Macrostrat geology")}</span>
          <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={note}>{tr("Macrostrat compiles geologic maps from many surveys into one map of the world. Its map is a regional picture at the scale of its sources (often 1:250,000 to 1:1,000,000): use it for context, not for mapping at your property's scale.")}</div>
          <div style={{ ...note, fontSize: "var(--font-size-xs)" }}>{tr("Data CC BY 4.0. Credit Macrostrat (Peters et al. 2018, doi:10.1029/2018GC007467; Quinn et al. 2023, doi:10.1002/gdj3.189) and the original maps listed below in figures you share.")}</div>
          {!bboxLonLat && <div style={{ ...note, color: "var(--color-warn-text)" }}>{tr("No project area yet: load holes, samples or a map first.")}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={!bboxLonLat || !!busy} onClick={addLayer} style={{ ...btn(true), width: "auto", padding: "6px 12px", opacity: bboxLonLat && !busy ? 1 : 0.5 }}>{tr("Add the geology for the project area")}</button>
            <button type="button" disabled={!centre || !!busy} onClick={listUnits} style={{ ...btn(false), width: "auto", padding: "6px 12px", opacity: centre && !busy ? 1 : 0.5 }}>{tr("Map units at the project centre")}</button>
          </div>
          {busy && <div role="status" style={{ ...note, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={14} className="spin" />{busy}</div>}
          {msg && <div role="status" style={{ ...note, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{msg.text}</div>}
          {units && (units.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label={tr("Map units at the project centre")}>
              {units.map((u, i) => (
                <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", ...note }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "var(--color-text)" }}>
                    {u.color && <span style={{ width: 12, height: 12, background: u.color, border: "1px solid #999", flexShrink: 0 }} />}{u.name || u.strat || tr("(unnamed unit)")}
                    {u.scale && <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>{tr("{scale} scale", { scale: u.scale })}</span>}
                  </div>
                  {u.age && <div>{u.age}{u.ma ? ` (${u.ma[0]}–${u.ma[1]} Ma)` : ""}</div>}
                  {(u.lith || u.descrip) && <div>{u.lith || u.descrip}</div>}
                  {u.source ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Map: {source}", { source: u.source })}</div>
                    : u.sourceId != null && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Map: Macrostrat source {id}, which Macrostrat does not describe.", { id: u.sourceId })}</div>}
                </div>
              ))}
            </div>
          ) : <div style={note}>{tr("Macrostrat has no mapped unit at this point.")}</div>)}
        </div>
      </div>
    </div>
  );
}
