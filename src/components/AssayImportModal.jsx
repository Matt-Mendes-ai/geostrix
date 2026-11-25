import { QC_COLUMN_KEYS } from "../lib/assayQcColumns.js"; // TASKS.csv #1184
import React, { useEffect, useMemo, useState } from "react";
import { X } from "./icons.js";
import { percentColumnsReadingPpm, ppmColumnsReadingPpb } from "../lib/percentAsPpm.js"; // TASKS.csv #3197; ppb: #3294
import { conversionsOver100 } from "../lib/assayReimport.js"; // TASKS.csv #3217
import { isElementColumn, inferUnit, ELEMENT_SYMBOLS, UNIT_ONLY_SYMBOLS, unitAssumed, repeatColumns, numberedRepeatCandidates, oxideOfHeader, keepsOxide, importStoreUnit, oxidesOver100, LOI } from "../lib/geochem.js"; // LOI: #2887; // importStoreUnit, oxidesOver100: #2490 // numberedRepeatCandidates: #2350 // repeatColumns: #2194; oxide basis: #2487
import { scanAssayColumns, negativeSummary, zeroCount, blankCount } from "../lib/assayColumnScan.js"; // TASKS.csv #2164
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { pointReadings } from "../lib/pxrfPoints.js"; // TASKS.csv #1653
import { pxrfSignature } from "../lib/pxrfSignature.js"; // TASKS.csv #2198
import RowFilterBox from "./RowFilterBox.jsx"; // TASKS.csv #2391 — the row filter of the drillhole import (#2330), here too
import DialogHelpCard from "./DialogHelpCard.jsx"; // TASKS.csv #4070 — the dialog's ? card
import { assayTextColumns, assayUsedColumns, chosenExtraColumns } from "../lib/assayExtraFields.js"; // TASKS.csv #3728
import { otherNumericColumns, customAssayEntry, nameAndUnit } from "../lib/assayOtherColumns.js"; // TASKS.csv #3923

const Z_IMPORT = 62; // TASKS.csv #3688 / #4073 — as the column matching's: above the other dialogs (60), below the CRS question (64)

export default function AssayImportModal({ modal, onChange, onCancel, onCommit, onQcLinks = null, existingUnits = {} }) { // onQcLinks: TASKS.csv #3409
  // TASKS.csv #2037 — the columns an interval import cannot do without (a long file also needs its analyte and value columns)
  const unmapped = [["hole_id", tr("Hole ID")], ["from", tr("From")], ["to", tr("To")], ...(modal.format === "long" ? [["analyte", tr("Analyte")], ["value", tr("Value")]] : [])].filter(([k]) => !modal.mapping?.[k]).map(([, label]) => label);
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const labLike = modal.isPxrf ? pxrfSignature(modal.headers || []) : null; // #2198 — a lab file on the pXRF button
  const checkedCount = modal.elements.filter((e) => e.checked).length;
  // TASKS.csv #3728 — the text columns kept with each sample (Zone, Target): offered, the groupable ones ticked
  const extraOffer = useMemo(() => assayTextColumns(modal.headers || [], modal.allRows || [], assayUsedColumns(modal.mapping, modal.qc, modal.elements)), [modal.headers, modal.allRows, modal.mapping, modal.qc, modal.elements]);
  const extraTicked = chosenExtraColumns(modal, extraOffer);
  // TASKS.csv #3923 — the numeric columns that are not chemical elements (AuEq_gpt, TREO_ppm ...): offered as assays of their own, kept as supplied
  const others = useMemo(() => (modal.format === "wide" ? otherNumericColumns(modal.headers || [], modal.allRows || [], assayUsedColumns(modal.mapping, modal.qc, modal.elements)) : []), [modal.format, modal.headers, modal.allRows, modal.mapping, modal.qc, modal.elements]);
  const [showOthers, setShowOthers] = useState(null); // null: open when the file has an equivalent or a total, else closed
  const othersOpen = showOthers ?? others.some((c) => c.kind);
  const takenNames = () => [...ELEMENT_SYMBOLS, ...UNIT_ONLY_SYMBOLS, ...modal.elements.map((e) => e.symbol), ...Object.keys(existingUnits || {})];
  const addOthers = (cols) => { const taken = takenNames(), made = []; for (const c of cols) { const e = customAssayEntry(c, modal.allRows, taken); taken.push(e.symbol); made.push(e); } if (made.length) onChange({ ...modal, elements: [...modal.elements, ...made] }); };
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
  // TASKS.csv #3217 — a conversion that would put readings over 100 %: refused at Import, said here first
  const clashKey = unitClashes.map((e) => `${e.symbol}:${e.header}:${e.unit}`).join("|");
  const clashOver = useMemo(() => (modal.format === "wide" ? conversionsOver100(modal.allRows || [], modal.elements.filter((e) => e.checked && existingUnits[e.symbol] && existingUnits[e.symbol] !== importStoreUnit(e))) : []), [modal.format, modal.allRows, clashKey]); // clashKey stands for the clashes
  const lastTime = modal.elements.filter((e) => e.checked && e.asLastTime); // #3217 — seeded from the project
  // TASKS.csv #3197 — per-cent columns whose values run far past 100 (median over 100: ppm under a _pct name), said here, where the unit menu is
  const pctAsPpm = useMemo(() => (modal.format === "wide" ? percentColumnsReadingPpm(modal.allRows || [], modal.elements.filter((e) => e.checked)) : []), [modal.format, modal.allRows, modal.elements]);
  const ppmAsPpb = useMemo(() => (modal.format === "wide" ? ppmColumnsReadingPpb(modal.allRows || [], modal.elements.filter((e) => e.checked)) : []), [modal.format, modal.allRows, modal.elements]); // #3294
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
  const setUnit = (sym, unit) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, unit, unitChosen: true, asLastTime: e.asLastTime && e.unit === unit } : e) }); // unitChosen: #718; asLastTime: #3217 (a change is the user's, not last time's)
  const setUnits = (syms, unit) => onChange({ ...modal, elements: modal.elements.map((e) => syms.includes(e.symbol) ? { ...e, unit, unitChosen: true, asLastTime: e.asLastTime && e.unit === unit } : e) }); // #3197
  const setCustomUnit = (sym, v) => onChange({ ...modal, elements: modal.elements.map((e) => { if (e.symbol !== sym) return e; const { unitLabel, ...rest } = e; return { ...rest, unit: v === "g/t" ? "ppm" : v, ...(v === "g/t" ? { unitLabel: "g/t" } : {}), unitChosen: true }; }) }); // #3923 — g/t is ppm, kept as typed
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
  const setHeader = (sym, header) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, header, asLastTime: e.asLastTime && e.header === header } : e) }); // asLastTime: #3217
  const removeEl = (sym) => onChange({ ...modal, elements: modal.elements.filter((e) => e.symbol !== sym) });
  const addElement = () => {
    const sym = addSymbol.trim();
    if (!sym || !addHeader) return;
    // TASKS.csv #3923 — a name that is not a chemical element (AuEq, TREO): the unit as the column's name gives it (g/t stays g/t), kept as supplied
    const custom = !ELEMENT_SYMBOLS.includes(sym) && !UNIT_ONLY_SYMBOLS.includes(sym) && !modal.elements.some((e) => e.symbol === sym), nu = custom ? nameAndUnit(addHeader) : null;
    const unit = nu ? nu.unit : inferUnit(addHeader, sym);
    onChange({
      ...modal,
      elements: modal.elements.some((e) => e.symbol === sym)
        ? modal.elements.map((e) => e.symbol === sym ? { ...e, header: addHeader, checked: true } : e)
        : [...modal.elements, { symbol: sym, header: addHeader, unit, checked: true, ...(nu ? { custom: true, asSupplied: true, ...(nu.unitLabel ? { unitLabel: nu.unitLabel } : {}) } : {}) }],
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

  // TASKS.csv #4073 (Matt: "similar for all pop up windows") — three steps: 1 Columns (hole / from / to, QC, extra fields, method, rows), 2 Elements (which ones,
  // their columns and units, and the unit warnings), 3 Values (what negatives, zeros and blanks mean; the lab repeats). Import is the gold primary on every
  // step: Enter accepts the guesses (#3533), as before. What needs a look on another step is said in one line, with the way there
  const busyOrWaiting = !!modal.busy || !scan || checkedCount === 0 || unmapped.length > 0; // !scan: #2164; 0 elements: #2183; unmapped: #2037
  const importLabel = modal.busy ? tr("Importing…") : !scan && (modal.allRows || []).length > 0 ? tr("Checking the values… {pct}%", { pct: Math.round(scanPct * 100) }) /* TASKS.csv #3072 — why it waits, on the button */ : tr(checkedCount === 1 ? "Import {checkedCount} element" : "Import {checkedCount} elements", { checkedCount }); // busy: #583
  const importPrimary = { label: importLabel, onClick: onCommit, disabled: busyOrWaiting, attrs: { "data-autofocus": "", "aria-busy": !scan || !!modal.busy, title: !scan ? tr("The values are being checked for negatives, zeros and empty cells: the questions below depend on them.") : undefined } /* #3533; #3072 */ };
  // TASKS.csv #2037 / #2183 — why Import waits, said under the step (seen)
  const waitHint = !modal.busy && scan ? (unmapped.length > 0 ? tr("Map the {cols} column(s) to import.", { cols: unmapped.join(", ") }) : checkedCount === 0 ? tr("Tick or add at least one element to import.") : "") : "";
  const elementLooks = modal.elements.filter((e) => e.unitFromValues && !e.unitChosen && e.header === e.mainHeader).length + (pctAsPpm.length > 0) + (ppmAsPpb.length > 0) + (over100.length > 0);
  const valueLooks = (negatives.overAny > 0) + (negatives.codes > 0) + (zeros > 0) + (blanks > 0) + (clashOver.length > 0);
  const looksLine = (here) => {
    const where = [[1, elementLooks, tr("Elements")], [2, valueLooks, tr("Values")]].filter(([i, n]) => i !== here && n > 0);
    const n = where.reduce((a, [, k]) => a + k, 0);
    return n > 0 && <div role="status" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "0 0 10px" }}>
      <span style={{ flex: 1 }}>{tr(n === 1 ? "One thing needs a look before you import." : "{n} things need a look before you import.", { n })}</span>
      {where.map(([i, , name]) => <button key={i} type="button" className="gs-btn gs-btn--sm" onClick={() => setAt(i)}>{name}</button>)}</div>;
  };
  const flow = [
    { key: "columns", label: tr("Columns"), primary: importPrimary, hint: waitHint, render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr(modal.elements.length === 1 ? "{v} · 1 element recognized" : "{v} · {elements} elements recognized", { /* #2201 */ v: modal.format === "long" ? tr("Long format (row per analyte)") : tr("Wide format (column per element)"), elements: modal.elements.length })}</div>
        {(() => { const none = modal.format === "long" ? [] : modal.elements.filter((e) => e.n === 0); return none.length ? <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Empty on every row, so left unticked: {list} ({n} columns).", { list: none.map((e) => e.symbol).join(", "), n: none.length })}</div> : null; })()}{/* TASKS.csv #1679 */}
        {labLike?.looksLikeLab && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.4 }}>{tr("Use Import assays for lab results: this file looks like lab assays ({cols}), and here it would be pXRF screening, kept out of grades.", { cols: labLike.lab.join(", ") })}</div>}{/* TASKS.csv #2198 */}
        <div style={{ height: 10 }} />
        {looksLine(0)}
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
              {pts.candidate && <>{" "}{tr("{col} looks like a To depth for each reading:", { col: pts.candidate })}{" "}<button type="button" onClick={() => setMapping("to", pts.candidate)} className="gs-btn gs-btn--sm" style={{ padding: "1px 8px", cursor: "pointer" }}>{tr("Use {col} as To", { col: pts.candidate })}</button></>}
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

          {/* TASKS.csv #3728 — text columns kept with each sample, offered as domains in Grade statistics and Compositing */}
          {extraOffer.length > 0 && (
            <details style={{ marginBottom: 10 }} open>
              <summary style={{ cursor: "pointer", fontSize: "var(--font-size-base)", color: "var(--color-text)", marginBottom: 6 }}>{tr("Extra fields (kept with each sample)")}</summary>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45, marginBottom: 4 }}>{tr("Text columns: a ticked one is kept on each sample and offered as a domain in Grade statistics and Compositing.")}</div>
              {extraOffer.map((c) => (
                <label key={c.col} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 2 }}>
                  <input type="checkbox" checked={extraTicked.includes(c.col)} aria-label={tr("Keep {col} with each sample", { col: c.col })} onChange={() => onChange({ ...modal, extraCols: extraTicked.includes(c.col) ? extraTicked.filter((x) => x !== c.col) : extraOffer.map((o) => o.col).filter((x) => x === c.col || extraTicked.includes(x)) })} />
                  <span>{c.col}</span>
                  <span style={{ color: "var(--color-text-muted)" }}>{c.distinct > 100 ? tr("{n} row(s), more than 100 values", { n: c.n.toLocaleString() }) : tr("{n} row(s), {k} value(s)", { n: c.n.toLocaleString(), k: c.distinct })}</span>
                </label>
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

          {modal.format === "wide" && <div style={{ marginTop: 12 }}><RowFilterBox modal={modal} onChange={onChange} sel={sel} qc={false /* #3207 — QC samples are kept for QAQC */} /></div>}{/* TASKS.csv #2391 */}
      </div>
    ) },
    { key: "elements", label: tr("Elements"), primary: importPrimary, hint: waitHint, render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
        {looksLine(1)}
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
          {lastTime.length > 0 && ( /* TASKS.csv #3217 — the project's own choices for these headers, said */
            <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "4px 0", lineHeight: 1.45 }}>{tr("As last time in this project: {list}. Change any of them in the list below.", { list: lastTime.slice(0, 12).map((e) => `${e.symbol} ${e.header} (${e.unit})`).join(", ") + (lastTime.length > 12 ? ", …" : "") })}</div>
          )}
          {/* TASKS.csv #3197 — a per-cent column holding ppm: said while the unit menu is in reach, ppm offered, nothing converted until chosen */}
          {modal.format === "wide" && modal.elements.some((e) => e.partialOf) && ( /* TASKS.csv #3242 — partial digests kept apart from their element */
            <div role="note" style={{ padding: "6px 16px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
              {tr("{list}: a partial (soluble) digest by the lab code in the header, kept as a measurement of its own, not as another method of the total.", { list: modal.elements.filter((e) => e.partialOf).map((e) => `${e.symbol} (${e.header})`).join(", ") })}
            </div>
          )}
          {ppmAsPpb.length > 0 && ( /* TASKS.csv #3294 — a ppm column holding ppb, against the crust's average */
            <div role="note" style={{ padding: "6px 16px", fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>
              {tr("Pick ppb below if right: these columns read in ppm sit thousands of times above the element's crustal average ({list}). Or:", { list: ppmAsPpb.map((o) => tr("{header} (median {median} ppm; the crust averages about {crust} ppm)", { header: o.header, median: +o.median.toPrecision(3), crust: o.crust })).join("; ") })}{" "}
              <button type="button" onClick={() => setUnits(ppmAsPpb.map((o) => o.symbol), "ppb")} className="gs-btn gs-btn--sm" style={{ cursor: "pointer", padding: "1px 8px" }}>{ppmAsPpb.length > 1 ? tr("Read these {n} as ppb", { n: ppmAsPpb.length }) : tr("Read {header} as ppb", { header: ppmAsPpb[0].header })}</button>
            </div>
          )}
          {pctAsPpm.length > 0 && (
            <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "4px 0", lineHeight: 1.45 }}>
              {tr("Pick ppm below if right: these columns read in per cent run far past 100 % ({list}). Or:", { list: pctAsPpm.map((o) => tr("{header} (median {median} %, up to {max} %)", { header: o.header, median: Math.round(o.median).toLocaleString(), max: Math.round(o.max).toLocaleString() })).join(", ") })}{" "}
              <button type="button" onClick={() => setUnits(pctAsPpm.map((o) => o.symbol), "ppm")} className="gs-btn gs-btn--sm" style={{ cursor: "pointer", padding: "1px 8px" }}>{pctAsPpm.length > 1 ? tr("Read these {n} as ppm", { n: pctAsPpm.length }) : tr("Read {header} as ppm", { header: pctAsPpm[0].header })}</button>
            </div>
          )}
          {over100.length > 0 && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "4px 0", lineHeight: 1.45 }}>{over100.map((o) => tr("{header} has {n} value(s) over 100 % (impossible as wt%): {hole} {from}-{to} m = {value}. Check those samples; the column stays in per cent.", { header: o.header, n: o.n, hole: o.example.hole ?? "?", from: o.example.from ?? "?", to: o.example.to ?? "?", value: o.example.value })).join(" ")}</div>}{/* TASKS.csv #2490 */}
          {oxideEls.length > 0 && ( /* TASKS.csv #2487 */
            <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "4px 0", lineHeight: 1.45 }}>
              {keptOx.length > 0 && tr("Kept as the oxide: {list}. Their grades, cut-offs, caps, prices and exports are the oxide's.", { list: keptOx.join(", ") })}{" "}
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
                  <span style={{ fontSize: "var(--font-size-base)", color: e.checked ? "var(--color-text)" : "var(--color-text-muted)", ...(e.custom ? { minWidth: 28, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { width: 28 }), flexShrink: 0 }} title={e.custom ? e.symbol : undefined}>{e.symbol}</span>
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
                  {e.methodCols?.length > 0 && e.header === e.mainHeader && <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: "var(--font-size-xs)", color: e.methodCols.some((c) => c.rangeClash) ? "var(--color-warn-text)" /* #3213 */ : "var(--color-text-secondary)", flexShrink: 0, cursor: "pointer" }} title={tr("Ticked, a sample with no value in \"{header}\" takes {sym} from the next method column with one ({list}). {several} of {any} rows have two or more.", { sym: e.symbol, k: e.methodCols.length, list: e.methodCols.map((c) => `${c.header} (${c.n.toLocaleString()})`).join(", "), header: e.header, several: (e.methodOverlap?.withSeveral ?? 0).toLocaleString(), any: (e.methodOverlap?.withAny ?? 0).toLocaleString() }) + (e.methodCols.some((c) => c.rangeClash) ? " " + tr("{cols}: values a thousandfold apart from \"{header}\" read in the same unit: one of them is not in the unit its name says. Check before ticking.", { cols: e.methodCols.filter((c) => c.rangeClash).map((c) => c.header).join(", "), header: e.header }) : "") /* #3213 */}>
                    <input type="checkbox" checked={!!e.join} onChange={() => onChange({ ...modal, elements: modal.elements.map((x) => (x.symbol === e.symbol ? { ...x, join: !x.join } : x)) })} aria-label={tr("Join the method columns of {sym}", { sym: e.symbol })} />{tr("+{k} col.", { k: e.methodCols.length })}
                  </label>}
                  {assumedTag(e)}
                  {e.asSupplied && <span title={tr("Kept as the file gives it: the lab's or the company's number, never recalculated here.")} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", flexShrink: 0 }}>{tr("as supplied")}</span>}{/* TASKS.csv #3923 */}
                  <select value={e.unitLabel === "g/t" && e.unit === "ppm" ? "g/t" : e.unit} onChange={(ev) => (e.custom ? setCustomUnit(e.symbol, ev.target.value) : setUnit(e.symbol, ev.target.value))} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px", flexShrink: 0 }}>
                    <option value="ppm">{tr("ppm")}</option><option value="%">%</option><option value="ppb">{tr("ppb")}</option>{e.custom && <option value="g/t">{tr("g/t")}</option>}
                  </select>
                  {oxideOfHeader(e.header) && ( /* TASKS.csv #2487 — the basis this oxide column is stored in */
                    <select value={keepsOxide(e) ? "oxide" : "element"} onChange={(ev) => setKeepOxide(e.symbol, ev.target.value === "oxide")} aria-label={tr("Basis of {symbol}", { symbol: e.symbol })} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px", flexShrink: 0 }}>
                      <option value="oxide">{tr("as {v}", { v: oxideOfHeader(e.header).oxide })}</option><option value="element">{tr("as {v}", { v: e.symbol })}</option>
                    </select>
                  )}
                  <X role="button" tabIndex={0} onKeyDown={activateOnKey} size={12} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} onClick={() => removeEl(e.symbol)} title={tr("Remove this element mapping")} aria-label={tr("Remove the {symbol} mapping", { symbol: e.symbol })} />
                </div>
              ))}
              {modal.elements.length === 0 && (<>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", padding: "6px 4px" }}>{tr("No element columns recognized — add one manually below.")}</div>
                {(modal.qc?.parent_id || modal.qc?.sample_type) && modal.qc?.sample_id && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", padding: "0 4px 6px", lineHeight: 1.45 }}>{tr("Import the check samples' results instead: this table links them to their originals ({cols}) but holds no results.", { cols: [modal.qc.sample_id, modal.qc.parent_id, modal.qc.sample_type].filter(Boolean).join(", ") })}</div>}{/* TASKS.csv #2340 */}
                {onQcLinks && (modal.qc?.parent_id || modal.qc?.sample_type) && modal.qc?.sample_id && <div style={{ padding: "0 4px 8px" }}><button type="button" onClick={onQcLinks} className="gs-btn gs-btn--sm" style={{ padding: "6px 14px" }} title={tr("Matches these sample ids to the project's assays and fills their QC category and parent; assays imported later pair up too.")}>{tr("Import as QC links ({n} rows)", { n: (modal.allRows || []).length.toLocaleString() })}</button></div>}</>
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

          {/* TASKS.csv #3923 — the numeric columns that are not chemical elements: equivalents (AuEq, AgEq), totals (TREO), any measured number */}
          {modal.format === "wide" && others.length > 0 && (
            <div style={{ marginTop: 8, border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px" }}>
              <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setShowOthers(!othersOpen)} style={{ cursor: "pointer", fontSize: "var(--font-size-sm)", color: "var(--color-text)", display: "flex", justifyContent: "space-between", gap: 8 }} aria-expanded={othersOpen}>
                <span>{tr(others.length === 1 ? "Other numeric column in this file: {n}" : "Other numeric columns in this file: {n}", { n: others.length })}</span>
                <span style={{ color: "var(--color-text-muted)" }}>{othersOpen ? tr("hide this list") : tr("show this list")}</span>
              </div>
              {othersOpen && (<>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, margin: "4px 0 6px" }}>{tr("Not chemical elements: add one to import it as its own assay, named as in the file. Equivalents and totals (AuEq, TREO) are kept as supplied, not recalculated.")}{" "}{tr("None is added for you: add the ones that are grades, such as AuEq or TREO, and leave out sample weight or recovery.")}</div>
                {others.some((c) => c.kind) && <button type="button" onClick={() => addOthers(others.filter((c) => c.kind))} className="gs-btn gs-btn--sm" style={{ width: "auto", padding: "4px 10px", fontSize: "var(--font-size-sm)", marginBottom: 6 }}>{tr("Add the equivalents and totals ({n})", { n: others.filter((c) => c.kind).length })}</button>}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
                  {others.map((c) => (
                    <div key={c.header} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)" }}>
                      <span style={{ minWidth: 70, color: "var(--color-text)" }}>{c.name}</span>
                      <span style={{ flex: 1, minWidth: 0, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.header}>{c.header}</span>
                      {c.kind && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-accent-dark)" }}>{c.kind === "equivalent" ? tr("equivalent") : tr("total")}</span>}
                      <span style={{ fontSize: "var(--font-size-xs)", color: c.assumed ? "var(--color-warn-text)" : "var(--color-text-secondary)" }} title={c.assumed ? tr("The column name does not say its unit: ppm is assumed. Set it after adding.") : undefined}>{c.unitLabel || c.unit}{c.assumed ? "?" : ""}</span>
                      <button type="button" onClick={() => addOthers([c])} className="gs-btn" style={{ width: "auto", padding: "2px 8px", fontSize: "var(--font-size-xs)" }} aria-label={tr("Add the column {header} as an assay", { header: c.header })}>{tr("Add")}</button>
                    </div>
                  ))}
                </div>
              </>)}
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
                className="gs-btn gs-btn--sm" style={{ width: "auto", padding: "6px 10px", fontSize: "var(--font-size-sm)", opacity: (addSymbol.trim() && addHeader) ? 1 : 0.5 }}
              >{tr("Add")}</button>
            </div>
          )}
      </div>
    ) },
    { key: "values", label: tr("Values"), primary: importPrimary, hint: waitHint, render: () => (
      <div style={{ flex: 1, minWidth: 0 }}>
        {looksLine(2)}
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
                <div style={{ color: "var(--color-text)", marginBottom: 4 }}>{tr("What do these {codes} negative value(s) mean? Assays can't be negative, so they are codes (-0.005; -100 in a column of 100 to 500).", { codes: negatives.codes })}{/* #2336 */}</div>
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
            {negatives.sentinels > 0 && <div>{tr("{sentinels} value(s) are read as not assayed ({list}): -99 / -999 / -9999 codes, or far above the rest of their column.", { sentinels: negatives.sentinels, list: (negatives.sentinelCols || []).join("; ") })}</div>}{/* #2336 — the codes found, not an example */}
            {unitClashes.length > 0 && <div>{tr("Already in this project in another unit: {v}. These values will be converted to the project's unit so earlier assays keep their meaning.", { v: unitClashes.map((e) => tr("{symbol} (file {unit}, project {projectUnit})", { symbol: e.symbol, unit: importStoreUnit(e), projectUnit: existingUnits[e.symbol] })).join(", ") })}{clashOver.length > 0 && <div style={{ color: "var(--color-danger-text)", marginTop: 4 }}>{tr("Converting {list} would put readings over 100 %: set their unit to the one the column is in, or Import will refuse them.", { list: clashOver.map((b) => `${b.header} (${b.unit})`).join(", ") })}</div>}{/* #3217 */}{unitClashes.some((e) => oxideOfHeader(e.header)) && " " + tr("To store an element as its oxide (or back), change its basis in Geochem > Imported files & elements; the project's assays convert with it.")}</div>}{/* the way out: #2888 */}
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
      </div>
    ) },
  ];
  const heading = tr(modal.isPxrf ? "Import pXRF: {fileName}" : "Import assays: {fileName}", { fileName: modal.fileName });
  return <StepDialog title={heading} onClose={onCancel} steps={flow} at={at} onAt={setAt} width="min(720px, 94vw)" zIndex={Z_IMPORT} /* TASKS.csv #3688 — above Data QC and the other dialogs (all 60) */
    help={<DialogHelpCard page="import-assays" lines={[tr("A blank is not zero: it is left out of grades.")]} />} />;
}

const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
