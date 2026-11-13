import { QC_COLUMN_KEYS } from "../lib/assayQcColumns.js"; // TASKS.csv #1184
import React, { useEffect, useMemo, useState } from "react";
import { X } from "./icons.js";
import { percentColumnsReadingPpm } from "../lib/percentAsPpm.js"; // TASKS.csv #3197
import { isElementColumn, inferUnit, ELEMENT_SYMBOLS, UNIT_ONLY_SYMBOLS, unitAssumed, repeatColumns, numberedRepeatCandidates, oxideOfHeader, keepsOxide, importStoreUnit, oxidesOver100, LOI } from "../lib/geochem.js"; // LOI: #2887; // importStoreUnit, oxidesOver100: #2490 // numberedRepeatCandidates: #2350 // repeatColumns: #2194; oxide basis: #2487
import { scanAssayColumns, negativeSummary, zeroCount, blankCount } from "../lib/assayColumnScan.js"; // TASKS.csv #2164
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { pointReadings } from "../lib/pxrfPoints.js"; // TASKS.csv #1653
import { pxrfSignature } from "../lib/pxrfSignature.js"; // TASKS.csv #2198
import RowFilterBox from "./RowFilterBox.jsx"; // TASKS.csv #2391 — the row filter of the drillhole import (#2330), here too

export default function AssayImportModal({ modal, onChange, onCancel, onCommit, existingUnits = {} }) {
  // TASKS.csv #2037 — the columns an interval import cannot do without (a long file also needs its analyte and value columns)
  const unmapped = [["hole_id", tr("Hole ID")], ["from", tr("From")], ["to", tr("To")], ...(modal.format === "long" ? [["analyte", tr("Analyte")], ["value", tr("Value")]] : [])].filter(([k]) => !modal.mapping?.[k]).map(([, label]) => label);
  useEscapeKey(onCancel); // TASKS.csv #238
  const labLike = modal.isPxrf ? pxrfSignature(modal.headers || []) : null; // #2198 — a lab file on the pXRF button
  useFocusTrap(); // TASKS.csv #238
  const checkedCount = modal.elements.filter((e) => e.checked).length;
  // TASKS.csv #333 — count negative numbers in the columns being imported, so the user decides what they mean before they become grades;
  // #1677 exact zeros; #502 empty cells. TASKS.csv #2164 — one chunked pass over the rows for every candidate column (assayColumnScan.js),
  // so a 590,000-row file no longer freezes the window before the dialog paints; ticking an element re-sums per-column results (#583).
  const scanHeaders = modal.format === "long" ? [modal.mapping.value].filter(Boolean) : [...new Set(modal.elements.map((e) => e.header).filter(Boolean))];
  const scanKey = scanHeaders.join("\u0001");
  const [scan, setScan] = useState(null);
  const [scanPct, setScanPct] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setScan(null); setScanPct(0);
    scanAssayColumns(modal.allRows || [], scanHeaders, { onProgress: (f) => { if (!cancelled) setScanPct(f); }, isCancelled: () => cancelled })
      .then((st) => { if (!cancelled && st) setScan(st); });
    return () => { cancelled = true; };
  }, [modal.allRows, scanKey]); // scanKey stands for scanHeaders
  const importedHeaders = modal.format === "long" ? [modal.mapping.value] : modal.elements.filter((e) => e.checked).map((e) => e.header);
  const NONE = { codes: 0, sentinels: 0, over: 0, overCols: [], overAny: 0 };
  // #1648 — over-limit codes are counted apart, and fall back into the other two when the user turns their reading off
  // TASKS.csv #2887 (WA iron review) — the questions about negative and zero values are about assays: an LOI column's negatives are gains on
  // ignition and its -10s no-data codes, read by its own rule (geochem.js readLoiCell), so they are not counted here ('69 negative values …
  // Assays can't be negative' counted the two LOI columns)
  const codeHeaders = modal.format === "long" ? importedHeaders : modal.elements.filter((e) => e.checked && e.symbol !== LOI).map((e) => e.header);
  const negatives = scan ? negativeSummary(scan, codeHeaders, modal.overLimitCodes !== false) : NONE;
  const zeros = scan ? zeroCount(scan, codeHeaders) : 0;
  const blanks = useMemo(() => (scan ? blankCount(scan, importedHeaders, { long: modal.format === "long" }) : 0), [scan, importedHeaders.join("\u0001"), modal.format]);
  // TASKS.csv #334 — elements already in the project under a different unit get converted on import.
  // #2490 — against the unit the import will actually store (an oxide column's own basis), not the box's raw text
  const unitClashes = modal.elements.filter((e) => e.checked && existingUnits[e.symbol] && existingUnits[e.symbol] !== importStoreUnit(e));
  // TASKS.csv #3197 — per-cent columns whose values run far past 100 (median over 100: ppm under a _pct name), said here, where the unit menu is
  const pctAsPpm = useMemo(() => (modal.format === "wide" ? percentColumnsReadingPpm(modal.allRows || [], modal.elements.filter((e) => e.checked)) : []), [modal.format, modal.allRows, modal.elements]);
  const over100 = useMemo(() => (modal.format === "wide" ? oxidesOver100(modal.allRows || [], modal.elements.filter((e) => e.checked), modal.mapping || {}) : []), [modal.format, modal.allRows, modal.elements, modal.mapping]); // #2490
  // TASKS.csv #210 — manual "add a column the auto-detector missed" control, wide format only (long
  // format's elements come from distinct analyte VALUES in one column, not headers — a different,
  // already-complete picker via the method/analyte dropdowns above).
  const [addSymbol, setAddSymbol] = useState("");
  // TASKS.csv #2765 (split from #2356) — a 60-element suite: a filter over the element list (symbol or column name)
  const [elFilter, setElFilter] = useState("");
  const shownEls = useMemo(() => { const f = elFilter.trim().toLowerCase(); return f ? modal.elements.filter((e) => e.symbol.toLowerCase().includes(f) || String(e.header || "").toLowerCase().includes(f)) : modal.elements; }, [modal.elements, elFilter]);
  const [addHeader, setAddHeader] = useState("");

  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });
  const pts = useMemo(() => (modal.isPxrf ? pointReadings(modal.allRows || [], modal.headers, modal.mapping) : { allPoints: false }), [modal.isPxrf, modal.allRows, modal.headers, modal.mapping]); // #1653
  // TASKS.csv #2350 — numbered repeat candidates of the ticked elements (from the file's values)
  const checkedKey = modal.elements.filter((e) => e.checked).map((e) => `${e.symbol}:${e.header}`).join("|");
  const numbered = useMemo(() => (modal.format === "long" ? [] : numberedRepeatCandidates(modal.headers || [], modal.allRows || [], modal.elements.filter((e) => e.checked))), [modal.format, modal.headers, modal.allRows, checkedKey]);
  const toggleEl = (sym) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, checked: !e.checked } : e) });
  const setUnit = (sym, unit) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, unit, unitChosen: true } : e) }); // unitChosen: #718
  const setUnits = (syms, unit) => onChange({ ...modal, elements: modal.elements.map((e) => syms.includes(e.symbol) ? { ...e, unit, unitChosen: true } : e) }); // #3197
  const setKeepOxide = (sym, keep) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, keepOxide: keep } : e) }); // #2487
  const setAllOxide = (keep) => onChange({ ...modal, elements: modal.elements.map((e) => (oxideOfHeader(e.header) ? { ...e, keepOxide: keep } : e)) }); // #2888 — every oxide column at once
  // TASKS.csv #2487 — the oxide columns and the basis each will be stored in, said before the commit
  const oxideEls = modal.format === "wide" ? modal.elements.filter((e) => e.checked && oxideOfHeader(e.header)) : [];
  const keptOx = oxideEls.filter(keepsOxide).map((e) => oxideOfHeader(e.header).oxide), storedOx = oxideEls.filter((e) => !keepsOxide(e)).map((e) => `${oxideOfHeader(e.header).oxide} → ${e.symbol}`);
  // TASKS.csv #718 — a unit the header did not state, until the user picks one
  const assumedTag = (e) => (!e.unitChosen && unitAssumed(e.header) ? <span title={tr("\"{header}\" does not say its unit, so {unit} was assumed from the element. Check it against the lab certificate.", { header: e.header, unit: e.unit })} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", fontStyle: "italic", flexShrink: 0 }}>{tr("assumed")}</span> : null);
  // TASKS.csv #210 — lets the user repoint an auto-detected (or manually added) element at a
  // DIFFERENT raw column, e.g. when a file has both "Ag_XRF_Corrected_ppm_D" and "Ag_pXRF_ppm" and
  // the auto-picked one isn't the one they want. commitAssayImport already reads `values[e.symbol]`
  // from `r[e.header]`, so changing header here is the entire fix — no other wiring needed.
  const setHeader = (sym, header) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, header } : e) });
  const removeEl = (sym) => onChange({ ...modal, elements: modal.elements.filter((e) => e.symbol !== sym) });
  const addElement = () => {
    const sym = addSymbol.trim();
    if (!sym || !addHeader) return;
    const unit = inferUnit(addHeader, sym);
    onChange({
      ...modal,
      elements: modal.elements.some((e) => e.symbol === sym)
        ? modal.elements.map((e) => e.symbol === sym ? { ...e, header: addHeader, checked: true } : e)
        : [...modal.elements, { symbol: sym, header: addHeader, unit, checked: true }],
    });
    setAddSymbol(""); setAddHeader("");
  };
  const setAll = (checked) => onChange({ ...modal, elements: modal.elements.map((e) => ({ ...e, checked })) });
  const setMethod = (method) => {
    const analytes = Array.from(new Set(modal.allRows.filter((r) => !modal.mapping.method || r[modal.mapping.method] === method).map((r) => r[modal.mapping.analyte]).filter(Boolean)));
    const prev = new Map(modal.elements.map((e) => [e.symbol, e.checked]));
    const elements = analytes.filter(isElementColumn).map((sym) => ({ symbol: sym, header: sym, unit: inferUnit(sym, sym), checked: prev.has(sym) ? prev.get(sym) : true }));
    onChange({ ...modal, selectedMethod: method, elements });
  };

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr(modal.isPxrf ? "Import pXRF: {fileName}" : "Import assays: {fileName}", { fileName: modal.fileName })}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr(modal.elements.length === 1 ? "{v} · 1 element recognized" : "{v} · {elements} elements recognized", { /* #2201 */ v: modal.format === "long" ? tr("Long format (row per analyte)") : tr("Wide format (column per element)"), elements: modal.elements.length })}</div>
            {(() => { const none = modal.format === "long" ? [] : modal.elements.filter((e) => e.n === 0); return none.length ? <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Empty on every row, so left unticked: {list} ({n} columns).", { list: none.map((e) => e.symbol).join(", "), n: none.length })}</div> : null; })()}{/* TASKS.csv #1679 */}
            {labLike?.looksLikeLab && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{tr("This file looks like lab assays ({cols}, and no pXRF instrument or reading columns). Imported here, its results are pXRF screening readings, kept out of grades, intercepts and composites: Import assays is the route for lab results.", { cols: labLike.lab.join(", ") })}</div>}{/* TASKS.csv #2198 */}
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>{tr("Column mapping")}</div>
          {[["hole_id", tr("Hole ID")], ["from", tr("From")], ["to", tr("To")]].map(([key, lbl]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{lbl} <span style={{ color: "var(--color-danger-solid)" }}>*</span></div>
              <select value={modal.mapping[key] || ""} onChange={(e) => setMapping(key, e.target.value)} style={{ ...sel, flex: 1, borderColor: modal.mapping[key] ? "var(--color-border)" : "var(--color-danger-border-strong)" }}>
                <option value="">{tr("— none —")}</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          {/* TASKS.csv #1653 — pXRF points: every From equals its To */}
          {modal.isPxrf && pts.allPoints && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45, marginTop: -2, marginBottom: 10 }}>
              {tr("Every reading has From = To ({n} rows): they are points on core, and import as points (Data QC treats pXRF readings as screening points).", { n: pts.n.toLocaleString() })}
              {pts.candidate && <>{" "}{tr("{col} looks like a To depth for each reading:", { col: pts.candidate })}{" "}<button type="button" onClick={() => setMapping("to", pts.candidate)} style={{ padding: "1px 8px", cursor: "pointer" }}>{tr("Use {col} as To", { col: pts.candidate })}</button></>}
            </div>
          )}
          {/* TASKS.csv #1184 — the columns QAQC runs on, where they can be seen and changed */}
          {modal.qc && (
            <details style={{ marginBottom: 10 }} open={QC_COLUMN_KEYS.some((k) => modal.qc[k])}>
              <summary style={{ cursor: "pointer", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 6 }}>{tr("QC columns (optional)")}</summary>
              {[["sample_id", tr("Sample ID")], ["sample_type", tr("Sample type")], ["parent_id", tr("Parent sample")], ["qc_code", tr("CRM / standard name")], ["certificate", tr("Lab certificate") /* #2764 */]].map(([key, lbl]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{lbl}</div>
                  <select value={modal.qc[key] || ""} aria-label={lbl} onChange={(e) => onChange({ ...modal, qc: { ...modal.qc, [key]: e.target.value } })} style={{ ...sel, flex: 1 }}>
                    <option value="">{tr("— none —")}</option>
                    {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </details>
          )}

          {modal.format === "long" && modal.methods.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 4 }}>{tr("Analytical method / cert")}</div>
              <select value={modal.selectedMethod || ""} onChange={(e) => setMethod(e.target.value)} style={{ ...sel, width: "100%" }}>
                {modal.methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {modal.format === "wide" && <div style={{ marginTop: 12 }}><RowFilterBox modal={modal} onChange={onChange} sel={sel} /></div>}{/* TASKS.csv #2391 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 }}>
            <div style={{ ...label, marginBottom: 0 }}>{tr("Elements ({checkedCount} of {elements})", { checkedCount, elements: modal.elements.length })}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {modal.elements.length > 12 && <input type="search" value={elFilter} onChange={(e) => setElFilter(e.target.value)} placeholder={tr("Filter elements")} aria-label={tr("Filter elements")} style={{ ...sel, width: 130, padding: "3px 6px" }} />}{/* #2765 */}
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAll(true)} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent)", cursor: "pointer" }}>{tr("All")}</span>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAll(false)} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("None")}</span>
            </div>
          </div>
          {/* TASKS.csv #2337 — a gold / platinum / palladium unit read from the values, said where it is seen, not in a tooltip */}
          {modal.elements.filter((e) => e.unitFromValues && !e.unitChosen && e.header === e.mainHeader).map((e) => (
            <div key={`ppb${e.symbol}`} role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "4px 0" }}>{tr("{symbol}: \"{header}\" does not say its unit, and its values (median {median}, up to {max}) read as ppb, not ppm: ppb is chosen. Check it against the lab certificate.", { symbol: e.symbol, header: e.header, median: +e.unitFromValues.median.toFixed(2), max: e.unitFromValues.max.toLocaleString() })}</div>
          ))}
          {/* TASKS.csv #3197 — a per-cent column holding ppm: said while the unit menu is in reach, ppm offered, nothing converted until chosen */}
          {pctAsPpm.length > 0 && (
            <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "4px 0", lineHeight: 1.45 }}>
              {tr("These columns are read in per cent, but their values run far past 100 %, which no weight per cent can: {list}. They look like ppm. Pick the unit for each in the list below, or:", { list: pctAsPpm.map((o) => tr("{header} (median {median} %, up to {max} %)", { header: o.header, median: Math.round(o.median).toLocaleString(), max: Math.round(o.max).toLocaleString() })).join(", ") })}{" "}
              <button type="button" onClick={() => setUnits(pctAsPpm.map((o) => o.symbol), "ppm")} style={{ ...sel, cursor: "pointer", padding: "1px 8px" }}>{pctAsPpm.length > 1 ? tr("Read these {n} as ppm", { n: pctAsPpm.length }) : tr("Read {header} as ppm", { header: pctAsPpm[0].header })}</button>
            </div>
          )}
          {over100.length > 0 && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "4px 0", lineHeight: 1.45 }}>{over100.map((o) => tr("{header} has {n} value(s) over 100 % (impossible as wt%): {hole} {from}-{to} m = {value}. Check those samples; the column stays in per cent.", { header: o.header, n: o.n, hole: o.example.hole ?? "?", from: o.example.from ?? "?", to: o.example.to ?? "?", value: o.example.value })).join(" ")}</div>}{/* TASKS.csv #2490 */}
          {oxideEls.length > 0 && ( /* TASKS.csv #2487 */
            <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "4px 0", lineHeight: 1.45 }}>
              {keptOx.length > 0 && tr("Kept as the oxide: {list}. These grades are read, typed (cut-offs, caps), priced and exported as the oxide; the element is used only where a diagram needs it.", { list: keptOx.join(", ") })}{" "}
              {storedOx.length > 0 && tr("Stored as the element (oxide divided by its factor): {list}. The diagrams convert them back to oxides.", { list: storedOx.join(", ") })}{" "}
              {tr("Change it per column with the as … menu.")}
              {oxideEls.length > 1 && ( /* TASKS.csv #2888 — one control for every oxide column */
                <span style={{ display: "inline-flex", gap: 10, marginLeft: 8 }}>
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAllOxide(true)} style={{ color: storedOx.length ? "var(--color-accent)" : "var(--color-text-muted)", cursor: "pointer" }}>{tr("All as reported (oxides)")}</span>
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAllOxide(false)} style={{ color: keptOx.length ? "var(--color-accent)" : "var(--color-text-muted)", cursor: "pointer" }}>{tr("All as elements")}</span>
                </span>
              )}
            </div>
          )}
          {modal.format === "wide" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {shownEls.map((e) => (
                <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: e.checked ? "var(--color-bg-subtle)" : "transparent", borderRadius: 5 }}>
                  <input type="checkbox" checked={e.checked} onChange={() => toggleEl(e.symbol)} />
                  <span style={{ fontSize: "var(--font-size-base)", color: e.checked ? "var(--color-text)" : "var(--color-text-muted)", width: 28, flexShrink: 0 }}>{e.symbol}</span>
                  {e.n === 0 && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flexShrink: 0 }} title={tr("This column is blank in every row of the file: left unticked so it does not appear in every element list.")}>{tr("no values")}</span>} {/* #1389 */}
                  {/* TASKS.csv #210 — reassign which raw column feeds this element, e.g. when a file has
                      more than one candidate column (Corrected vs. raw vs. Error) and the auto-pick
                      wasn't the one wanted. */}
                  <select value={e.header} onChange={(ev) => setHeader(e.symbol, ev.target.value)} style={{ ...sel, flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }} title={tr("Which column this element's values come from")}>
                    {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {/* TASKS.csv #600 / #542 — the over-limit column that fills capped samples, while the auto-picked column is used */}
                  {e.overLimit && e.header === e.mainHeader && <span title={tr("Samples at {limit} (the cap of this column) take their value from \"{header}\" ({n} values), converted to {unit}", { limit: e.overLimit.limit, header: e.overLimit.header, n: e.overLimit.n, unit: e.unit })} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", flexShrink: 0 }}>{tr("+ over-limit")}</span>}
                  {/* TASKS.csv #2328 — the element's other method columns, joined (default when they hardly overlap) */}
                  {e.methodCols?.length > 0 && e.header === e.mainHeader && <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", flexShrink: 0, cursor: "pointer" }} title={tr("{sym} is also in {k} more method column(s): {list}. Ticked: a sample with no value in \"{header}\" takes the first of them that has one (in that column's own unit). {several} of {any} rows carry two or more.", { sym: e.symbol, k: e.methodCols.length, list: e.methodCols.map((c) => `${c.header} (${c.n.toLocaleString()})`).join(", "), header: e.header, several: (e.methodOverlap?.withSeveral ?? 0).toLocaleString(), any: (e.methodOverlap?.withAny ?? 0).toLocaleString() })}>
                    <input type="checkbox" checked={!!e.join} onChange={() => onChange({ ...modal, elements: modal.elements.map((x) => (x.symbol === e.symbol ? { ...x, join: !x.join } : x)) })} aria-label={tr("Join the method columns of {sym}", { sym: e.symbol })} />{tr("+{k} col.", { k: e.methodCols.length })}
                  </label>}
                  {assumedTag(e)}
                  <select value={e.unit} onChange={(ev) => setUnit(e.symbol, ev.target.value)} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px", flexShrink: 0 }}>
                    <option value="ppm">{tr("ppm")}</option><option value="%">%</option><option value="ppb">{tr("ppb")}</option>
                  </select>
                  {oxideOfHeader(e.header) && ( /* TASKS.csv #2487 — the basis this oxide column is stored in */
                    <select value={keepsOxide(e) ? "oxide" : "element"} onChange={(ev) => setKeepOxide(e.symbol, ev.target.value === "oxide")} aria-label={tr("Basis of {symbol}", { symbol: e.symbol })} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px", flexShrink: 0 }}>
                      <option value="oxide">{tr("as {v}", { v: oxideOfHeader(e.header).oxide })}</option><option value="element">{tr("as {v}", { v: e.symbol })}</option>
                    </select>
                  )}
                  <X role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} onClick={() => removeEl(e.symbol)} title={tr("Remove this element mapping")} aria-label={tr("Remove the {symbol} mapping", { symbol: e.symbol })} />
                </div>
              ))}
              {modal.elements.length === 0 && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: "6px 4px" }}>{tr("No element columns recognized — add one manually below.")}</div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {shownEls.map((e) => (
                <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: e.checked ? "var(--color-bg-subtle)" : "transparent", borderRadius: 5 }}>
                  <input type="checkbox" checked={e.checked} onChange={() => toggleEl(e.symbol)} />
                  <span style={{ fontSize: "var(--font-size-base)", color: e.checked ? "var(--color-text)" : "var(--color-text-muted)", flex: 1 }}>{e.symbol}</span>
                  {assumedTag(e)}
                  <select value={e.unit} onChange={(ev) => setUnit(e.symbol, ev.target.value)} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px" }}>
                    <option value="ppm">{tr("ppm")}</option><option value="%">%</option><option value="ppb">{tr("ppb")}</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* TASKS.csv #210 — a column the auto-detector missed entirely (unusual naming, or simply
              not one of ELEMENT_SYMBOLS's recognized symbols) can still be mapped by hand: pick the
              raw column and the element it actually represents. Re-using an existing symbol here
              repoints that row instead of creating a duplicate. */}
          {modal.format === "wide" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
              <input
                list="geostrix-element-symbols" value={addSymbol} onChange={(ev) => setAddSymbol(ev.target.value)}
                placeholder={tr("Symbol (e.g. Cu)")} style={{ ...sel, width: 100, fontSize: "var(--font-size-sm)" }}
              />
              <datalist id="geostrix-element-symbols">
                {[...ELEMENT_SYMBOLS, ...UNIT_ONLY_SYMBOLS /* #3129 — C, N by hand */].map((s) => <option key={s} value={s} />)}
              </datalist>
              <select value={addHeader} onChange={(ev) => setAddHeader(ev.target.value)} style={{ ...sel, flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }}>
                <option value="">{tr("— pick the source column —")}</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <button
                onClick={addElement}
                disabled={!addSymbol.trim() || !addHeader}
                style={{ ...btn(true), width: "auto", padding: "6px 10px", fontSize: "var(--font-size-sm)", opacity: (addSymbol.trim() && addHeader) ? 1 : 0.5 }}
              >{tr("Add")}</button>
            </div>
          )}
        </div>

        {!scan && (modal.allRows || []).length > 0 && ( /* TASKS.csv #2164 — the values are being checked; the questions below depend on them */
          <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: "0 16px 8px" }}>{tr("Checking the values for negatives, zeros and empty cells… {pct}%", { pct: Math.round(scanPct * 100) })}</div>
        )}
        {(negatives.codes > 0 || negatives.sentinels > 0 || negatives.overAny > 0 || unitClashes.length > 0 || blanks > 0 || zeros > 0) && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 6 }}>
            {negatives.overAny > 0 && ( /* TASKS.csv #1648 */
              <label style={{ display: "flex", gap: 6, alignItems: "flex-start", cursor: "pointer", color: "var(--color-text)" }}>
                <input type="checkbox" checked={modal.overLimitCodes !== false} onChange={(e) => onChange({ ...modal, overLimitCodes: e.target.checked })} style={{ marginTop: 2 }} />
                <span>{tr("Read negative codes at a column's largest value as over the upper limit (-10 means \">10\", stored at the limit and flagged \">\"): {v}.", { v: negatives.overCols.join(", ") })}</span>
              </label>
            )}
            {negatives.codes > 0 && (
              <div>
                <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{codes} negative value(s) no bigger than their column's own values (-0.005; -100 in a column of 100 to 500). Assays can't be negative, so these are codes. What do they mean?", { codes: negatives.codes })}{/* #2336 */}</div>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="negmode" checked={(modal.negativeMode || "bdl") === "bdl"} onChange={() => onChange({ ...modal, negativeMode: "bdl" })} />{tr("Below detection (-0.005 means \"<0.005\"; stored at half and flagged \"<\")")}</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="negmode" checked={modal.negativeMode === "missing"} onChange={() => onChange({ ...modal, negativeMode: "missing" })} />{tr("Not assayed (leave blank)")}</label>
              </div>
            )}
            {zeros > 0 && ( /* TASKS.csv #1677 */
              <div>
                <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{n} zero value(s). In a pXRF file a zero usually means not detected. What do they mean here?", { n: zeros })}</div>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="zeromode" checked={(modal.zeroMode || (modal.isPxrf ? "bdl" : "real")) === "bdl"} onChange={() => onChange({ ...modal, zeroMode: "bdl" })} />{tr("Below detection (stored as \"<\" at half the smallest reading in that column)")}</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="zeromode" checked={(modal.zeroMode || (modal.isPxrf ? "bdl" : "real")) === "real"} onChange={() => onChange({ ...modal, zeroMode: "real" })} />{tr("A real measured zero")}</label>
              </div>
            )}
            {blanks > 0 && (
              <div>
                <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{blanks} empty element cell(s) in rows that have other results. What does an empty cell mean in this file?", { blanks: blanks.toLocaleString() })}</div>
                {modal.blankNote && <div style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>{modal.blankNote}</div>}{/* TASKS.csv #716 */}
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="blankmode" checked={(modal.blankMode || "missing") === "missing"} onChange={() => onChange({ ...modal, blankMode: "missing" })} />{tr("Not assayed — left out of grades (intercepts, composites, statistics) and reported as unsampled metres")}</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="blankmode" checked={modal.blankMode === "bdl"} onChange={() => onChange({ ...modal, blankMode: "bdl" })} />{tr("Below detection — stored as \"<DL\" at half the limit (the lab's most common \"<\" limit in that column, else its lowest value)")}</label>
              </div>
            )}
            {negatives.sentinels > 0 && <div>{tr("{sentinels} value(s) will be treated as not assayed: {list}. They are -99 / -999 / -9999 codes or bigger than anything else in their column, so they are no-data codes, not grades.", { sentinels: negatives.sentinels, list: (negatives.sentinelCols || []).join("; ") })}</div>}{/* #2336 — the codes found, not an example */}
            {unitClashes.length > 0 && <div>{tr("Already in this project in another unit: {v}. These values will be converted to the project's unit so earlier assays keep their meaning.", { v: unitClashes.map((e) => tr("{symbol} (file {unit}, project {projectUnit})", { symbol: e.symbol, unit: importStoreUnit(e), projectUnit: existingUnits[e.symbol] })).join(", ") })}{unitClashes.some((e) => oxideOfHeader(e.header)) && " " + tr("To store an element as its oxide (or as the element) in this project, change its basis in Geochem under Imported files & elements: the assays already in the project are converted with it.")}</div>}{/* the way out: #2888 */}
          </div>
        )}

        {/* TASKS.csv #2194 — the lab repeat columns beside the chosen elements (AuRp1, Au_Dup...), kept as QC duplicates unless unticked */}
        {modal.format !== "long" && (() => { const reps = repeatColumns(modal.headers || [], modal.elements.filter((e) => e.checked)); return reps.length ? (
          <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            <input type="checkbox" checked={modal.keepRepeats !== false} onChange={(e) => onChange({ ...modal, keepRepeats: e.target.checked })} />
            {tr("Keep the lab repeats as QC duplicates ({list})", { list: reps.map((r) => r.header).join(", ") })}
          </label>) : null; })()}
        {/* TASKS.csv #2350 — numbered columns (Au2, Pt2) that agree with the element on the samples they share: offered, never ticked for the user */}
        {modal.format !== "long" && numbered.map((c) => (
          <label key={c.header} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 16px 4px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            <input type="checkbox" checked={(modal.numberedRepeats || []).includes(c.header)} onChange={(e) => onChange({ ...modal, numberedRepeats: e.target.checked ? [...(modal.numberedRepeats || []), c.header] : (modal.numberedRepeats || []).filter((h) => h !== c.header) })} />
            {tr("{header} looks like a repeat of {symbol}: {n} samples have both, median ratio {r}. Keep it as QC duplicates", { header: c.header, symbol: c.symbol, n: c.n.toLocaleString(), r: c.medianRatio.toFixed(2) })}
          </label>))}
        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>{tr("Cancel")}</button>
          {/* TASKS.csv #2183 (review #2174) — 'Import 0 elements' committed 10,422 intervals with no values */}
          {/* TASKS.csv #2037 (review #2013) — a file with no hole / from / to (an IP .dat on the pXRF button) could be 'imported': the button waits for
              them, and the reason is said here, not in the panel behind the dialog */}
          {unmapped.length > 0 && !modal.busy && scan && <div role="note" style={{ alignSelf: "center", flex: 2, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("Map the {cols} column(s) to import.", { cols: unmapped.join(", ") })}</div>}
          {checkedCount === 0 && unmapped.length === 0 && !modal.busy && scan && <div role="note" style={{ alignSelf: "center", flex: 2, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("Tick or add at least one element to import.")}</div>}
          <button onClick={onCommit} disabled={!!modal.busy || !scan || checkedCount === 0 || unmapped.length > 0} /* !scan: #2164; 0 elements: #2183; unmapped: #2037 */ style={{ ...btn(true), flex: 2, opacity: modal.busy || !scan || checkedCount === 0 || unmapped.length > 0 ? 0.6 : 1 }}>{modal.busy ? tr("Importing…") : tr(checkedCount === 1 ? "Import {checkedCount} element" : "Import {checkedCount} elements", { checkedCount })}</button>{/* busy: #583 */}
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(680px, 92vw)", maxHeight: "86vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
