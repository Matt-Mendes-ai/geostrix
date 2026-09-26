// TASKS.csv #410 — confirm a block-model CSV's columns before import: centroid X/Y/Z, block sizes (or
// infer them from the centroid spacing) and which attributes to bring in (one block model each). The
// guesses come from lib/blockModelCsv.js (Micromine / Datamine / Vulcan / generic names).
import React, { useState } from "react";
import { X, Box } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps, panel, header as headerStyle, sel } from "../lib/modalStyles.js";

const ROLES = [
  ["x", "Centroid X (east)", true], ["y", "Centroid Y (north)", true], ["z", "Centroid Z (elevation)", true],
  ["dx", "Block size X", false], ["dy", "Block size Y", false], ["dz", "Block size Z", false],
];

export default function BlockModelMappingModal({ fileName, headers, numeric, rowCount, guess, maxCells, onImport, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const [mapping, setMapping] = useState(guess.mapping);
  const [attrs, setAttrs] = useState(new Set(guess.defaultAttributes));
  const options = numeric.length ? numeric : headers;
  const attrChoices = options.filter((h) => ![mapping.x, mapping.y, mapping.z, mapping.dx, mapping.dy, mapping.dz].includes(h));
  const ready = mapping.x && mapping.y && mapping.z && attrs.size > 0;
  return (
    <div style={overlay} {...backdropProps(null)}>
      <div role="dialog" aria-modal="true" aria-label="Block model columns" style={{ ...panel(), width: 520, maxHeight: "86vh" }}>
        <div style={headerStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><Box size={16} /> Block model columns — {fileName}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", fontSize: "var(--font-size-base)" }}>
          <div style={{ color: "var(--color-text-secondary)", marginBottom: 12 }}>{rowCount.toLocaleString()} rows. Check the columns GeoStrix guessed; sizes left on "infer" are taken from the spacing between centroids.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginBottom: 14 }}>
            {ROLES.map(([k, label, required]) => (
              <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
                {label}{required ? " *" : ""}
                <select value={mapping[k] || ""} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))} style={sel} aria-label={label}>
                  <option value="">{required ? "— pick a column —" : "infer from spacing"}</option>
                  {options.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>Attributes to import (one block model each)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {attrChoices.length === 0 && <span style={{ color: "var(--color-text-muted)" }}>No numeric attribute columns found.</span>}
            {attrChoices.map((h) => (
              <label key={h} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--color-border)", borderRadius: 12, cursor: "pointer", background: attrs.has(h) ? "var(--color-selected-bg)" : "transparent" }}>
                <input type="checkbox" checked={attrs.has(h)} onChange={() => setAttrs((s) => { const n = new Set(s); n.has(h) ? n.delete(h) : n.add(h); return n; })} /> {h}
              </label>
            ))}
          </div>
          {rowCount > maxCells && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "7px 9px", marginBottom: 12, lineHeight: 1.45 }}>
              Over the 3D view's {maxCells.toLocaleString()}-cell budget: blocks will be merged into larger ones (volume-weighted mean). Right for grades and densities; meaningless for a coded attribute such as a numeric rock type.
            </div>
          )}
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 12 }}>Rotated block models are not supported: their centroids are in a local frame and would be drawn in the wrong place.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ ...sel, cursor: "pointer" }}>Cancel</button>
            <button type="button" disabled={!ready} onClick={() => onImport(mapping, [...attrs])} style={{ ...sel, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.5, background: "var(--color-success-bg)", color: "var(--color-success-text)", border: "1px solid var(--color-success-border)" }}>
              Import {attrs.size} block model{attrs.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
