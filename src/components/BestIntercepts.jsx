import React, { useMemo, useState } from "react";
import { X, Download } from "lucide-react";
import Papa from "papaparse";
import { computeBestIntercepts, avgGradeInRange } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js";
import { desurveyHole } from "../lib/desurvey.js";
import { trueWidthForIntercept } from "../lib/trueWidth.js";
import { useVirtualRows } from "../lib/useVirtualRows.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { saveFile } from "../lib/desktop.js";
import { overlay } from "../lib/modalStyles.js";

const RESULT_ROW_H = 26; // TASKS.csv #222 — matches AttributeTableModal's row-windowing pattern

// TASKS.csv #132 — "Best-intercept / downhole intersection reporting (grade x length above a
// cutoff)". Micromine-specialist audit finding: a daily-use tool for target generation and reporting
// that GeoStrix had no equivalent of — the composite math itself lives in lib/geochem.js's
// computeBestIntercepts (grouped by hole, internal-dilution bridging, length-weighted grade); this is
// just the control panel + results table + CSV export around it.
export default function BestIntercepts({ assays, assayElements, collars, survey, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const [symbol, setSymbol] = useState(symbols[0] || "Au");
  const unit = elementUnits[symbol] || "ppm";
  const [cutoff, setCutoff] = useState(0.5);
  const [maxInternalDilution, setMaxInternalDilution] = useState(2);
  const [minLength, setMinLength] = useState(0);
  const [minGradeLen, setMinGradeLen] = useState(0); // grade × length screening cutoff, e.g. "gram-metres"
  // TASKS.csv #230 — extra elements shown alongside the primary (compositing-anchor) element, e.g.
  // "what's the Ag and Cu over this Au intercept?" — the compositing/cutoff/dilution logic still only
  // ever runs against ONE element (`symbol`, below); these are just additional length-weighted
  // averages over each already-composited interval's fixed from/to window (see avgGradeInRange).
  const [extraSymbols, setExtraSymbols] = useState([]);
  const toggleExtraSymbol = (s) => setExtraSymbols((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  // TASKS.csv #219 — QC samples (standards/blanks/duplicates) default OUT of this report, same as
  // every other stat/report tool this pass touched — a synthetic standard has no business turning up
  // as a "best intercept" next to real drillhole intervals. Left togglable in case a project's lab
  // naming doesn't match the default patterns and a user wants to sanity-check what's being excluded.
  const [includeQAQC, setIncludeQAQC] = useState(false);
  // TASKS.csv #230 — true (structure-corrected) width. Off by default: it requires the user to state
  // the mineralized structure's orientation, and there's no way to infer that reliably from assay
  // data alone, so silently guessing one would produce confidently-wrong numbers in a report. Once
  // enabled, the reported width is downholeLength × |ĥ·n̂| (see trueWidth.js for the derivation).
  const [twEnabled, setTwEnabled] = useState(false);
  const [twDipDir, setTwDipDir] = useState(90);
  const [twDip, setTwDip] = useState(60);
  // Desurveyed trace per hole, built once — trueWidth needs the hole's actual direction ACROSS each
  // intercept, which for a real surveyed (curved) hole differs from its collar orientation.
  const tracesByHole = useMemo(() => {
    if (!twEnabled || !collars?.length) return null;
    const byHole = new Map();
    survey?.forEach((s) => { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); });
    const out = new Map();
    collars.forEach((c) => {
      const t = desurveyHole(c, byHole.get(c.hole_id) || []);
      if (t.length) out.set(c.hole_id, t);
    });
    return out;
  }, [twEnabled, collars, survey]);
  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const reportAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  const results = useMemo(() => {
    if (!symbol) return [];
    const rows = computeBestIntercepts(reportAssays, symbol, unit, elementUnits, { cutoff, maxInternalDilution, minLength });
    return rows.filter((r) => r.avgGrade * r.length >= minGradeLen - 1e-9).map((r) => ({
      ...r,
      extras: Object.fromEntries(extraSymbols.map((s) => [s, avgGradeInRange(reportAssays, r.hole_id, r.from, r.to, s, elementUnits[s] || "ppm", elementUnits)])),
      // null (not a fallback to downhole length) whenever the geometry can't be resolved — see
      // trueWidth.js: showing the UNCORRECTED number under a "True width" heading would be worse
      // than showing nothing.
      tw: tracesByHole ? trueWidthForIntercept(tracesByHole.get(r.hole_id), r.from, r.to, twDipDir, twDip) : null,
    }));
  }, [reportAssays, symbol, unit, elementUnits, cutoff, maxInternalDilution, minLength, minGradeLen, extraSymbols, tracesByHole, twDipDir, twDip]);
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(results.length, RESULT_ROW_H, { containerHeight: 380 });

  const exportCSV = () => {
    const rows = results.map((r) => ({
      hole_id: r.hole_id, from: r.from, to: r.to, length_m: r.length.toFixed(2),
      ...(twEnabled ? {
        true_width_m: r.tw ? r.tw.trueWidth.toFixed(2) : "",
        true_width_factor: r.tw ? r.tw.factor.toFixed(3) : "",
        structure_dipdir: twDipDir, structure_dip: twDip,
      } : {}),
      [`avg_${symbol}_${unit}`]: r.avgGrade.toFixed(3),
      grade_x_length: (r.avgGrade * r.length).toFixed(2),
      ...Object.fromEntries(extraSymbols.map((s) => [`avg_${s}_${elementUnits[s] || "ppm"}`, r.extras[s] == null ? "" : r.extras[s].toFixed(3)])),
      assay_intervals: r.intervals,
    }));
    saveFile({ suggestedName: `best_intercepts_${symbol}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }], content: Papa.unparse(rows) });
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Best-intercept report</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>
              Composited downhole intersections above a cutoff, with an internal-dilution allowance — {assays.length} intervals loaded.
              {qaqcExcludedCount > 0 && !includeQAQC ? ` ${qaqcExcludedCount} QC sample(s) (standards/blanks/duplicates) excluded.` : ""}
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so they can't turn up as a false 'best intercept' — check this to include them anyway.">
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />
              Include QC samples (standards/blanks/duplicates) in this report
            </label>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>Element
              <select value={symbol} onChange={(e) => { setSymbol(e.target.value); setExtraSymbols((p) => p.filter((s) => s !== e.target.value)); }} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
              </select>
            </label>
            <label style={fieldLabel}>Cutoff ({unit})
              <input type="number" step="any" value={cutoff} onChange={(e) => setCutoff(Number(e.target.value) || 0)} style={inp} />
            </label>
            <label style={fieldLabel} title="How much below-cutoff ('waste') core between two above-cutoff samples is still folded into one intercept, diluting its grade, rather than splitting the intercept in two.">
              Max internal dilution (m)
              <input type="number" step="any" min="0" value={maxInternalDilution} onChange={(e) => setMaxInternalDilution(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel}>Min length (m)
              <input type="number" step="any" min="0" value={minLength} onChange={(e) => setMinLength(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel} title="Screen out intercepts below this grade × length (e.g. gram-metres for Au in g/t) — leave at 0 to show every intercept meeting the length/cutoff criteria above.">
              Min grade × length
              <input type="number" step="any" min="0" value={minGradeLen} onChange={(e) => setMinGradeLen(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
          </div>

          {symbols.length > 1 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} title="Extra elements' length-weighted average over each already-composited interval — the intercept itself is still only built/cut off against the primary Element above.">
              <span style={{ fontSize: 10.5, color: "#55606e" }}>Also show:</span>
              {symbols.filter((s) => s !== symbol).map((s) => (
                <label key={s} style={{ fontSize: 11, color: extraSymbols.includes(s) ? "#1a2028" : "#94a1b0", display: "flex", alignItems: "center", gap: 3, cursor: "pointer", padding: "3px 7px", borderRadius: 5, border: `1px solid ${extraSymbols.includes(s) ? "#3d6b52" : "#d9dce1"}` }}>
                  <input type="checkbox" checked={extraSymbols.includes(s)} onChange={() => toggleExtraSymbol(s)} style={{ margin: 0 }} />
                  {s} ({elementUnits[s] || "ppm"})
                </label>
              ))}
            </div>
          )}

          {/* TASKS.csv #230 — true (structure-corrected) width. Requires the user to state the
              mineralized structure's orientation: it can't be inferred from assay data, and guessing
              would put confidently-wrong widths in a report. Disabled with an explanation when there's
              no collar geometry loaded, rather than silently doing nothing. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "7px 9px", background: twEnabled ? "#eaf1fa" : "#f4f5f7", border: `1px solid ${twEnabled ? "#a9c6e0" : "#d9dce1"}`, borderRadius: 6 }}>
            <label style={{ fontSize: 11, color: collars?.length ? "#1a2028" : "#94a1b0", display: "flex", alignItems: "center", gap: 5, cursor: collars?.length ? "pointer" : "default" }}
              title={collars?.length ? "Correct each intercept's downhole length to a true (perpendicular) thickness across the structure." : "Needs collar (and ideally survey) data loaded to know each hole's orientation."}>
              <input type="checkbox" checked={twEnabled} disabled={!collars?.length} onChange={(e) => setTwEnabled(e.target.checked)} style={{ margin: 0 }} />
              True width
            </label>
            {twEnabled && (
              <>
                <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4 }} title="Dip direction (dip azimuth) of the mineralized structure — 0=N, 90=E.">
                  Structure dip dir
                  <input type="number" step="any" value={twDipDir} onChange={(e) => setTwDipDir(((Number(e.target.value) || 0) % 360 + 360) % 360)} style={{ ...inp, width: 60 }} />
                </label>
                <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 4 }} title="Dip of the mineralized structure, degrees below horizontal.">
                  dip
                  <input type="number" step="any" min="0" max="90" value={twDip} onChange={(e) => setTwDip(Math.max(0, Math.min(90, Number(e.target.value) || 0)))} style={{ ...inp, width: 55 }} />
                </label>
              </>
            )}
            {!collars?.length && <span style={{ fontSize: 10, color: "#94a1b0" }}>Import collars to enable.</span>}
            {twEnabled && <span style={{ fontSize: 10, color: "#55606e" }}>Width × |cos θ| to the structure's pole — a factor near 1 means a well-oriented hole.</span>}
          </div>

          {symbols.length === 0 ? (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>No assay elements loaded — import assays first.</div>
          ) : results.length === 0 ? (
            <div style={{ fontSize: 12, color: "#55606e", padding: 8 }}>No intervals meet these criteria — try a lower cutoff or shorter minimum length.</div>
          ) : (
            <div ref={scrollRef} onScroll={onScroll} style={{ overflow: "auto", maxHeight: 380 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, background: "#ffffff" }}>
                    <th style={th}>Hole</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                    <th style={th}>Length (m)</th>
                    {twEnabled && <th style={th} title="Downhole length corrected to a true thickness perpendicular to the stated structure.">True width (m)</th>}
                    {twEnabled && <th style={th} title="|cos θ| between the hole and the structure's pole. 1.0 = hole perpendicular to the structure (ideal); near 0 = a grazing intersection whose downhole width is badly inflated.">Factor</th>}
                    <th style={th}>Avg {symbol} ({unit})</th>
                    <th style={th}>Grade × length</th>
                    {extraSymbols.map((s) => <th key={s} style={th}>Avg {s} ({elementUnits[s] || "ppm"})</th>)}
                    <th style={th}>Assay intervals</th>
                  </tr>
                </thead>
                <tbody>
                  {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={7 + extraSymbols.length + (twEnabled ? 2 : 0)} style={{ padding: 0, border: "none" }} /></tr>}
                  {results.slice(startIndex, endIndex).map((r, i) => (
                    <tr key={startIndex + i} style={{ borderBottom: "1px solid #eef1f5", height: RESULT_ROW_H, boxSizing: "border-box" }}>
                      <td style={td}>{r.hole_id}</td>
                      <td style={td}>{r.from.toFixed(2)}</td>
                      <td style={td}>{r.to.toFixed(2)}</td>
                      <td style={td}>{r.length.toFixed(2)}</td>
                      {twEnabled && <td style={td}>{r.tw ? r.tw.trueWidth.toFixed(2) : "—"}</td>}
                      {twEnabled && <td style={{ ...td, color: r.tw && r.tw.factor < 0.5 ? "#b06a1f" : undefined }} title={r.tw && r.tw.factor < 0.5 ? "Oblique intersection — the downhole width overstates true thickness by more than 2x." : undefined}>{r.tw ? r.tw.factor.toFixed(3) : "—"}</td>}
                      <td style={{ ...td, fontWeight: 600, color: "#1a2028" }}>{r.avgGrade.toFixed(3)}</td>
                      <td style={td}>{(r.avgGrade * r.length).toFixed(2)}</td>
                      {extraSymbols.map((s) => <td key={s} style={td}>{r.extras[s] == null ? "—" : r.extras[s].toFixed(3)}</td>)}
                      <td style={td}>{r.intervals}</td>
                    </tr>
                  ))}
                  {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={7 + extraSymbols.length + (twEnabled ? 2 : 0)} style={{ padding: 0, border: "none" }} /></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.5 }}>
            Sorted by grade × length (best intercepts first). Below-detection assay values are already substituted at half the detection limit (same convention as the plots). This is a screening tool — verify any intercept you plan to report externally against the raw assay certificates.
          </div>

          <button onClick={exportCSV} disabled={results.length === 0} style={{ ...btn(true), alignSelf: "flex-start", padding: "7px 14px", display: "flex", alignItems: "center", gap: 6, opacity: results.length === 0 ? 0.5 : 1 }}>
            <Download size={13} /> Export report (CSV)
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(880px, 95vw)", maxHeight: "88vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const fieldLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit", width: 130 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, borderBottom: "1px solid #d9dce1", position: "sticky", top: 0, background: "#ffffff", whiteSpace: "nowrap" };
const td = { padding: "5px 8px", color: "#2a3340", whiteSpace: "nowrap" };
