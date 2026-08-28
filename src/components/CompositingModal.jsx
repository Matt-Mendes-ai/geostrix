import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import Papa from "papaparse";
import { compositeDownhole } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { LAYER_META, UNIT_NAMES } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";

// TASKS.csv #118 — "Downhole compositing (fixed-length, domain-honoring)". Micromine/Leapfrog-specialist
// audit finding: the standard bridge step between raw assay intervals and any resource-estimation
// workflow (variography, grade-into-blocks — see TASKS #117, which depends on this). The compositing
// math itself lives in lib/geochem.js's compositeDownhole (fixed-length steps, forced breaks at domain
// boundaries so a composite never straddles a geological contact, per-sample high-grade capping before
// averaging, and a reported coverage fraction so a composite built from mostly-missing core can be
// filtered out rather than silently treated as a full real sample); this is the control panel + results
// table + CSV export around it, matching the BestIntercepts.jsx pattern already established.
const DOMAIN_LAYER_KEYS = ["litho", "alt", "vein", "geotech"];

export default function CompositingModal({ assays, assayElements, layers, onClose }) {
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const [symbol, setSymbol] = useState(symbols[0] || "Au");
  const unit = elementUnits[symbol] || "ppm";
  const [length, setLength] = useState(2);
  const [minCoverage, setMinCoverage] = useState(0.5);
  const [capValue, setCapValue] = useState("");
  const [domainKey, setDomainKey] = useState(""); // "" = no domain honoring
  // TASKS.csv #219 — QC samples (standards/blanks/duplicates) default OUT of compositing, same as
  // Best Intercepts — a QC insert has no business being composited into a resource-estimation input.
  const [includeQAQC, setIncludeQAQC] = useState(false);
  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const compAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  const domainOptions = DOMAIN_LAYER_KEYS.filter((k) => (layers[k] || []).length > 0);
  const domainRows = domainKey ? layers[domainKey] : null;
  const domainMeta = domainKey ? LAYER_META[domainKey] : null;

  const results = useMemo(() => {
    if (!symbol || length <= 0) return [];
    return compositeDownhole(compAssays, symbol, unit, elementUnits, {
      length,
      minCoverage,
      capValue: capValue === "" ? null : Number(capValue),
      domainRows,
    });
  }, [compAssays, symbol, unit, elementUnits, length, minCoverage, capValue, domainRows]);

  const domainLabel = (v) => (domainKey === "litho" ? (UNIT_NAMES[v] || v) : v);

  const exportCSV = () => {
    const rows = results.map((r) => ({
      hole_id: r.hole_id, from: r.from.toFixed(2), to: r.to.toFixed(2), length_m: r.length.toFixed(2),
      [`avg_${symbol}_${unit}`]: r.avgGrade.toFixed(3),
      coverage_pct: (r.coverage * 100).toFixed(0),
      ...(domainKey ? { [domainMeta.label]: r.domain != null ? domainLabel(r.domain) : "" } : {}),
    }));
    saveFile({ suggestedName: `composites_${symbol}_${length}m.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rows) });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Downhole compositing</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>
              Fixed-length composites, breaking at domain boundaries — {assays.length} raw intervals loaded.
              {qaqcExcludedCount > 0 && !includeQAQC ? ` ${qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.` : ""}
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so they can't get composited into a resource-estimation input — check this to include them anyway.">
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />
              Include QC samples (standards/blanks/duplicates) in this report
            </label>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>Element
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
              </select>
            </label>
            <label style={fieldLabel}>Composite length (m)
              <input type="number" step="any" min="0.1" value={length} onChange={(e) => setLength(Math.max(0.1, Number(e.target.value) || 2))} style={inp} />
            </label>
            <label style={fieldLabel} title="Honor a domain layer's boundaries — a composite will never straddle a change in this layer's value, even if that makes it shorter than the target length.">
              Honor domain
              <select value={domainKey} onChange={(e) => setDomainKey(e.target.value)} style={inp}>
                <option value="">— none —</option>
                {domainOptions.map((k) => <option key={k} value={k}>{LAYER_META[k].label}</option>)}
              </select>
            </label>
            <label style={fieldLabel} title="Cap any single raw sample's grade at this value before it's folded into a composite average — applied per-sample, before compositing, matching standard practice.">
              High-grade cap ({unit})
              <input type="number" step="any" min="0" placeholder="none" value={capValue} onChange={(e) => setCapValue(e.target.value)} style={inp} />
            </label>
            <label style={fieldLabel} title="Minimum fraction of a composite interval that must actually be covered by real assay data (vs. missing/lost core) for it to be reported.">
              Min coverage (%)
              <input type="number" step="1" min="0" max="100" value={Math.round(minCoverage * 100)} onChange={(e) => setMinCoverage(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} style={inp} />
            </label>
          </div>

          {symbols.length === 0 ? (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>No assay elements loaded — import assays first.</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>No composites meet these criteria — try a lower minimum coverage.</div>
          ) : (
            <div style={{ overflow: "auto", maxHeight: 380 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "#ffffff" }}>
                    <th style={th}>Hole</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                    <th style={th}>Length (m)</th>
                    <th style={th}>Avg {symbol} ({unit})</th>
                    <th style={th}>Coverage</th>
                    {domainKey && <th style={th}>{domainMeta.label}</th>}
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eef1f5" }}>
                      <td style={td}>{r.hole_id}</td>
                      <td style={td}>{r.from.toFixed(2)}</td>
                      <td style={td}>{r.to.toFixed(2)}</td>
                      <td style={td}>{r.length.toFixed(2)}</td>
                      <td style={{ ...td, fontWeight: 600, color: "#1a2028" }}>{r.avgGrade.toFixed(3)}</td>
                      <td style={{ ...td, color: r.coverage < 0.99 ? "#c9863d" : "#2a3340" }}>{(r.coverage * 100).toFixed(0)}%</td>
                      {domainKey && <td style={td}>{r.domain != null ? domainLabel(r.domain) : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.5 }}>
            {results.length} composite(s) from {assays.length} raw intervals. Composites are anchored to each hole's first sampled depth and stepped at the length above; a domain boundary or the hole's own start/end will shorten an individual composite below that length. Coverage below 100% means part of the composite falls in unsampled core — its grade is the length-weighted average of the material that IS sampled (not diluted toward zero).
          </div>

          <button onClick={exportCSV} disabled={results.length === 0} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: results.length === 0 ? 0.5 : 1 }}>
            <Download size={13} /> Export composites (CSV)
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
const panel = { width: "min(920px, 95vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const fieldLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit", width: 130 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, borderBottom: "1px solid #d9dce1", position: "sticky", top: 0, background: "#ffffff", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", color: "#2a3340", whiteSpace: "nowrap" };
