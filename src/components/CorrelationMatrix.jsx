import React, { useMemo, useState } from "react";
import { X, Download } from "./icons.js";
import { valueIn } from "../lib/geochem.js";
import { saveFile } from "../lib/desktop.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { excludeQAQC, labAssays } from "../lib/qaqc.js"; // TASKS.csv #405
import { correlationMatrix } from "../lib/correlation.js"; // TASKS.csv #405, #1514
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { toExportCsv } from "../lib/tabular.js"; // TASKS.csv #1022 — every exported CSV: all columns, formula cells escaped
import { correlationRows } from "../lib/analysisExports.js"; // TASKS.csv #1083

// TASKS.csv #21 — multi-element correlation matrix. Pearson r between every pair of selected
// elements, pairwise deletion for missing data (a row missing one of the pair just doesn't count
// toward THAT pair — it can still count toward other pairs where both values are present), which is
// the standard approach for a correlation matrix over messy real assay data rather than dropping any
// row missing ANY element (which would often gut the dataset down to almost nothing).
const METHOD_LABEL = { spearman: "Spearman rank", log: "Pearson on log10 values (values ≤ 0 left out)", pearson: "Pearson on raw values" };
const MIN_PAIRS = 10;

// Diverging red(-1) - white(0) - blue(+1) scale, a common convention for correlation heatmaps.
function cellColor(r) {
  if (r == null) return "#f4f5f7";
  const t = Math.max(-1, Math.min(1, r));
  if (t >= 0) {
    const g = Math.round(255 - t * 140), b = Math.round(255 - t * 60);
    return `rgb(${Math.round(255 - t * 70)},${g},${b})`;
  }
  const at = -t;
  const g = Math.round(255 - at * 140), rr = Math.round(255 - at * 40);
  return `rgb(${rr},${g},${Math.round(255 - at * 70)})`;
}

// TASKS.csv #1799 (review #1646, Kodiak) — surfaceSamples / surfaceElements: a soil program's Cu-Au-Mo-As correlation. The source
// switch is Grade stats' (#228); surface samples are one value each, with their QC already split off at import (Surface QAQC).
export default function CorrelationMatrix({ assays: assaysIn, assayElements: assayElementsIn, surfaceSamples = [], surfaceElements = [], onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  // TASKS.csv #405 — QAQC inserts are never samples of the ground; Spearman by default.
  const [includeQAQC, setIncludeQAQC] = useState(false);
  const [method, setMethod] = useState("spearman");
  const [source, setSource] = useState(() => (!assayElementsIn.length && surfaceElements.length ? "surface" : "assays")); // #1799
  const surface = source === "surface";
  const allAssays = surface ? surfaceSamples : assaysIn, assayElements = surface ? surfaceElements : assayElementsIn;
  const labRows = useMemo(() => (surface ? allAssays : labAssays(allAssays)), [allAssays, surface]), pxrfLeft = allAssays.length - labRows.length; // #1673 — lab grades only
  const assays = useMemo(() => (includeQAQC || surface ? labRows : excludeQAQC(labRows)), [labRows, includeQAQC, surface]);
  const qaqcCount = useMemo(() => (surface ? 0 : labRows.length - excludeQAQC(labRows).length), [labRows, surface]);
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const allSymbols = assayElements.map((e) => e.symbol);
  // Default to the first 12 loaded elements — a full 60+-element suite renders as an unreadable wall
  // of tiny cells; the checklist below lets the user swap in whichever subset they actually care about.
  const [selected, setSelected] = useState(new Set(allSymbols.slice(0, 12)));
  const pickSource = (next) => { setSource(next); setSelected(new Set((next === "surface" ? surfaceElements : assayElementsIn).map((e) => e.symbol).slice(0, 12))); }; // #1799
  const toggle = (sym) => setSelected((p) => { const n = new Set(p); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  // TASKS.csv #1514 — a memo, not a new array per render (it made every re-render recompute the whole matrix); columns and
  // pairs are cached while the rows stay the same, so a tick computes the new element's row only (see correlationMatrix)
  const symbols = useMemo(() => allSymbols.filter((s) => selected.has(s)), [assayElements, selected]);
  const caches = useMemo(() => ({ cols: {}, pairs: new Map() }), [assays, elementUnits]);
  const matrix = useMemo(() => {
    symbols.forEach((s) => { if (!caches.cols[s]) caches.cols[s] = assays.map((a) => valueIn(a, s, "ppm", elementUnits)); });
    return correlationMatrix(caches.cols, symbols, method, caches.pairs);
  }, [symbols, caches, method]);

  const exportCSV = () => {
    const { rows, nRows } = correlationRows(symbols, matrix); // #1083 — rows in lib, tested
    // TASKS.csv #405 — the file says what it is: method, QAQC handling, pairwise n.
    const basis = surface ? `# ${METHOD_LABEL[method]}; pairwise deletion; ${assays.length} surface samples (QC split off at import).` : `# ${METHOD_LABEL[method]}; pairwise deletion; QAQC inserts ${includeQAQC ? "INCLUDED" : `excluded (${qaqcCount} rows)`}; ${assays.length} intervals, not length-weighted.`; // #1799
    saveFile({ suggestedName: "correlation_matrix.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: `${basis}\n${toExportCsv(rows)}\n\n${toExportCsv(nRows)}` });
  };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Multi-element correlation matrix")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{surface ? tr("{v}, pairwise deletion — {n} surface samples. Cells with fewer than {MIN_PAIRS} pairs are greyed.", { v: tr(METHOD_LABEL[method]), n: assays.length, MIN_PAIRS }) : tr("{v}, pairwise deletion — {assays} intervals{v2}. Cells with fewer than {MIN_PAIRS} pairs are greyed.", { v: tr(METHOD_LABEL[method]), assays: assays.length, v2: includeQAQC ? tr(" (QAQC inserts included)") : qaqcCount ? tr(", {qaqcCount} QAQC rows excluded", { qaqcCount }) : "", MIN_PAIRS })}</div>
            {!surface && pxrfLeft > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{n} pXRF reading(s) left out: the grades here come from lab assays only.", { n: pxrfLeft })}</div>}{/* #1673 */}
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>
            {assayElementsIn.length > 0 && surfaceElements.length > 0 && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Data source")}<select value={source} onChange={(e) => pickSource(e.target.value)} style={{ fontSize: "var(--font-size-base)" }}><option value="assays">{tr("Drillhole assays")}</option><option value="surface">{tr("Surface samples")}</option></select></label>}{/* #1799 */}
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Method")}<select value={method} onChange={(e) => setMethod(e.target.value)} style={{ fontSize: "var(--font-size-base)" }}>
                <option value="spearman">{tr("Spearman rank (default)")}</option>
                <option value="log">{tr("Pearson, log10 values")}</option>
                <option value="pearson">{tr("Pearson, raw values")}</option>
              </select>
            </label>
            {!surface && <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />{" "}{tr("Include QAQC inserts{v}", { v: qaqcCount ? ` (${qaqcCount})` : "" })}
            </label>}
          </div>
          <div>
            <div style={label}>{tr("Elements ({symbols} of {allSymbols} selected)", { symbols: symbols.length, allSymbols: allSymbols.length })}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allSymbols.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: selected.has(s) ? "var(--color-success-bg)" : "var(--color-bg-subtle)", border: `1px solid ${selected.has(s) ? "var(--color-success-border)" : "var(--color-border)"}`, fontSize: "var(--font-size-base)", color: selected.has(s) ? "var(--color-success-text)" : "var(--color-text-secondary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(s)} onChange={() => toggle(s)} style={{ display: "none" }} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {symbols.length < 2 ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>{tr("Select at least 2 elements to compute a correlation matrix.")}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
                <thead>
                  <tr>
                    <th style={cornerCell} />
                    {symbols.map((s) => <th key={s} style={headCell}>{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {symbols.map((a) => (
                    <tr key={a}>
                      <th style={rowHead}>{a}</th>
                      {symbols.map((b) => {
                        const { r, n } = matrix[a][b];
                        const thin = n < MIN_PAIRS;
                        return (
                          <td key={b} title={tr("{a} vs {b}: r = {v} (n = {n} pairs{v2})", { a, b, v: r == null ? "n/a" : r.toFixed(3), n, v2: thin ? tr(", too few to trust") : "" })} style={{ ...cell, background: thin ? cellColor(null) : cellColor(r), color: thin ? "var(--color-text-faint)" : cell.color }}>
                            {r == null ? "—" : r.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={exportCSV} disabled={symbols.length < 2} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: symbols.length < 2 ? 0.5 : 1 }}>
            <Download size={14} />{" "}{tr("Export matrix (CSV)")}</button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(820px, 95vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const cornerCell = { width: 40, background: "var(--color-bg)" };
const headCell = { padding: "4px 6px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "center", background: "var(--color-bg)", position: "sticky", top: 0 };
const rowHead = { padding: "4px 8px", color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "right", background: "var(--color-bg)", position: "sticky", left: 0 };
// cellColor() only ever produces light/pastel backgrounds (its darkest channel value stays well above
// 100), including a near-white "#f4f5f7" fallback for r == null — white text was illegible against
// all of these, most acutely the null/near-zero-correlation cells. Dark text reads fine across the
// whole range since nothing cellColor returns is actually dark.
const cell = { width: 34, height: 24, textAlign: "center", color: "var(--color-text)", fontFamily: "'Exo 2', system-ui, sans-serif", fontWeight: 600 };
