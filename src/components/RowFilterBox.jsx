// TASKS.csv #2330 (review #2325, WA uranium) — the import dialog's optional row filter: "only rows where <column> is <values>", with each
// value's count, pre-set when a Superseded / Current flag column marks rows as out of date (lib/importRowFilter.js)
import React, { useMemo } from "react";
import { rowFilterColumns, defaultRowFilter } from "../lib/importRowFilter.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };

export default function RowFilterBox({ modal, onChange, sel }) {
  const rows = modal.allRows || modal.sampleRows || [];
  const cols = useMemo(() => rowFilterColumns(modal.headers, rows), [modal.headers, rows]);
  const preset = useMemo(() => defaultRowFilter(modal.headers, rows), [modal.headers, rows]);
  if (!cols.length) return null;
  const f = modal.rowFilter !== undefined ? modal.rowFilter : preset; // undefined: the preset; null: every row
  const col = f ? cols.find((c) => c.col === f.col) : null;
  const set = (rowFilter) => onChange({ ...modal, rowFilter });
  const kept = col ? col.values.filter(([v]) => f.keep.includes(v)).reduce((n, [, c]) => n + c, 0) : rows.length;
  return (
    <div style={{ marginBottom: 14, border: "1px solid var(--color-border)", borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-base)" }}>
        <span style={{ fontWeight: 600 }}>{tr("Rows")}</span>
        <select value={f ? f.col : ""} aria-label={tr("Row filter column")} style={sel} onChange={(e) => { const c = cols.find((x) => x.col === e.target.value); set(c ? { col: c.col, keep: c.values.map(([v]) => v) } : null); }}>
          <option value="">{tr("every row")}</option>
          {cols.map((c) => <option key={c.col} value={c.col}>{tr("only rows where {col} is…", { col: c.col })}</option>)}
        </select>
      </div>
      {col && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, fontSize: "var(--font-size-sm)" }}>
          {col.values.map(([v, n]) => (
            <label key={v} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={f.keep.includes(v)} onChange={() => set({ ...f, keep: f.keep.includes(v) ? f.keep.filter((x) => x !== v) : [...f.keep, v] })} aria-label={tr("Keep rows where {col} is {v}", { col: col.col, v: v || tr("(blank)") })} />
              {v || tr("(blank)")} <span style={{ color: "var(--color-text-muted)" }}>({n.toLocaleString()})</span>
            </label>
          ))}
        </div>
      )}
      {/* TASKS.csv #2431 — the line follows the ticks: shown while a value the preset leaves out is still unticked */}
      {preset && f && f.col === preset.col && col && col.values.some(([v]) => !preset.keep.includes(v) && !f.keep.includes(v)) && (
        <div style={{ ...note, marginTop: 4, color: "var(--color-warn-text)" }}>{preset.flag === "superseded"
          ? tr("{col} marks {n} row(s) as superseded (out of date): they are left out. Tick their value to keep them.", { col: preset.col, n: preset.drop.toLocaleString() })
          : tr("{col} marks {n} row(s) as not current: they are left out. Tick their value to keep them.", { col: preset.col, n: preset.drop.toLocaleString() })}</div>
      )}
      {f && <div style={{ ...note, marginTop: 4 }}>{tr("{k} of {n} rows will be imported.", { k: kept.toLocaleString(), n: rows.length.toLocaleString() })}</div>}
    </div>
  );
}
