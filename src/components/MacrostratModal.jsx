// TASKS.csv #2005 — Maps > Web layers > Macrostrat geology: the geologic map for the project area as a raster drape (the layer's eye
// turns it off, the bin removes it), and the map units at the project centre with their original maps. Data CC BY 4.0: the credit is
// shown here, kept in the layer's name and provenance. Nothing is requested until a button is pressed.
// TASKS.csv #2314 (Matt: "I wanna be able to select an area of the map to fetch macrostrat geology") — the area is the project's by
// default, or one drawn on the map with the picker the WMS and terrain fetches use; all three buttons use it.
import React, { useMemo, useState } from "react";
import { X, Globe, Loader2 } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, panel, header, btn } from "../lib/modalStyles.js";
import BasemapView from "./BasemapView.jsx"; // #2314 — the area picker
import { DropPicture } from "./DropDiagram.jsx"; // TASKS.csv #3952 — the card's picture
import MoreFold from "./MoreFold.jsx"; // TASKS.csv #3952
import AreaChooser, { useFetchArea } from "./AreaChooser.jsx"; // TASKS.csv #3954
import { fetchMacrostratRaster, fetchMacrostratUnits, fetchMacrostratLegend, fetchMacrostratMapLayer } from "../lib/macrostratFetch.js"; // legend: #2011; map layer: #2012
import { MACROSTRAT_CREDIT, MACROSTRAT_MVT_URL } from "../lib/macrostrat.js";
import { t as tr } from "../lib/i18n.js";
import { areaSizeText } from "../lib/areaSize.js"; // TASKS.csv #2314 / #1765

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };

// #2314 — an area's size on the ground, for the Area line (lib/areaSize.js since #1765, shared with the fetch-area picker)
export { areaSizeText };

export default function MacrostratModal({ onClose, addRaster, addMapLayer = null /* #2012 */, projectEpsg, bboxLonLat: projectBbox, areaOptions = null }) {
  // TASKS.csv #3954 — the area from the shared chooser (lib/fetchAreas.js): the project area, the terrain, the satellite image, a boundary or claim,
  // or one drawn on the map (#2314); with no list passed, the project area alone
  const options = useMemo(() => areaOptions || (projectBbox ? [{ id: "project", kind: "project", label: tr("Project area"), bboxLonLat: projectBbox }] : []), [areaOptions, projectBbox]);
  const area = useFetchArea("macrostrat", options);
  const [picking, setPicking] = useState(false);
  const bboxLonLat = area.bboxLonLat;
  const atProject = area.option?.kind === "project";
  useEscapeKey(onClose); // a stack: Esc in the picker closes only the picker
  useFocusTrap();
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [units, setUnits] = useState(null);
  const centre = bboxLonLat ? [(bboxLonLat[1] + bboxLonLat[3]) / 2, (bboxLonLat[0] + bboxLonLat[2]) / 2] : null; // lat, lng
  const addLayer = async () => {
    setMsg(null); setBusy(tr("Fetching Macrostrat tiles…"));
    try {
      const r = await fetchMacrostratRaster({ bboxLonLat, projectEpsg, onProgress: (d, n) => setBusy(tr("Fetching Macrostrat tiles… {d} of {n}", { d, n })) });
      // TASKS.csv #2011 — the legend from the same tiles as vectors; a failure here still adds the drape (the layer offers "Fetch the legend")
      // #3952: the image is drawn from those tiles, which give the legend too (r.legend); fetched again only when they did not
      let legend = r.legend || null, legendErr = null;
      if (!legend) try { legend = await fetchMacrostratLegend({ bboxLonLat, onProgress: (d, n) => setBusy(tr("Fetching the legend… {d} of {n}", { d, n })) }); } catch (e) { legendErr = e.message; }
      addRaster({ name: "Macrostrat geology (CC BY 4.0)", bbox: r.bbox, dataUrl: r.dataUrl, opacity: 0.7, ...(legend ? { legend } : {}),
        provenance: { tool: "Macrostrat map units (vector tiles), drawn as an image", source: MACROSTRAT_MVT_URL("{z}", "{x}", "{y}"), /* #3952 */ zoom: r.zoom, areaLonLat: bboxLonLat, credit: MACROSTRAT_CREDIT, fetched: new Date().toISOString().slice(0, 10) } });
      setMsg({ ok: !r.failedTiles && !legendErr, text: tr("Added \"Macrostrat geology (CC BY 4.0)\" as a raster drape: {w} × {h} px, ~{m} m pixels, {n} tiles at zoom {z}. Its eye in GeoTIFF / GXF turns it off.", { w: r.width, h: r.height, m: Math.round(r.pixelM), n: r.tiles, z: r.zoom }) + (r.failedTiles ? " " + tr("{n} of {total} requests failed and are left transparent.", { n: r.failedTiles, total: r.tiles }) : "")
        + " " + (legend ? tr("Its legend lists {n} map units: open it under the layer, in Maps or in StrixViewer's layer list.", { n: legend.units.length }) : tr("Its legend could not be fetched ({message}): use \"Fetch the legend\" under the layer.", { message: legendErr })) });
    } catch (e) { setMsg({ ok: false, text: tr("Macrostrat: {message}", { message: e.message }) }); }
    setBusy(null);
  };
  // TASKS.csv #2012 — the units as a geology map layer (polygons with a unit field), so Surface Geology > Model it can use them
  const addUnits = async () => {
    setMsg(null); setBusy(tr("Fetching Macrostrat units…"));
    try {
      const r = await fetchMacrostratMapLayer({ bboxLonLat, projectEpsg, onProgress: (d, n) => setBusy(tr("Fetching Macrostrat units… {d} of {n}", { d, n })) });
      addMapLayer(r.layer);
      setMsg({ ok: !r.failedTiles, text: tr("Added \"Macrostrat geology (CC BY 4.0)\" as a map layer: {p} polygons of {u} units, {n} tiles at zoom {z}. Find it under Geological Mapping > Geology map; it drapes on the terrain in 3D.", { p: r.polygons, u: r.units, n: r.tiles, z: r.zoom }) + (r.failedTiles ? " " + tr("{n} of {total} tiles could not be read: their polygons are missing.", { n: r.failedTiles, total: r.tiles }) : "") });
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
      {/* TASKS.csv #3952 (Matt's first-time test: "we should have a nice card here for macrostrat geology. all the writing can go in more") — the dialog had
          no background: it spread modalStyles' panel, which is a function (panel(sizing)), so the title, text and buttons sat on the dimmed map. Now an
          opaque card in #3939's kit: the picture, one line of scale, the area, the buttons; what Macrostrat is and its credit behind More. */}
      <div role="dialog" aria-modal="true" aria-label={tr("Macrostrat geology")} data-macrostrat-card="" className="ge-card" style={panel({ width: 520, maxWidth: "94vw", maxHeight: "86vh", borderRadius: 12, boxShadow: "var(--shadow-pop)" })}>{/* #3956: the shared card */}
        <div className="ge-card-head" style={header}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}><Globe size={16} />{tr("Macrostrat geology")}</span>
          <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          <DropPicture picture="units" />
          <div style={note}>{tr("Regional geology (1:250,000 to 1:1,000,000), not property-scale mapping.")}</div>
          {/* #2314 / #3954 — which area the buttons fetch */}
          <AreaChooser options={options} area={area} disabled={!!busy} onDraw={() => setPicking(true)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* #3952 — Matt: "add the units as a map layer should be the default, only as raster should be the optional": the units (sharp, named, for Model it) are the main button; the image is a choice that says it is a picture */}
            {addMapLayer && <button type="button" disabled={!bboxLonLat || !!busy} onClick={addUnits} style={{ ...btn(true), width: "auto", padding: "6px 12px", opacity: bboxLonLat && !busy ? 1 : 0.5 }} title={tr("Sharp polygons with names: for Model it, Identify and the legend.")}>{tr("Add the units as a map layer")}</button>}{/* #2012 */}
            <button type="button" disabled={!bboxLonLat || !!busy} onClick={addLayer} style={{ ...btn(!addMapLayer), width: "auto", padding: "6px 12px", opacity: bboxLonLat && !busy ? 1 : 0.5 }} title={tr("A picture only, with no names.")}>{tr("Add as an image only")}</button>
            <button type="button" disabled={!centre || !!busy} onClick={listUnits} style={{ ...btn(false), width: "auto", padding: "6px 12px", opacity: centre && !busy ? 1 : 0.5 }}>{tr(atProject ? "Map units at the project centre" : "Map units at the centre of this area")}</button>
          </div>
          {busy && <div role="status" style={{ ...note, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={14} className="spin" />{busy}</div>}
          {msg && <div role="status" style={{ ...note, color: msg.ok ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{msg.text}</div>}
          {units && (units.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }} aria-label={tr(atProject ? "Map units at the project centre" : "Map units at the centre of this area")}>
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
          <MoreFold style={{ marginBottom: 0 }}>
            <div style={note}>{tr("Macrostrat compiles geologic maps from many surveys into one world map, at the scale of its sources (often 1:250,000 to 1:1,000,000): context, not mapping at your property's scale.")}</div>
            <div style={{ ...note, fontSize: "var(--font-size-xs)", marginTop: 6 }}>{tr("Data CC BY 4.0: credit Macrostrat (Peters et al. 2018, doi:10.1029/2018GC007467; Quinn et al. 2023, doi:10.1002/gdj3.189) and the original maps below in shared figures.")}</div>
          </MoreFold>
        </div>
      </div>
      {picking && (
        <BasemapView
          mode="draw"
          initialBboxLonLat={bboxLonLat}
          title={tr("Draw the area to fetch Macrostrat geology for")}
          confirmLabel="Use this area"
          onClose={() => setPicking(false)}
          areaOptions={options} /* #3954 */
          onConfirm={(b) => { area.setDrawn(b); setUnits(null); setMsg(null); setPicking(false); }}
        />
      )}
    </div>
  );
}
