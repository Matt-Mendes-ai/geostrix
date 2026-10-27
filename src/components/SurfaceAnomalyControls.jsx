// TASKS.csv #843 — "Colour by" for surface samples in the 3D View's layer panel: the sampling medium (as before), one
// element (its saved threshold from #841, or percentile classes), or a pathfinder index for a deposit type, with the
// spatial-coherence check. The settings live in the view state (layerStyles.surface_anomaly), so they are saved with
// the project and in themes. Maths in lib/anomalyMap.js; the legend and notes come from the same result.
import React, { useState } from "react";
import { PATHFINDER_PRESETS, DEFAULT_ANOMALY } from "../lib/anomalyMap.js";
import { saveFile } from "../lib/desktop.js";
import { groupOptions } from "../lib/thresholds.js";
import { t as tr } from "../lib/i18n.js";
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped

export default function SurfaceAnomalyControls({ cfg: cfg0, setCfg, surfaceSamples, surfaceElements, mapLayers, thresholds = [], result, drawn = [] }) {
  const cfg = { ...DEFAULT_ANOMALY, ...(cfg0 || {}) };
  const [open, setOpen] = useState(false);
  const set = (patch) => setCfg({ ...cfg, ...patch });
  const preset = PATHFINDER_PRESETS.find((p) => p.id === cfg.preset) || PATHFINDER_PRESETS[0];
  const have = new Set(surfaceElements.map((e) => e.symbol));
  const els = cfg.elements?.length ? cfg.elements : preset.elements;
  const gOpts = groupOptions(surfaceSamples, mapLayers);
  const modeValue = cfg.mode === "element" ? `el:${cfg.symbol || ""}` : cfg.mode;
  // TASKS.csv #854 — the drawn samples with their class (and the hot-spot z, #853) as CSV
  const exportCsv = () => {
    if (!result) return;
    const rows = drawn.map((s, i) => ({ sample_id: s.sample_id, x: s.x, y: s.y, medium: s.medium, class: result.classOf[i] >= 0 ? result.classes[result.classOf[i]].label : "no value", isolated: result.isolated[i] ? "yes" : "", gi_star_z: result.stat && Number.isFinite(result.stat[i]) ? result.stat[i].toFixed(2) : "" }));
    saveFile({ suggestedName: `anomaly_classes.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: `# ${result.label}\n` + toExportCsv(rows) });
  };
  const savedFor = (sym) => thresholds.some((t) => t.symbol === sym);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 2px 8px", fontSize: "var(--font-size-sm)" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)" }}>{tr("Colour by")}
        <select value={modeValue} onChange={(e) => { const v = e.target.value; if (v.startsWith("el:")) set({ mode: "element", symbol: v.slice(3) }); else set({ mode: v }); }} style={selStyle} aria-label={tr("Colour surface samples by")}>
          <option value="medium">{tr("Sampling medium")}</option>
          <option value="index">{tr("Pathfinder index")}</option>
          <option value="hotspot">{tr("Hot spots (Getis–Ord Gi*)")}</option>
          {surfaceElements.map((e) => <option key={e.symbol} value={`el:${e.symbol}`}>{e.symbol}{savedFor(e.symbol) ? ` — ${tr("threshold saved")}` : ""}</option>)}
        </select>
        {cfg.mode !== "medium" && <button type="button" onClick={() => setOpen((o) => !o)} style={linkBtn} aria-expanded={open}>{open ? tr("Fewer options") : tr("Options")}</button>}
      </label>
      {cfg.mode !== "medium" && open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--color-border)", borderRadius: 6, padding: 8 }}>
          {cfg.mode === "element" && (
            <label style={row}>{tr("Classes")}
              <select value={cfg.scheme} onChange={(e) => set({ scheme: e.target.value })} style={selStyle}>
                <option value="threshold">{tr("Saved threshold (Geochem > Thresholds)")}</option>
                <option value="percentile">{tr("Percentiles 50 / 75 / 90 / 95 / 98")}</option>
              </select>
            </label>
          )}
          {cfg.mode === "hotspot" && (
            <>
              <label style={row}>{tr("Element")}
                <select value={cfg.symbol || ""} onChange={(e) => set({ symbol: e.target.value })} style={selStyle}>
                  <option value="">{tr("— choose —")}</option>
                  {surfaceElements.map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol}</option>)}
                </select>
              </label>
              <label style={row}>{tr("Neighbours within (m)")}<input type="number" min="1" step="10" value={cfg.hotRadius} onChange={(e) => set({ hotRadius: Math.max(1, Number(e.target.value) || 250) })} style={{ ...selStyle, width: 70 }} /></label>
              <div style={{ color: "var(--color-text-muted)" }}>{tr("A hot spot is a sample whose neighbours are high with it; a lone spike among background is not one. Use a radius that reaches a few neighbours.")}</div>
            </>
          )}
          {cfg.mode === "index" && (
            <>
              <label style={row}>{tr("Deposit type")}
                <select value={cfg.preset} onChange={(e) => set({ preset: e.target.value, elements: null })} style={{ ...selStyle, maxWidth: 190 }}>
                  {PATHFINDER_PRESETS.map((p) => <option key={p.id} value={p.id}>{tr(p.label)}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px" }} title={tr("Edit the suite after an orientation survey: pathfinders vary with cover, climate and weathering.")}>
                {[...new Set([...preset.elements, ...els])].map((sym) => (
                  <label key={sym} style={{ display: "flex", alignItems: "center", gap: 3, color: have.has(sym) ? "var(--color-text)" : "var(--color-text-disabled)" }}>
                    <input type="checkbox" checked={els.includes(sym)} disabled={!have.has(sym)} onChange={(e) => { const next = e.target.checked ? [...els, sym] : els.filter((x) => x !== sym); set({ elements: next.length ? next : null }); }} />{sym}
                  </label>
                ))}
              </div>
              <div style={{ color: "var(--color-text-muted)" }}>{preset.ref}</div>
            </>
          )}
          {cfg.mode !== "hotspot" && <label style={row}>{tr("Populations")}
            <select value={cfg.groupBy || ""} onChange={(e) => set({ groupBy: e.target.value || null })} style={{ ...selStyle, maxWidth: 190 }}>
              <option value="">{cfg.mode === "element" && cfg.scheme === "threshold" ? tr("As saved with the threshold") : tr("Sampling medium")}</option>
              {gOpts.map((o) => <option key={o.value} value={o.value}>{o.kind === "column" ? tr("Column: {v}", { v: o.label }) : o.kind === "map" ? tr("Map: {v}", { v: o.label }) : tr(o.label)}</option>)}
            </select>
          </label>}
          {cfg.mode !== "hotspot" && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={!!cfg.coherence} onChange={(e) => set({ coherence: e.target.checked })} />{tr("Mark isolated anomalies")}
          </label>}
          {cfg.mode !== "hotspot" && cfg.coherence && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", color: "var(--color-text-secondary)" }}>
              {tr("at least")}<input type="number" min="1" step="1" value={cfg.minNeighbours} onChange={(e) => set({ minNeighbours: Math.max(1, Number(e.target.value) || 1) })} style={{ ...selStyle, width: 46 }} />
              {tr("anomalous neighbours within")}<input type="number" min="1" step="10" value={cfg.radius} onChange={(e) => set({ radius: Math.max(1, Number(e.target.value) || 100) })} style={{ ...selStyle, width: 64 }} />m
            </div>
          )}
        </div>
      )}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.35 }}>{result.label}</div>
          {result.classes.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{tr(c.label)}
            </div>
          ))}
          {result.notes.map((n) => <div key={n.text} style={{ color: "var(--color-warn-text)", fontSize: "var(--font-size-xs)", lineHeight: 1.35 }}>{tr(n.text, n.params)}</div>)}
          <button type="button" onClick={exportCsv} style={{ ...linkBtn, alignSelf: "flex-start" }}>{tr("Samples with classes (CSV)")}</button>{/* TASKS.csv #854 */}
        </div>
      )}
    </div>
  );
}
const selStyle = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
const row = { display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-secondary)" };
const linkBtn = { background: "none", border: "none", padding: 0, color: "var(--color-accent)", cursor: "pointer", fontSize: "var(--font-size-sm)", fontFamily: "inherit" };
