// TASKS.csv #410 — confirm a block-model CSV's columns before import: centroid X/Y/Z, block sizes (or
// infer them from the centroid spacing) and which attributes to bring in (one block model each). The
// guesses come from lib/blockModelCsv.js (Micromine / Datamine / Vulcan / generic names).
import React, { useState } from "react";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap)
import { backdropProps, sel } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

const ROLES = [
  ["x", "Centroid X (east)", true], ["y", "Centroid Y (north)", true], ["z", "Centroid Z (elevation)", true],
  ["dx", "Block size X", false], ["dy", "Block size Y", false], ["dz", "Block size Z", false],
];

export default function BlockModelMappingModal({ fileName, headers, numeric, rowCount, guess, maxCells, onImport, onClose }) {
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const [mapping, setMapping] = useState(guess.mapping);
  const [attrs, setAttrs] = useState(new Set(guess.defaultAttributes));
  const options = numeric.length ? numeric : headers;
  const attrChoices = options.filter((h) => ![mapping.x, mapping.y, mapping.z, mapping.dx, mapping.dy, mapping.dz].includes(h));
  const placed = !!(mapping.x && mapping.y && mapping.z);
  const ready = placed && attrs.size > 0;
  const small = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 };
  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "too wordy … cut, don't just cap") — two steps, one question each: which columns place the
  // blocks (Columns), then which attributes to bring in (Block models, its Import the gold primary). The row count stays seen; how the guesses are made and
  // what "infer" does are in the Help card. Two protective lines stay seen, each where it matters: a rotated model would be drawn in the wrong place
  // (Columns), and over the cell budget the blocks are merged (Block models, beside Import). The backdrop still does not close it (work in it).
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{tr("Block model columns")}</summary>
      <div style={small}>{tr("{rowCount} rows. Check the columns GeoStrix guessed; sizes left on \"infer\" are taken from the spacing between centroids.", { rowCount: rowCount.toLocaleString() })}</div>
      <div style={{ ...small, marginTop: 6 }}>{tr("Rotated block models are not supported: their centroids are in a local frame and would be drawn in the wrong place.")}</div>
      {rowCount > maxCells && <div style={{ ...small, marginTop: 6 }}>{tr("Over the 3D view's {maxCells}-cell budget, so blocks will be merged (volume-weighted mean): fine for grades and densities, meaningless for coded attributes such as a numeric rock type.", { maxCells: maxCells.toLocaleString() })}</div>}
    </details>
  );
  const steps = [
    { key: "columns", label: tr("Columns"), primary: { label: tr("Next"), disabled: !placed }, hint: placed ? "" : tr("Pick the centroid X, Y and Z columns."), render: () => (
      <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)" }}>
        <div style={{ color: "var(--color-text-secondary)", marginBottom: 12 }}>{tr("{rowCount} rows.", { rowCount: rowCount.toLocaleString() })}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", marginBottom: 14 }}>
          {ROLES.map(([k, label, required]) => (
            <label key={k} style={{ display: "flex", flexDirection: "column", gap: 3, color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
              {label}{required ? " *" : ""}
              <select value={mapping[k] || ""} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))} style={sel} aria-label={label}>
                <option value="">{required ? tr("— pick a column —") : tr("infer from spacing")}</option>
                {options.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div style={{ ...small, color: "var(--color-text-muted)" }}>{tr("Rotated block models are not supported: they would be drawn in the wrong place.")}</div>
      </div>
    ) },
    { key: "models", label: tr("Block models"), primary: { label: tr("Import {size} {v}", { size: attrs.size, v: tr(attrs.size === 1 ? "block model" : "block models") }), onClick: () => onImport(mapping, [...attrs]), disabled: !ready },
      hint: attrs.size > 0 ? "" : tr("Tick at least one attribute."), render: () => (
        <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)" }}>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>{tr("Attributes to import (one block model each)")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {attrChoices.length === 0 && <span style={{ color: "var(--color-text-muted)" }}>{tr("No numeric attribute columns found.")}</span>}
            {attrChoices.map((h) => (
              <label key={h} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", border: "1px solid var(--color-border)", borderRadius: 12, cursor: "pointer", background: attrs.has(h) ? "var(--color-selected-bg)" : "transparent" }}>
                <input type="checkbox" checked={attrs.has(h)} onChange={() => setAttrs((s) => { const n = new Set(s); n.has(h) ? n.delete(h) : n.add(h); return n; })} /> {h}
              </label>
            ))}
          </div>
          {rowCount > maxCells && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "7px 9px", lineHeight: 1.45 }}>{tr("Over the {maxCells}-cell budget: blocks will be merged (volume-weighted mean), meaningless for coded attributes.", { maxCells: maxCells.toLocaleString() })}</div>
          )}
        </div>
      ) },
  ];
  const heading = tr("Block model columns — {fileName}", { fileName }); // the dialog's name, seen (a JSX title= would count it as a tooltip)
  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(520px, 94vw)" overlayProps={backdropProps(null)} />;
}
