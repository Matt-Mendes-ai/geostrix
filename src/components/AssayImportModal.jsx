import { QC_COLUMN_KEYS } from "../lib/assayQcColumns.js"; // TASKS.csv #1184
import React, { useMemo, useState } from "react";
import { X } from "./icons.js";
import { isElementColumn, inferUnit, ELEMENT_SYMBOLS, parseAssayValue, NO_DATA_SENTINEL_MAX, isBlankAssayCell, unitAssumed } from "../lib/geochem.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786

export default function AssayImportModal({ modal, onChange, onCancel, onCommit, existingUnits = {} }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const checkedCount = modal.elements.filter((e) => e.checked).length;
  // TASKS.csv #333 — count negative numbers in the columns being imported, so the user decides what they
  // mean before they become grades.
  // TASKS.csv #583 — counted per COLUMN once and cached (ticking an element re-sums, it doesn't rescan), with plain
  // loops: the old flatMap built one array of every checked cell (12 x 190,000 = 2.3 M entries) on every tick.
  const negByColumn = useMemo(() => new Map(), [modal.allRows]);
  const negativesOf = (h) => {
    let c = negByColumn.get(h);
    if (!c) {
      c = { codes: 0, sentinels: 0 };
      const rows = modal.allRows;
      for (let i = 0; i < rows.length; i++) { const v = parseAssayValue(rows[i][h]); if (v != null && v < 0) { if (v <= NO_DATA_SENTINEL_MAX) c.sentinels++; else c.codes++; } }
      negByColumn.set(h, c);
    }
    return c;
  };
  const negatives = useMemo(() => {
    const hs = modal.format === "long" ? [modal.mapping.value] : modal.elements.filter((e) => e.checked).map((e) => e.header);
    return hs.reduce((t, h) => { const c = negativesOf(h); return { codes: t.codes + c.codes, sentinels: t.sentinels + c.sentinels }; }, { codes: 0, sentinels: 0 });
  }, [modal.allRows, modal.elements, modal.format, modal.mapping.value]);
  // TASKS.csv #502 — empty element cells (in rows that have at least one result: a row with none had nothing
  // analysed). The user says what they mean for this file; GeochemModule applies it.
  const blanks = useMemo(() => {
    const rows = modal.allRows;
    if (modal.format === "long") { let n = 0; for (let i = 0; i < rows.length; i++) if (isBlankAssayCell(rows[i][modal.mapping.value])) n++; return n; }
    const cols = modal.elements.filter((e) => e.checked).map((e) => e.header);
    let n = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let empty = 0;
      for (let j = 0; j < cols.length; j++) if (isBlankAssayCell(r[cols[j]])) empty++;
      if (empty < cols.length) n += empty;
    }
    return n;
  }, [modal.allRows, modal.elements, modal.format, modal.mapping.value]);
  // TASKS.csv #334 — elements already in the project under a different unit get converted on import.
  const unitClashes = modal.elements.filter((e) => e.checked && existingUnits[e.symbol] && existingUnits[e.symbol] !== e.unit);
  // TASKS.csv #210 — manual "add a column the auto-detector missed" control, wide format only (long
  // format's elements come from distinct analyte VALUES in one column, not headers — a different,
  // already-complete picker via the method/analyte dropdowns above).
  const [addSymbol, setAddSymbol] = useState("");
  const [addHeader, setAddHeader] = useState("");

  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });
  const toggleEl = (sym) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, checked: !e.checked } : e) });
  const setUnit = (sym, unit) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, unit, unitChosen: true } : e) }); // unitChosen: #718
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
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{v} · {elements} elements recognized", { v: modal.format === "long" ? tr("Long format (row per analyte)") : tr("Wide format (column per element)"), elements: modal.elements.length })}</div>
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

          {/* TASKS.csv #1184 — the columns QAQC runs on, where they can be seen and changed */}
          {modal.qc && (
            <details style={{ marginBottom: 10 }} open={QC_COLUMN_KEYS.some((k) => modal.qc[k])}>
              <summary style={{ cursor: "pointer", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 6 }}>{tr("QC columns (optional)")}</summary>
              {[["sample_id", tr("Sample ID")], ["sample_type", tr("Sample type")], ["parent_id", tr("Parent sample")], ["qc_code", tr("CRM / standard name")]].map(([key, lbl]) => (
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

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 }}>
            <div style={{ ...label, marginBottom: 0 }}>{tr("Elements ({checkedCount} of {elements})", { checkedCount, elements: modal.elements.length })}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAll(true)} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent)", cursor: "pointer" }}>{tr("All")}</span>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAll(false)} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("None")}</span>
            </div>
          </div>
          {modal.format === "wide" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {modal.elements.map((e) => (
                <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: e.checked ? "var(--color-bg-subtle)" : "transparent", borderRadius: 5 }}>
                  <input type="checkbox" checked={e.checked} onChange={() => toggleEl(e.symbol)} />
                  <span style={{ fontSize: "var(--font-size-base)", color: e.checked ? "var(--color-text)" : "var(--color-text-muted)", width: 28, flexShrink: 0 }}>{e.symbol}</span>
                  {/* TASKS.csv #210 — reassign which raw column feeds this element, e.g. when a file has
                      more than one candidate column (Corrected vs. raw vs. Error) and the auto-pick
                      wasn't the one wanted. */}
                  <select value={e.header} onChange={(ev) => setHeader(e.symbol, ev.target.value)} style={{ ...sel, flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }} title={tr("Which column this element's values come from")}>
                    {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {/* TASKS.csv #600 / #542 — the over-limit column that fills capped samples, while the auto-picked column is used */}
                  {e.overLimit && e.header === e.mainHeader && <span title={tr("Samples at {limit} (the cap of this column) take their value from \"{header}\" ({n} values), converted to {unit}", { limit: e.overLimit.limit, header: e.overLimit.header, n: e.overLimit.n, unit: e.unit })} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", flexShrink: 0 }}>{tr("+ over-limit")}</span>}
                  {assumedTag(e)}
                  <select value={e.unit} onChange={(ev) => setUnit(e.symbol, ev.target.value)} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px", flexShrink: 0 }}>
                    <option value="ppm">{tr("ppm")}</option><option value="%">%</option><option value="ppb">{tr("ppb")}</option>
                  </select>
                  <X role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} onClick={() => removeEl(e.symbol)} title={tr("Remove this element mapping")} aria-label={tr("Remove the {symbol} mapping", { symbol: e.symbol })} />
                </div>
              ))}
              {modal.elements.length === 0 && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: "6px 4px" }}>{tr("No element columns recognized — add one manually below.")}</div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {modal.elements.map((e) => (
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
                {ELEMENT_SYMBOLS.map((s) => <option key={s} value={s} />)}
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

        {(negatives.codes > 0 || negatives.sentinels > 0 || unitClashes.length > 0 || blanks > 0) && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 6 }}>
            {negatives.codes > 0 && (
              <div>
                <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("{codes} negative value(s) between {NO_DATA_SENTINEL_MAX} and 0. Assays can't be negative, so these are codes. What do they mean?", { codes: negatives.codes, NO_DATA_SENTINEL_MAX })}</div>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="negmode" checked={(modal.negativeMode || "bdl") === "bdl"} onChange={() => onChange({ ...modal, negativeMode: "bdl" })} />{tr("Below detection (-0.005 means \"<0.005\"; stored at half and flagged \"<\")")}</label>
                <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="negmode" checked={modal.negativeMode === "missing"} onChange={() => onChange({ ...modal, negativeMode: "missing" })} />{tr("Not assayed (leave blank)")}</label>
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
            {negatives.sentinels > 0 && <div>{tr("{sentinels} value(s) at or below {NO_DATA_SENTINEL_MAX} (e.g. -9999) will be treated as not assayed: they are no-data codes, not grades.", { sentinels: negatives.sentinels, NO_DATA_SENTINEL_MAX })}</div>}
            {unitClashes.length > 0 && <div>{tr("Already in this project in another unit: {v}. These values will be converted to the project's unit so earlier assays keep their meaning.", { v: unitClashes.map((e) => tr("{symbol} (file {unit}, project {projectUnit})", { symbol: e.symbol, unit: e.unit, projectUnit: existingUnits[e.symbol] })).join(", ") })}</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>{tr("Cancel")}</button>
          <button onClick={onCommit} disabled={!!modal.busy} style={{ ...btn(true), flex: 2, opacity: modal.busy ? 0.6 : 1 }}>{modal.busy ? tr("Importing…") : tr(checkedCount === 1 ? "Import {checkedCount} element" : "Import {checkedCount} elements", { checkedCount })}</button>{/* busy: #583 */}
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
