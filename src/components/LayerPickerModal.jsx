// TASKS.csv #288 (QGIS-specialist review) — a multi-layer Shapefile .zip or a multi-table GeoPackage
// used to import its FIRST layer and append a one-line "only the first of N was imported" note, with
// no way to target a specific other one: re-dropping the file just re-parsed the same first layer.
// Real BC Mineral Titles Online claim packages and most provincial open-data GeoPackages bundle
// several themes in one file, so "the first one" is rarely the one you wanted.
//
// This is deliberately the smallest possible picker — the file has already been parsed by the time it
// opens, so the counts and geometry types shown here are real, not guessed. Picking a layer re-runs
// the exact same import path with that layer selected, so everything downstream (column mapping,
// Source CRS detection from the .prj/gpkg SRS registry, the target guess) behaves identically to a
// single-layer file.
import React from "react";
import { X, Layers3 } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

export default function LayerPickerModal({ fileName, options, onPick, onCancel }) {
  useEscapeKey(onCancel);
  useFocusTrap();
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} role="dialog" aria-modal="true" aria-label={`Choose a layer from ${fileName}`} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "var(--color-accent-dark)", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              <Layers3 size={15} /> Choose a layer
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 3 }}>
              {fileName} contains {options.length} layers. Import one now — re-open the file to bring in another.
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>
        <div style={{ padding: 12, overflowY: "auto", maxHeight: 380 }}>
          {options.map((o) => (
            <button key={o.name} onClick={() => onPick(o.name)} style={row} title={`Import "${o.name}"`}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }}>{o.name}</span>
              <span style={{ fontSize: 10.5, color: "var(--color-text-caption)", flexShrink: 0 }}>
                {o.count != null ? `${o.count.toLocaleString()} feature${o.count === 1 ? "" : "s"}` : ""}{o.geomType ? ` · ${o.geomType}` : ""}
              </span>
            </button>
          ))}
        </div>
        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...row, width: "auto", padding: "6px 14px", color: "var(--color-text-secondary)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const panel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif", width: 460, maxWidth: "92vw" };
const header = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const row = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 6, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit" };
