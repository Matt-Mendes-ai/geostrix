import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import Papa from "papaparse";
import { valueIn } from "../lib/geochem.js";
import { saveFile } from "../lib/desktop.js";

// TASKS.csv #21 — multi-element correlation matrix. Pearson r between every pair of selected
// elements, pairwise deletion for missing data (a row missing one of the pair just doesn't count
// toward THAT pair — it can still count toward other pairs where both values are present), which is
// the standard approach for a correlation matrix over messy real assay data rather than dropping any
// row missing ANY element (which would often gut the dataset down to almost nothing).
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

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

export default function CorrelationMatrix({ assays, assayElements, onClose }) {
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const allSymbols = assayElements.map((e) => e.symbol);
  // Default to the first 12 loaded elements — a full 60+-element suite renders as an unreadable wall
  // of tiny cells; the checklist below lets the user swap in whichever subset they actually care about.
  const [selected, setSelected] = useState(new Set(allSymbols.slice(0, 12)));
  const toggle = (sym) => setSelected((p) => { const n = new Set(p); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });

  const symbols = allSymbols.filter((s) => selected.has(s));

  const columns = useMemo(() => {
    const cols = {};
    symbols.forEach((s) => { cols[s] = assays.map((a) => valueIn(a, s, "ppm", elementUnits)); });
    return cols;
  }, [symbols, assays, elementUnits]);

  const matrix = useMemo(() => {
    const m = {};
    symbols.forEach((a) => {
      m[a] = {};
      symbols.forEach((b) => {
        if (a === b) { m[a][b] = 1; return; }
        const xs = [], ys = [];
        const ca = columns[a], cb = columns[b];
        for (let i = 0; i < assays.length; i++) {
          if (ca[i] != null && cb[i] != null) { xs.push(ca[i]); ys.push(cb[i]); }
        }
        m[a][b] = pearson(xs, ys);
      });
    });
    return m;
  }, [symbols, columns, assays.length]);

  const exportCSV = () => {
    const rows = symbols.map((a) => {
      const row = { element: a };
      symbols.forEach((b) => { row[b] = matrix[a][b] == null ? "" : matrix[a][b].toFixed(3); });
      return row;
    });
    saveFile({ suggestedName: "correlation_matrix.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rows) });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Multi-element correlation matrix</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>Pearson r, pairwise deletion for missing values — {assays.length} intervals loaded.</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={label}>Elements ({symbols.length} of {allSymbols.length} selected)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allSymbols.map((s) => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: selected.has(s) ? "#1e3629" : "#f4f5f7", border: `1px solid ${selected.has(s) ? "#3d6b52" : "#d9dce1"}`, fontSize: 11.5, color: selected.has(s) ? "#8fd9ab" : "#55606e", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(s)} onChange={() => toggle(s)} style={{ display: "none" }} />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {symbols.length < 2 ? (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>Select at least 2 elements to compute a correlation matrix.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 10.5 }}>
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
                        const r = matrix[a][b];
                        return (
                          <td key={b} title={`${a} vs ${b}: r = ${r == null ? "n/a" : r.toFixed(3)}`} style={{ ...cell, background: cellColor(r) }}>
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
            <Download size={13} /> Export matrix (CSV)
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(820px, 95vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
const cornerCell = { width: 40, background: "#ffffff" };
const headCell = { padding: "4px 6px", color: "#55606e", fontWeight: 500, textAlign: "center", background: "#ffffff", position: "sticky", top: 0 };
const rowHead = { padding: "4px 8px", color: "#55606e", fontWeight: 500, textAlign: "right", background: "#ffffff", position: "sticky", left: 0 };
// cellColor() only ever produces light/pastel backgrounds (its darkest channel value stays well above
// 100), including a near-white "#f4f5f7" fallback for r == null — white text was illegible against
// all of these, most acutely the null/near-zero-correlation cells. Dark text reads fine across the
// whole range since nothing cellColor returns is actually dark.
const cell = { width: 34, height: 24, textAlign: "center", color: "#1a2028", fontFamily: "'Exo 2', system-ui, sans-serif", fontWeight: 600 };
