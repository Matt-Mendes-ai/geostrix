// TASKS.csv #2011 (Matt 2026-11-07: "need legend for macrostrat geology") — the legend of a Macrostrat geology drape: the map units in
// the tiles it was drawn from (name, age, lithology, colour, original map), saved on the raster as `legend` (lib/macrostratFetch.js)
// and shown under its row in Maps and in the 3D View's layer list. A drape added before this change has no legend yet: its provenance
// holds the area, so a "Fetch the legend" button gets one. Collapsed by default: a legend of 40 units would bury the layer list.
import React, { useState } from "react";
import { t as tr } from "../lib/i18n.js";

const isMacrostrat = (r) => r?.provenance?.tool === "Macrostrat geologic map tiles";
const xs = { fontSize: "var(--font-size-xs)", lineHeight: 1.4 };
const NO_COLOUR = "repeating-linear-gradient(45deg, #9a9a9a 0 2px, #e0e0e0 2px 4px)"; // Macrostrat gives no colour: the tiles draw it grey

// Macrostrat's age model carries more decimals than a legend wants (19.0482): one decimal from 10 Ma up, two below
const maNum = (v) => String(+v.toFixed(v >= 10 ? 1 : 2));
export const maText = (ma) => (ma ? (maNum(ma[0]) === maNum(ma[1]) ? `${maNum(ma[0])} Ma` : `${maNum(ma[0])}–${maNum(ma[1])} Ma`) : "");

export default function RasterLegend({ raster: r, updateRaster, compact = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const legend = r?.legend;
  if (!legend && !(isMacrostrat(r) && r.provenance?.areaLonLat)) return null;
  const fetchLegend = async () => {
    setErr(null); setBusy(tr("Fetching the legend…"));
    try {
      const { fetchMacrostratLegend } = await import("../lib/macrostratFetch.js");
      const l = await fetchMacrostratLegend({ bboxLonLat: r.provenance.areaLonLat, onProgress: (d, n) => setBusy(tr("Fetching the legend… {d} of {n}", { d, n })) });
      updateRaster(r.id, { legend: l }); setOpen(true);
    } catch (e) { setErr(tr("Macrostrat: {message}", { message: e.message })); }
    setBusy(null);
  };
  const link = { ...xs, border: "none", background: "transparent", color: "var(--color-primary)", cursor: "pointer", padding: 0, textAlign: "left" };
  const wrap = compact ? { marginTop: -2, marginBottom: 8, paddingLeft: 8 } : { marginTop: 5 };
  if (!legend) {
    return (
      <div style={wrap}>
        <button type="button" onClick={fetchLegend} disabled={!!busy} style={link}>{busy || tr("Fetch the legend (which colour is which map unit)")}</button>
        {err && <div role="status" style={{ ...xs, color: "var(--color-danger-text)" }}>{err}</div>}
      </div>
    );
  }
  const n = legend.units.length, title = tr("Legend: {n} map units", { n });
  // TASKS.csv #2315 — a legend saved before it was cut to the area listed the whole tiles' units: offer to read it again
  const stale = isMacrostrat(r) && !legend.inArea && !!r.provenance?.areaLonLat;
  return (
    <div style={wrap}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={link}>{open ? tr("Hide the legend") : title}</button>
      {open && (
        <div role="list" aria-label={title} style={{ ...xs, marginTop: 4, maxHeight: compact ? 220 : 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
          {legend.units.map((u) => (
            <div role="listitem" key={u.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }} title={u.descrip || undefined}>
              <span aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1, border: "1px solid var(--color-border)", background: u.color || NO_COLOUR }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{u.name}</span>
                {(u.age || u.ma) && <span style={{ color: "var(--color-text-secondary)" }}>{" — "}{u.age}{u.ma ? ` (${maText(u.ma)})` : ""}</span>}
                {u.lith && <span style={{ color: "var(--color-text-muted)" }}>{" · "}{u.lith}</span>}
              </span>
            </div>
          ))}
          {stale && <div style={{ color: "var(--color-warn-text)" }}>{tr("This legend was read before GeoStrix cut it to the drape's area, so it can list units of the surrounding tiles that are not on the map.")}{" "}<button type="button" onClick={fetchLegend} disabled={!!busy} style={link}>{busy || tr("Fetch it again for the area only")}</button></div>}
          {err && <div role="status" style={{ color: "var(--color-danger-text)" }}>{err}</div>}
          {legend.lines?.length > 0 && <div style={{ color: "var(--color-text-secondary)" }}>{tr("Also drawn, as lines: {list}.", { list: legend.lines.map((l) => `${l.count} ${l.type}`).join(", ") })}</div>}
          <div style={{ color: "var(--color-text-muted)", marginTop: 3 }}>
            {tr(legend.inArea ? "The units inside the drape's area, read from the {n} tiles it was drawn from (zoom {z}). Colours as Macrostrat lists them: the map adds relief shading, so the drape is darker in places." : "The units in the {n} tiles the drape was drawn from (zoom {z}). Colours as Macrostrat lists them: the map adds relief shading, so the drape is darker in places.", { n: legend.tiles, z: legend.zoom })}
            {legend.failedTiles ? " " + tr("{n} of {total} tiles could not be read: their units may be missing here.", { n: legend.failedTiles, total: legend.tiles }) : ""}
          </div>
          {legend.sources?.map((s) => <div key={s} style={{ color: "var(--color-text-muted)" }}>{tr("Map: {source}", { source: s })}</div>)}
        </div>
      )}
    </div>
  );
}
