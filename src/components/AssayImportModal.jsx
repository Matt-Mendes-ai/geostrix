import React, { useState } from "react";
import { X } from "lucide-react";
import { isElementColumn, inferUnit, ELEMENT_SYMBOLS } from "../lib/geochem.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { overlay } from "../lib/modalStyles.js";

export default function AssayImportModal({ modal, onChange, onCancel, onCommit }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  const checkedCount = modal.elements.filter((e) => e.checked).length;
  // TASKS.csv #210 — manual "add a column the auto-detector missed" control, wide format only (long
  // format's elements come from distinct analyte VALUES in one column, not headers — a different,
  // already-complete picker via the method/analyte dropdowns above).
  const [addSymbol, setAddSymbol] = useState("");
  const [addHeader, setAddHeader] = useState("");

  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });
  const toggleEl = (sym) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, checked: !e.checked } : e) });
  const setUnit = (sym, unit) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, unit } : e) });
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
    <div style={overlay} onClick={onCancel}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Import {modal.isPxrf ? "pXRF" : "assays"}: {modal.fileName}</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>{modal.format === "long" ? "Long format (row per analyte)" : "Wide format (column per element)"} · {modal.elements.length} elements recognized</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>Column mapping</div>
          {[["hole_id", "Hole ID"], ["from", "From"], ["to", "To"]].map(([key, lbl]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: 12, color: "#1a2028" }}>{lbl} <span style={{ color: "#c0392b" }}>*</span></div>
              <select value={modal.mapping[key] || ""} onChange={(e) => setMapping(key, e.target.value)} style={{ ...sel, flex: 1, borderColor: modal.mapping[key] ? "#d9dce1" : "#5a2a2a" }}>
                <option value="">— none —</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          {modal.format === "long" && modal.methods.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#1a2028", marginBottom: 4 }}>Analytical method / cert</div>
              <select value={modal.selectedMethod || ""} onChange={(e) => setMethod(e.target.value)} style={{ ...sel, width: "100%" }}>
                {modal.methods.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 }}>
            <div style={{ ...label, marginBottom: 0 }}>Elements ({checkedCount} of {modal.elements.length})</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span onClick={() => setAll(true)} style={{ fontSize: 10.5, color: "#e2a63c", cursor: "pointer" }}>All</span>
              <span onClick={() => setAll(false)} style={{ fontSize: 10.5, color: "#55606e", cursor: "pointer" }}>None</span>
            </div>
          </div>
          {modal.format === "wide" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid #d9dce1", borderRadius: 6 }}>
              {modal.elements.map((e) => (
                <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: e.checked ? "#f4f5f7" : "transparent", borderRadius: 5 }}>
                  <input type="checkbox" checked={e.checked} onChange={() => toggleEl(e.symbol)} />
                  <span style={{ fontSize: 12, color: e.checked ? "#1a2028" : "#94a1b0", width: 28, flexShrink: 0 }}>{e.symbol}</span>
                  {/* TASKS.csv #210 — reassign which raw column feeds this element, e.g. when a file has
                      more than one candidate column (Corrected vs. raw vs. Error) and the auto-pick
                      wasn't the one wanted. */}
                  <select value={e.header} onChange={(ev) => setHeader(e.symbol, ev.target.value)} style={{ ...sel, flex: 1, minWidth: 0, fontSize: 11 }} title="Which column this element's values come from">
                    {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select value={e.unit} onChange={(ev) => setUnit(e.symbol, ev.target.value)} style={{ ...sel, fontSize: 10, padding: "1px 3px", flexShrink: 0 }}>
                    <option value="ppm">ppm</option><option value="%">%</option><option value="ppb">ppb</option>
                  </select>
                  <X size={12} style={{ cursor: "pointer", color: "#8a5555", flexShrink: 0 }} onClick={() => removeEl(e.symbol)} title="Remove this element mapping" />
                </div>
              ))}
              {modal.elements.length === 0 && (
                <div style={{ fontSize: 10.5, color: "#94a1b0", padding: "6px 4px" }}>No element columns recognized — add one manually below.</div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid #d9dce1", borderRadius: 6 }}>
              {modal.elements.map((e) => (
                <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: e.checked ? "#f4f5f7" : "transparent", borderRadius: 5 }}>
                  <input type="checkbox" checked={e.checked} onChange={() => toggleEl(e.symbol)} />
                  <span style={{ fontSize: 12, color: e.checked ? "#1a2028" : "#94a1b0", flex: 1 }}>{e.symbol}</span>
                  <select value={e.unit} onChange={(ev) => setUnit(e.symbol, ev.target.value)} style={{ ...sel, fontSize: 10, padding: "1px 3px" }}>
                    <option value="ppm">ppm</option><option value="%">%</option><option value="ppb">ppb</option>
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
                placeholder="Symbol (e.g. Cu)" style={{ ...sel, width: 100, fontSize: 11 }}
              />
              <datalist id="geostrix-element-symbols">
                {ELEMENT_SYMBOLS.map((s) => <option key={s} value={s} />)}
              </datalist>
              <select value={addHeader} onChange={(ev) => setAddHeader(ev.target.value)} style={{ ...sel, flex: 1, minWidth: 0, fontSize: 11 }}>
                <option value="">— pick the source column —</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <button
                onClick={addElement}
                disabled={!addSymbol.trim() || !addHeader}
                style={{ ...btn(true), width: "auto", padding: "6px 10px", fontSize: 11, opacity: (addSymbol.trim() && addHeader) ? 1 : 0.5 }}
              >Add</button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={onCommit} style={{ ...btn(true), flex: 2 }}>Import {checkedCount} element{checkedCount === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(680px, 92vw)", maxHeight: "86vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
