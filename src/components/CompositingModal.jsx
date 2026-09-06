import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import Papa from "papaparse";
import { compositeDownhole, countDuplicateAssayIntervals } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { LAYER_META, UNIT_NAMES } from "../lib/layers.js";
import { saveFile } from "../lib/desktop.js";
import { overlay } from "../lib/modalStyles.js";

const RESULT_ROW_H = 26; // TASKS.csv #222 — composited-interval count can genuinely reach the thousands (e.g. a 300m hole at 2m composites), unlike a toy dataset

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
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
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
  // TASKS.csv #286 — compositeDownhole now drops exact-duplicate raw intervals before length-
  // weighting (a double-imported row used to silently double-weight into the composite grade). Tell
  // the user it happened rather than quietly fixing their data underneath them, and separately flag
  // same-interval rows with DIFFERENT results, which compositing deliberately does not resolve.
  const dupInfo = useMemo(() => countDuplicateAssayIntervals(compAssays), [compAssays]);
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(results.length, RESULT_ROW_H, { containerHeight: 380 });

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
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Downhole compositing</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>
              Fixed-length composites, breaking at domain boundaries — {assays.length} raw intervals loaded.
              {qaqcExcludedCount > 0 && !includeQAQC ? ` ${qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.` : ""}
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {(dupInfo.exactDuplicates > 0 || dupInfo.conflictingIntervals > 0) && (
            <div style={{ fontSize: "var(--font-size-sm)", lineHeight: 1.5, padding: "7px 9px", background: "#fdf6e6", border: "1px solid #e2c98a", borderRadius: 5, color: "#6b5a2a" }}>
              {dupInfo.exactDuplicates > 0 && (
                <div>{dupInfo.exactDuplicates} exact-duplicate raw interval{dupInfo.exactDuplicates === 1 ? " was" : "s were"} found in this assay table (same hole, same from/to, same results — the classic double-import). {dupInfo.exactDuplicates === 1 ? "It was" : "They were"} counted once, not twice, so {dupInfo.exactDuplicates === 1 ? "it doesn't" : "they don't"} double-weight the composite grades below. Worth cleaning up at the source anyway — run Data QC for the full list.</div>
              )}
              {dupInfo.conflictingIntervals > 0 && (
                <div style={{ marginTop: dupInfo.exactDuplicates > 0 ? 5 : 0 }}>{dupInfo.conflictingIntervals} interval{dupInfo.conflictingIntervals === 1 ? "" : "s"} appear more than once with DIFFERENT results (a re-assay, or a mislabeled sample). Those are a genuine conflict, not a double-import, so compositing left them alone — every copy is still being length-weighted in. Resolve them in the source data before using these composites for estimation.</div>
              )}
            </div>
          )}
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so they can't get composited into a resource-estimation input — check this to include them anyway.">
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
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>No assay elements loaded — import assays first.</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", padding: 8 }}>No composites meet these criteria — try a lower minimum coverage.</div>
          ) : (
            <div ref={scrollRef} onScroll={onScroll} style={{ overflow: "auto", maxHeight: 380 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-base)" }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "var(--color-bg)" }}>
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
                  {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={domainKey ? 6 : 5} style={{ padding: 0, border: "none" }} /></tr>}
                  {results.slice(startIndex, endIndex).map((r, i) => (
                    <tr key={startIndex + i} style={{ borderBottom: "1px solid var(--color-hover-bg)", height: RESULT_ROW_H, boxSizing: "border-box" }}>
                      <td style={td}>{r.hole_id}</td>
                      <td style={td}>{r.from.toFixed(2)}</td>
                      <td style={td}>{r.to.toFixed(2)}</td>
                      <td style={td}>{r.length.toFixed(2)}</td>
                      <td style={{ ...td, fontWeight: 600, color: "var(--color-text)" }}>{r.avgGrade.toFixed(3)}</td>
                      <td style={{ ...td, color: r.coverage < 0.99 ? "#c9863d" : "var(--color-text-strong)" }}>{(r.coverage * 100).toFixed(0)}%</td>
                      {domainKey && <td style={td}>{r.domain != null ? domainLabel(r.domain) : "—"}</td>}
                    </tr>
                  ))}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={domainKey ? 6 : 5} style={{ padding: 0, border: "none" }} /></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            {results.length} composite(s) from {assays.length} raw intervals. Composites are anchored to each hole's first sampled depth and stepped at the length above; a domain boundary or the hole's own start/end will shorten an individual composite below that length. Coverage below 100% means part of the composite falls in unsampled core — its grade is the length-weighted average of the material that IS sampled (not diluted toward zero).
          </div>

          <button onClick={exportCSV} disabled={results.length === 0} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: results.length === 0 ? 0.5 : 1 }}>
            <Download size={14} /> Export composites (CSV)
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(920px, 95vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", width: 130 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
const th = { textAlign: "left", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-bg)", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", color: "var(--color-text-strong)", whiteSpace: "nowrap" };
