// TASKS.csv #3563 (Fireweed rehearsal) — a table of the project's assays and interval / point layers: every stored column with its unit in the heading, all rows windowed,
// a click on a heading sorts, a filter box under each heading ('>= 6', '6..8', 'REG', '!REG'), a search over every column, Export CSV of what is shown. Read-only: a value is corrected
// in its source file and imported again (said at the top), so nothing here changes the data. Opened by lib/dataTableRequests.js (the ribbon, a layer's inspector, Geochem's
// sidebar, a Data QC row: { source, hole, from, to } preset the filters and mark the row).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Download } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { tableSources, buildTable, applyTable } from "../lib/dataTable.js";
import { saveFile } from "../lib/desktop.js";
import { toExportCsv } from "../lib/tabular.js";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js";
import { t as tr } from "../lib/i18n.js";

const ROW_H = 24, COL_W = 112;
// TASKS.csv #3694 — a column as wide as its heading needs (about 7 px a letter and the sort arrow), up to 260 px: 'Specific gravity (t/m³)' was cut to 'Specific gravity (t...'
const colWidth = (c) => Math.max(COL_W, Math.min(260, Math.ceil(String(c?.label || "").length * 7 + 34)));
const fmt = (v) => (v == null || v === "" ? "" : typeof v === "number" ? String(+v.toPrecision(10)) : String(v));

export default function DrillTableModal({ request = {}, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap();
  const store = useStore();
  const { assays, assayElements, layers, customLayers, project } = store;
  const sources = useMemo(() => tableSources({ assays, layers, customLayers }), [assays, layers, customLayers]);
  const [source, setSource] = useState(() => (request.source && sources.some((s) => s.key === request.source) ? request.source : sources[0]?.key || ""));
  const table = useMemo(() => (source ? buildTable(source, { assays, assayElements, layers, customLayers }) : { label: "", columns: [], rows: [], n: 0 }), [source, assays, assayElements, layers, customLayers]);
  // a QC row's hole is the first filter: its exact id
  const holeCol = table.columns.findIndex((c) => c.key === "hole_id");
  const [filters, setFilters] = useState(() => (request.hole ? { __hole: `"${request.hole}"` } : {}));
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(null);
  // __hole stands for the hole_id column of whichever source is shown
  const colFilters = useMemo(() => { const f = { ...filters }; if (f.__hole != null) { if (holeCol >= 0) f[holeCol] = f.__hole; delete f.__hole; } return f; }, [filters, holeCol]);
  const order = useMemo(() => applyTable(table, { filters: colFilters, search, sort }), [table, colFilters, search, sort]);
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(order.length, ROW_H);
  const iFrom = table.columns.findIndex((c) => c.key === "from"), iTo = table.columns.findIndex((c) => c.key === "to");
  const marked = (r) => request.from != null && request.to != null && iFrom >= 0 && iTo >= 0 && Math.abs(r[iFrom] - request.from) < 1e-6 && Math.abs(r[iTo] - request.to) < 1e-6 && (!request.hole || r[holeCol] === request.hole);
  // the marked row scrolled into view once the table is built
  const doneScroll = useRef(null);
  useEffect(() => {
    if (!table.n || doneScroll.current === source || request.from == null) return;
    const at = Array.from(order).findIndex((i) => marked(table.rows[i]));
    doneScroll.current = source;
    if (at >= 0 && scrollRef.current) scrollRef.current.scrollTop = Math.max(0, at * ROW_H - 3 * ROW_H);
  });
  const pickSource = (k) => { setSource(k); setFilters(request.hole ? { __hole: `"${request.hole}"` } : {}); setSort(null); doneScroll.current = k; };
  const clickHead = (ci) => setSort((p) => (p?.col === ci ? (p.dir === 1 ? { col: ci, dir: -1 } : null) : { col: ci, dir: 1 }));
  const setFilter = (ci, v) => setFilters((p) => { const n = { ...p }; if (v === "") delete n[ci]; else n[ci] = v; if (ci === holeCol) delete n.__hole; return n; });
  const hasFilter = search.trim() !== "" || Object.keys(colFilters).length > 0;

  const exportCsv = () => {
    const head = table.columns.map((c) => c.label);
    const rows = Array.from(order, (i) => table.rows[i].map((v, ci) => (v == null ? "" : table.lt?.get(i)?.has(ci) ? `<${v}` : v))); // #3732: '<' on a flagged cell
    const name = String(project?.name || "project").replace(/[^a-z0-9_-]+/gi, "_"), what = String(table.label).replace(/[^a-z0-9_-]+/gi, "_");
    saveFile({ suggestedName: `${name}_${what}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv([head, ...rows]) });
  };
  const widths = table.columns.map(colWidth), width = Math.max(COL_W, widths.reduce((a, b) => a + b, 0));

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Data table")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Read only: a value is corrected in its source file and imported again.")}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>
        {sources.length === 0 ? (
          <div style={{ padding: 24, color: "var(--color-text-muted)", fontSize: "var(--font-size-base)" }}>{tr("No assays or drillhole logs are loaded yet.")}</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid var(--color-border)", flexWrap: "wrap" }}>
              <select value={source} onChange={(e) => pickSource(e.target.value)} aria-label={tr("Table")} style={sel}>
                {sources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.count.toLocaleString()})</option>)}
              </select>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Find in any column")} aria-label={tr("Find in any column")} style={{ ...sel, flex: 1, minWidth: 160 }} />
              <span role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{order.length === table.n ? tr("{n} rows", { n: table.n.toLocaleString() }) : tr("{n} of {m} rows", { n: order.length.toLocaleString(), m: table.n.toLocaleString() })}</span>
              {hasFilter && <button type="button" style={btn} onClick={() => { setFilters({}); setSearch(""); }}>{tr("Clear filters")}</button>}
              <button type="button" style={btn} onClick={exportCsv} disabled={!order.length} title={tr("Save the rows shown as a CSV")}><Download size={13} />{" "}{tr("Export CSV")}</button>
            </div>
            <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}>
              <div style={{ width, position: "sticky", top: 0, zIndex: 1, background: "var(--color-bg-subtle)", borderBottom: "1px solid var(--color-border)" }}>
                <div style={{ display: "flex" }}>
                  {table.columns.map((c, ci) => (
                    <div key={c.key} role="columnheader" aria-sort={sort?.col === ci ? (sort.dir === 1 ? "ascending" : "descending") : "none"} tabIndex={0} onKeyDown={activateOnKey} onClick={() => clickHead(ci)} title={tr("Click to sort")} style={{ ...cell, width: widths[ci], fontWeight: 600, cursor: "pointer", color: "var(--color-text)" }}>
                      {c.label}{sort?.col === ci ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex" }}>
                  {table.columns.map((c, ci) => (
                    <div key={c.key} style={{ ...cell, width: widths[ci], padding: 2 }}>
                      <input type="text" value={colFilters[ci] ?? ""} onChange={(e) => setFilter(ci, e.target.value)} aria-label={tr("Filter {col}", { col: c.label })} placeholder={c.numeric ? ">= 6, 6..8" : "REG, !REG"} style={{ ...sel, width: "100%", boxSizing: "border-box", padding: "2px 5px", fontSize: "var(--font-size-xs)" }} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ width, height: topPad }} />
              {Array.from(order.subarray(startIndex, endIndex), (ri, k) => {
                const r = table.rows[ri], hit = marked(r);
                return (
                  <div key={startIndex + k} style={{ display: "flex", width, height: ROW_H, background: hit ? "var(--color-warn-bg, #fdf4e6)" : (startIndex + k) % 2 ? "var(--color-bg-subtle)" : "var(--color-bg)" }} data-marked={hit ? "1" : undefined}>
                    {r.map((v, ci) => { const q = table.lt?.get(ri)?.has(ci) ? "<" : ""; /* #3732 */ return <div key={ci} title={q + fmt(v)} style={{ ...cell, width: widths[ci], fontWeight: 400, textAlign: table.columns[ci].numeric ? "right" : "left", color: "var(--color-text)" }}>{q}{fmt(v)}</div>; })}
                  </div>
                );
              })}
              <div style={{ width, height: bottomPad }} />
              {order.length === 0 && <div style={{ padding: 20, color: "var(--color-text-muted)", fontSize: "var(--font-size-base)" }}>{tr("No row matches these filters.")}</div>}
            </div>
          </>
        )}
        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" style={btn} onClick={onClose}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(980px, 96vw)", height: "min(720px, 90vh)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 9px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const btn = { display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer", fontFamily: "inherit" };
const cell = { width: COL_W, flexShrink: 0, boxSizing: "border-box", padding: "4px 6px", fontSize: "var(--font-size-sm)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "16px", borderRight: "1px solid var(--color-border-subtle)" };
