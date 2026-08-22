import React from "react";
import { X } from "lucide-react";
import { isElementColumn, inferUnit } from "../lib/geochem.js";

export default function AssayImportModal({ modal, onChange, onCancel, onCommit }) {
  const checkedCount = modal.elements.filter((e) => e.checked).length;

  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });
  const toggleEl = (sym) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, checked: !e.checked } : e) });
  const setUnit = (sym, unit) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, unit } : e) });
  const setAll = (checked) => onChange({ ...modal, elements: modal.elements.map((e) => ({ ...e, checked })) });
  const setMethod = (method) => {
    const analytes = Array.from(new Set(modal.allRows.filter((r) => !modal.mapping.method || r[modal.mapping.method] === method).map((r) => r[modal.mapping.analyte]).filter(Boolean)));
    const prev = new Map(modal.elements.map((e) => [e.symbol, e.checked]));
    const elements = analytes.filter(isElementColumn).map((sym) => ({ symbol: sym, header: sym, unit: inferUnit(sym, sym), checked: prev.has(sym) ? prev.get(sym) : true }));
    onChange({ ...modal, selectedMethod: method, elements });
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
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
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={onCommit} style={{ ...btn(true), flex: 2 }}>Import {checkedCount} element{checkedCount === 1 ? "" : "s"}</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(680px, 92vw)", maxHeight: "86vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
