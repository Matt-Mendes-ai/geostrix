// TASKS.csv #1136 — moved out of ViewerModule (loaded on first use, not at startup)
import React, { useState } from "react";
import { minMax, classifyBreaks, paletteColorsHex, PALETTES } from "../lib/layers.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";


// TASKS.csv #237 sub-item (3) — graduated/classed symbology editor for the numeric layers. Rendered
// inside the layer's existing expandable panel (which, for a numeric layer, previously showed only
// the sources list — `categories` is hard-coded empty for meta.numeric, so there was literally
// nothing symbology-related there before). Deliberately mirrors the geophys_pts/voxel legend editor's
// own vocabulary — class count, equal-interval vs quantile, named palettes, continuous vs discrete —
// so the two classification UIs in the app behave the same way rather than inventing a second idiom.
export default function NumericSymbologyEditor({ layerKey, rows, sym, onChange }) {
  const [classCount, setClassCount] = useState(5);
  const [method, setMethod] = useState("equal");
  // TASKS.csv #249 (colorblind-safety review) — defaults to the perceptually-uniform, colorblind-safe
  // viridis palette rather than the plain blue-red "default" ramp, so a new classification starts safe
  // without the user needing to know to pick it. "default" stays selectable (and unchanged) for anyone
  // who explicitly wants it.
  const [palette, setPalette] = useState("viridis");
  const values = React.useMemo(
    () => (rows || []).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v)),
    [rows]
  );
  const { min, max } = minMax(values);
  const apply = () => {
    const breaks = classifyBreaks(values, classCount, method);
    if (!breaks.length) return;
    const colors = paletteColorsHex(palette, breaks.length);
    onChange({ stops: breaks.map((v, i) => ({ value: v, color: colors[i] })), colorMode: "discrete" });
  };
  const stops = sym?.stops || [];
  return (
    <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--color-border-subtle)" }}>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 5 }}>{tr("Symbology — {values} {v}{v2}", { values: values.length.toLocaleString(), v: tr(values.length === 1 ? "value" : "values"), v2: values.length > 0 && ` (${min.toLocaleString(undefined, { maximumFractionDigits: 2 })} – ${max.toLocaleString(undefined, { maximumFractionDigits: 2 })})` })}
      </div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
        <input type="number" min="2" max="12" value={classCount} onChange={(e) => setClassCount(Math.max(2, Math.min(12, Number(e.target.value) || 5)))}
          title={tr("Number of classes")} style={{ width: 40, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} title={tr("How the class breaks are computed")}
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>
          <option value="equal">{tr("Linear (equal interval)")}</option>
          <option value="log">{tr("Log-linear")}</option>
          <option value="quantile">{tr("Histogram equalization (quantile)")}</option>
          <option value="normal">{tr("Normal distribution")}</option>
          {/* TASKS.csv #291 — QGIS parity, see GeophysicsModule's copy of this picker. */}
          <option value="jenks">{tr("Natural breaks (Jenks)")}</option>
        </select>
        <select value={palette} onChange={(e) => setPalette(e.target.value)} title={tr("Colour ramp")}
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)", maxWidth: 110 }}>
          {Object.entries(PALETTES).map(([k, p]) => <option key={k} value={k}>{p.label.split(" — ")[0]}</option>)}
        </select>
        <button onClick={apply} disabled={!values.length}
          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--color-selected-border)", background: values.length ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", color: "var(--color-primary)", fontSize: "var(--font-size-sm)", cursor: values.length ? "pointer" : "default", opacity: values.length ? 1 : 0.5 }}
        >{tr("Classify")}</button>
        {stops.length > 0 && (
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => onChange(null)} title={tr("Remove the custom classes and go back to the default ramp")}
            style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon)", cursor: "pointer" }}>{tr("Reset")}</span>
        )}
      </div>
      {stops.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={sym.colorMode !== "discrete"}
                onChange={(e) => onChange({ ...sym, colorMode: e.target.checked ? "continuous" : "discrete" })} />{tr("Blend between classes")}</label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 150, overflowY: "auto" }}>
            {stops.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-sm)" }}>
                <input type="color" value={s.color}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, color: e.target.value } : x); onChange({ ...sym, stops: next }); }}
                  style={{ width: 22, height: 16, padding: 0, border: "1px solid var(--color-border-light)", borderRadius: 3, background: "none", cursor: "pointer", flexShrink: 0 }} />
                <input type="number" value={s.value}
                  onChange={(e) => { const next = stops.map((x, j) => j === i ? { ...x, value: Number(e.target.value) } : x); onChange({ ...sym, stops: next }); }}
                  title={tr("Lower bound of this class")}
                  style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "2px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text)" }} />
                <span style={{ color: "var(--color-text-muted)", flexShrink: 0 }}>&ge;</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
