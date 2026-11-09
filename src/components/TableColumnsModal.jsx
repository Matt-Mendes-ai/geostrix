// TASKS.csv #2177 (Matt's decision 2026-11-09) — a table too large for this computer's memory: choose its columns before it is read, so
// every value kept stays exact (nothing composited or thinned). The estimate follows the ticks; 'Open anyway' keeps #2171's way out.
import React, { useMemo, useState } from "react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { subsetBytes } from "../lib/tableSubsetRequest.js";
import { t as tr } from "../lib/i18n.js";

// the columns most imports need, ticked first: ids, depths, coordinates (by name; the user changes them)
const CORE = /^(hole|holeid|hole_id|bhid|dhid|site_?id|sample|sample_?id|sampleid|samp_?no|from|to|depth_?from|depth_?to|m_?from|m_?to|geolfrom|geolto|sampfrom|sampto|depth|x|y|z|east(ing)?|north(ing)?|rl|elev(ation)?)$/i;

export default function TableColumnsModal({ name, preview, budget, onDone }) {
  const [keep, setKeep] = useState(() => new Set(preview.headers.filter((h) => CORE.test(h.replace(/\s+/g, "_")))));
  const [q, setQ] = useState("");
  const cancel = () => onDone(false);
  useEscapeKey(cancel);
  useFocusTrap();
  const bytes = subsetBytes(preview, keep.size), fits = bytes <= budget, gb = (v) => (v / 1e9).toFixed(1);
  const shown = useMemo(() => preview.headers.filter((h) => !q || h.toLowerCase().includes(q.toLowerCase())), [preview.headers, q]);
  const toggle = (h) => setKeep((s) => { const n = new Set(s); if (n.has(h)) n.delete(h); else n.add(h); return n; });
  // how many more columns fit, at this table's rows
  const room = Math.max(0, Math.floor((budget - preview.fixed) / Math.max(1, preview.perColumn)));
  return (
    <div style={overlay}>
      <div role="dialog" aria-modal="true" aria-label={tr("Choose the columns to read")} onClick={(e) => e.stopPropagation()} style={panel}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-accent-dark)" }}>{tr("Choose the columns to read")}</div>
          <div style={{ ...note, marginTop: 4 }}>{tr("{name} is a very large table: about {rows} rows × {cols} columns, roughly {gb} GB of memory to open whole. Tick the columns you need: only those are read, every value exact.", { name, rows: preview.rows.toLocaleString(), cols: preview.cols, gb: gb(preview.bytes) })}</div>
        </div>
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Filter columns")} aria-label={tr("Filter columns")} style={inp} />
            <button type="button" style={mini} onClick={() => setKeep((s) => new Set([...s, ...shown]))}>{tr("Tick shown")}</button>
            <button type="button" style={mini} onClick={() => setKeep((s) => { const n = new Set(s); shown.forEach((h) => n.delete(h)); return n; })}>{tr("Untick shown")}</button>
          </div>
          <div role="group" aria-label={tr("Columns")} style={{ overflowY: "auto", maxHeight: 300, border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 8px", columns: 2 }}>
            {shown.map((h) => (
              <label key={h} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: "var(--font-size-sm)", padding: "2px 0", breakInside: "avoid" }}>
                <input type="checkbox" checked={keep.has(h)} onChange={() => toggle(h)} />{h}
              </label>
            ))}
          </div>
          <div role="status" style={{ ...note, color: fits ? "var(--color-text-secondary)" : "var(--color-warn-text-strong)" }}>
            {fits
              ? tr("{k} of {n} columns: about {gb} GB. Fits (up to about {room} columns at this many rows).", { k: keep.size, n: preview.cols, gb: gb(bytes), room })
              : tr("{k} of {n} columns: about {gb} GB, more than this computer can safely give (about {room} columns fit).", { k: keep.size, n: preview.cols, gb: gb(bytes), room })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button type="button" style={btn(false)} onClick={cancel}>{tr("Don't open it")}</button>
          <button type="button" style={btn(false)} onClick={() => onDone(true)} title={tr("Every column: this can close GeoStrix on this computer.")}>{tr("Open it whole anyway")}</button>
          <button type="button" style={btn(true)} disabled={!keep.size || !fits} onClick={() => onDone({ keep: preview.headers.filter((h) => keep.has(h)) })}>{tr("Read the {k} column(s)", { k: keep.size })}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(640px, 96vw)", maxHeight: "90vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 };
const inp = { flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "5px 7px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const mini = { padding: "4px 8px", borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text)", fontSize: "var(--font-size-sm)", cursor: "pointer", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "7px 14px", borderRadius: 6, fontSize: "var(--font-size-base)", fontFamily: "inherit", cursor: "pointer", border: primary ? "1px solid var(--color-accent)" : "1px solid var(--color-border)", background: primary ? "var(--color-accent)" : "var(--color-bg)", color: primary ? "var(--color-bg)" : "var(--color-text)" });
