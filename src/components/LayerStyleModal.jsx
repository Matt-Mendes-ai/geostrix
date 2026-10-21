import React from "react";
import { X } from "./icons.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { activateOnKey } from "../lib/a11y.js";
import { SHAPES, SIZE_MIN, SIZE_MAX, resolveLayerStyle } from "../lib/layerStyle.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

// TASKS.csv #635 — "edit the styles of each layer, colour, size, type (circle, plane, cylinder)". A small floating
// panel (not a blocking dialog) beside the 3D view, so every change is seen live; changes apply as they are made
// and are saved with the project's view state. target: { key, kind: "interval" | "point" | "plane", label,
// defaults: { opacity }, sizeNote, onEditColours? }. kind "surface" (#636, a generated surface): colour and opacity
// only — no shape or size — and "Original colours" instead of the legend's.
export default function LayerStyleModal({ target, style, onChange, onReset, onClose }) {
  useEscapeKey(onClose);
  const st = resolveLayerStyle(style, target.kind, target.defaults);
  const shapes = SHAPES[target.kind] || SHAPES.point;
  const surface = target.kind === "surface";
  const lbl = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", width: 74, flexShrink: 0 };
  const row = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
  return (
    <div role="dialog" aria-label={tr("Style of {label}", { label: target.label })} style={{ position: "fixed", right: 76, top: 150, width: 300, zIndex: 60, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.25)", fontSize: "var(--font-size-base)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr("Style — {label}", { label: target.label })}</div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Changes show in 3D straight away and are saved with the project.")}</div>
        </div>
        <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
      </div>
      <div style={{ padding: 12 }}>
        {!surface && <>
        <div style={row}>
          <span style={lbl}>{tr("Shape")}</span>
          <select value={st.shape} onChange={(e) => onChange({ shape: e.target.value })} aria-label={tr("Shape")} style={{ flex: 1, padding: "4px 6px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)" }}>
            {shapes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div style={row}>
          <span style={lbl}>{tr("Size")}</span>
          <input type="range" min={SIZE_MIN} max={SIZE_MAX} step={0.05} value={st.size} onChange={(e) => onChange({ size: Number(e.target.value) })} aria-label={tr("Size")} style={{ flex: 1 }} />
          <span style={{ width: 40, textAlign: "right", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>×{st.size.toFixed(2)}</span>
        </div>
        </>}
        {target.sizeNote && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "-6px 0 10px 82px" }}>{target.sizeNote}</div>}
        <div style={row}>
          <span style={lbl}>{tr("Opacity")}</span>
          <input type="range" min={0.1} max={1} step={0.05} value={st.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} aria-label={tr("Opacity")} style={{ flex: 1 }} />
          <span style={{ width: 40, textAlign: "right", color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>{Math.round(st.opacity * 100)}%</span>
        </div>
        <div style={{ ...row, alignItems: "flex-start" }}>
          <span style={{ ...lbl, paddingTop: 3 }}>{tr("Colour")}</span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" name="colourMode" checked={!st.color} onChange={() => onChange({ color: null })} /> {surface ? tr("Original colours") : tr("By value (legend colours)")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" name="colourMode" checked={!!st.color} onChange={() => onChange({ color: st.color || "#e8901a" })} />{" "}{tr("One colour")}<input type="color" value={st.color || "#e8901a"} onChange={(e) => onChange({ color: e.target.value })} aria-label={tr("Layer colour")} style={{ width: 34, height: 22, padding: 0, border: "1px solid var(--color-border)", borderRadius: 4, background: "none" }} />
            </label>
            {target.onEditColours && !st.color && (
              <button type="button" onClick={target.onEditColours} style={{ alignSelf: "flex-start", padding: "3px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", color: "var(--color-text)", cursor: "pointer" }}>{tr("Edit legend colours…")}</button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onReset} style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("Reset to default")}</button>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--color-success-border)", borderRadius: 6, background: "var(--color-success-bg)", color: "var(--color-success-text)", cursor: "pointer" }}>{tr("Done")}</button>
        </div>
      </div>
    </div>
  );
}
