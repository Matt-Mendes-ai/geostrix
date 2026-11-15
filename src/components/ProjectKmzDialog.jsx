// TASKS.csv #3087 — Export project as KMZ: which parts of the project go into the file (all ticked to start; the last choice is kept on this
// computer). A part with nothing in the project is greyed. Export runs lib/projectKmzExport.js with the ticked parts.
import React, { useState } from "react";
import { X, Globe } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps, btn } from "../lib/modalStyles.js";
import { KMZ_PARTS } from "../lib/projectKmz.js";
import { t as tr } from "../lib/i18n.js";

const PREF = "geostrix.kmzParts";
// TASKS.csv #3087 part 2 — the parts left UNticked are what is remembered ({ off: [...] }), so a part added later starts ticked. The first
// version kept the ticked ones as a plain list: read against the parts it knew.
const FIRST_PARTS = ["drillholes", "surface", "sections", "design", "rasters"];
export function pickedFromPref(saved, keys) {
  const off = Array.isArray(saved) ? FIRST_PARTS.filter((k) => !saved.includes(k)) : Array.isArray(saved?.off) ? saved.off : [];
  return new Set(keys.filter((k) => !off.includes(k)));
}
const panel = { width: "min(480px, 92vw)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45 };

// what the project has in each part (a part with nothing is greyed, not hidden)
export function kmzPartsPresent(store) {
  const any = (a) => Array.isArray(a) && a.length > 0;
  return {
    drillholes: any(store.collars) || any(store.plannedHoles),
    surface: any(store.surfaceSamples) || any(store.surfaceStructures) || any(store.mapLayers) || any(store.boundaries),
    sections: any(store.sections) || any(store.sectionImages), // #3087 part 2 — the section images too
    design: any(store.designLines) || any(store.designStrings),
    models: any(store.generatedSurfaces) || any(store.voxelModels) || !!store.terrain, // #3087 part 2
    rasters: any(store.rasters),
  };
}

export default function ProjectKmzDialog({ store, onExport, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const present = kmzPartsPresent(store);
  const [picked, setPicked] = useState(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PREF) || "null"); } catch { /* private window */ }
    return pickedFromPref(saved, KMZ_PARTS.map((p) => p.key));
  });
  // TASKS.csv #3252 phase 4 — a raster with a source description (NAIP) can go in finer than it was fetched: its detail tiles at a pixel
  // size chosen here, read now (from this computer, else the source), one picture of at most 8,192 px a side per raster
  const lodRasters = (store.rasters || []).filter((r) => r.lod && r.bbox && r.lod.nativeM > 0);
  const finest = lodRasters.length ? lodRasters.reduce((m, r) => Math.min(m, r.lod.nativeM), Infinity) : null;
  const coarsest = lodRasters.length ? lodRasters.reduce((m, r) => Math.max(m, r.pixelM || 0), 0) : 0;
  const lodChoices = [5, 2, 1, 0.5, 0.3].filter((p) => finest != null && p >= finest * 0.99 && (!(coarsest > 0) || p < coarsest));
  const [lodPx, setLodPx] = useState("");
  const toggle = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const chosen = KMZ_PARTS.filter((p) => picked.has(p.key) && present[p.key]);
  const go = () => {
    try { localStorage.setItem(PREF, JSON.stringify({ off: KMZ_PARTS.map((p) => p.key).filter((k) => !picked.has(k)) })); } catch { /* private window */ }
    onExport(new Set(chosen.map((p) => p.key)), { lodPixelM: lodPx === "" ? null : Number(lodPx) });
  };
  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" aria-label={tr("Export project as KMZ")} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-accent-dark)" }}><Globe size={18} />{tr("Export project as KMZ")}</div>
          <button type="button" onClick={onClose} aria-label={tr("Close")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={note}>{tr("The parts of the project to put in the KMZ, each in its own folder with the 3D View's colours and classes. Hidden layers are included, unticked in Google Earth.")}</div>
          {KMZ_PARTS.map((p) => (
            <label key={p.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--font-size-sm)", color: present[p.key] ? "var(--color-text)" : "var(--color-text-muted)" }}>
              <input type="checkbox" checked={picked.has(p.key) && present[p.key]} disabled={!present[p.key]} onChange={() => toggle(p.key)} aria-label={tr(p.label)} />
              <span>{tr(p.label)}{present[p.key] ? "" : ` ${tr("(none in this project)")}`}</span>
            </label>
          ))}
          {picked.has("rasters") && present.rasters && lodChoices.length > 0 && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} title={tr("Imagery fetched with a source (NAIP) is written finer than it was fetched: its detail tiles at this pixel size, read now from this computer or the source. One picture of at most 8,192 px a side per raster.")}>
              {tr("Imagery pixel size")}
              <select value={lodPx} onChange={(e) => setLodPx(e.target.value)} aria-label={tr("Imagery pixel size")}>
                <option value="">{tr("As fetched")}</option>
                {lodChoices.map((p) => <option key={p} value={p}>{tr("{px} m", { px: p })}</option>)}
              </select>
            </label>
          )}{/* TASKS.csv #3252 phase 4 */}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button type="button" onClick={onClose} style={btn(false)}>{tr("Cancel")}</button>
          <button type="button" onClick={go} disabled={!chosen.length} style={{ ...btn(true), opacity: chosen.length ? 1 : 0.5 }}>{tr("Export…")}</button>
        </div>
      </div>
    </div>
  );
}
