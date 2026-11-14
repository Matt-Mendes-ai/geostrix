// TASKS.csv #3205 (Matt's decision 2026-11-13) — in the import dialog, for a mineralization log in visual per cent per mineral: the mineral
// columns to import, one numeric interval layer each, and (opt-in) the columns that are sulphides, summed into a layer of their total.
// Built like the log channels box (#2160). The rules are in lib/perMineralColumns.js.
import React, { useMemo } from "react";
import { perMineralOffer, perMineralChoice, sumLayerName } from "../lib/perMineralColumns.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

export default function MineralPercentBox({ modal, onChange }) {
  const rows = modal.allRows || modal.sampleRows || [];
  const cols = useMemo(() => perMineralOffer(modal.target, modal.headers, rows, modal.mapping || {}), [modal.target, modal.headers, rows, modal.mapping]);
  if (!cols) return null;
  const { cols: ticked, sum } = perMineralChoice(modal, cols);
  const withValues = cols.filter((c) => c.n > 0), blank = cols.filter((c) => !c.n);
  const toggle = (col) => onChange({ ...modal, mineralCols: ticked.includes(col) ? ticked.filter((c) => c !== col) : withValues.map((c) => c.col).filter((c) => c === col || ticked.includes(c)) });
  const toggleSum = (col) => onChange({ ...modal, mineralSum: sum.includes(col) ? sum.filter((c) => c !== col) : withValues.map((c) => c.col).filter((c) => c === col || sum.includes(c)) });
  const base = String(modal.fileName || "").replace(/\.(csv|txt|xlsx?)$/i, "");
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", fontWeight: 600 }}>{tr("Per-mineral layers")}</div>
      <div style={note}>{tr("These columns are a visual per cent of each interval, one per mineral. Each ticked column becomes its own numeric layer of intervals, in % (visual), named after the column; an interval with no value of that mineral is simply not in its layer. Untick all to import the Value column above instead.")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
        {withValues.map((c) => (
          <label key={c.col} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={ticked.includes(c.col)} onChange={() => toggle(c.col)} aria-label={tr("Import {col} as a layer", { col: c.col })} />
            <span>{c.col}</span>
            <span style={{ color: "var(--color-text-muted)" }}>{tr("{n} interval(s), up to {max} %", { n: c.n.toLocaleString(), max: c.max.toLocaleString() })}{c.style ? " · " + tr("with {style}", { style: c.style }) : ""}</span>
          </label>
        ))}
      </div>
      {blank.length > 0 && <div style={{ ...note, marginTop: 4 }}>{tr("Left out, with no value in any row: {cols}.", { cols: blank.map((c) => c.col).join(", ") })}</div>}
      <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", fontWeight: 600, marginTop: 10 }}>{tr("Total sulphides (optional)")}</div>
      <div style={note}>{tr("Tick the columns that are sulphides to add a layer of their total per interval (a blank column counts as none logged). Nothing is assumed: which minerals count is your choice.")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 14px", marginTop: 4 }}>
        {withValues.map((c) => (
          <label key={c.col} style={{ fontSize: "var(--font-size-sm)", display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={sum.includes(c.col)} onChange={() => toggleSum(c.col)} aria-label={tr("Count {col} as a sulphide", { col: c.col })} />{c.col}
          </label>
        ))}
      </div>
      {sum.length === 1 && <div style={{ ...note, color: "var(--color-warn-text)", marginTop: 4 }}>{tr("Tick at least two columns for a total.")}</div>}
      {sum.length >= 2 && <div style={{ ...note, marginTop: 4 }}>{tr("Adds the layer \"{name}\".", { name: sumLayerName(base, sum) })}</div>}
    </div>
  );
}
