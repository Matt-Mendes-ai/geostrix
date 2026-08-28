import React, { useMemo, useState, useEffect } from "react";
import { X, Trash2, Save, Sigma } from "lucide-react";
import { useVirtualRows } from "../lib/useVirtualRows.js";

// TASKS.csv #222 (QGIS-specialist audit finding: 652ms open + 702ms per-keystroke search block on a
// 200-hole/8000-interval project, hard 500-row cap with no paging) — two separate fixes. (1) row
// windowing via useVirtualRows.js, same as DataQCModal.jsx, so the hard 500-row cap can go away
// entirely — every matching row is still editable, just not all rendered as DOM at once. (2) the search
// filter recomputed (JSON.stringify over every row) on every single keystroke; now debounced so typing
// doesn't re-filter/re-render until the user pauses briefly.
const ATTR_ROW_H = 30;
const SEARCH_DEBOUNCE_MS = 150;

// TASKS.csv #116 — QGIS-style field calculator. Expressions are restricted to a safe character set
// (letters/digits/operators/parens/dots/commas/underscore/whitespace only) before ever reaching
// `Function(...)`, so there's no way to smuggle in `;`, backticks, `=`, template literals, or anything
// else that isn't a plain arithmetic expression — this runs entirely on the user's own local project
// data, but it's still worth not handing arbitrary code execution to a text box. Existing column names
// become numeric variables (unparseable/missing values pass through as 0 so a formula referencing a
// partially-populated column doesn't just throw for every row); a handful of Math functions are exposed
// under short names since that's what people expect from Au+Ag*0.01-style geochem formulas.
const CALC_SAFE_RE = /^[a-zA-Z0-9_+\-*/%().,\s]*$/;
const CALC_SCOPE_FNS = { abs: Math.abs, sqrt: Math.sqrt, min: Math.min, max: Math.max, round: Math.round, floor: Math.floor, ceil: Math.ceil, pow: Math.pow, log: Math.log, log10: Math.log10 };
function evalFieldCalc(expr, row, columns) {
  if (!CALC_SAFE_RE.test(expr)) throw new Error("Only numbers, column names, and + - * / % ( ) . , are allowed.");
  // The character-class check above still lets "anyGlobalFn(...)" through — letters+parens are needed
  // for legit calls like sqrt(2), but that same shape matches alert(1), fetch(...), etc. `new Function`
  // resolves any identifier it doesn't bind as a parameter from the surrounding global scope, so an
  // unrecognized name would silently reach whatever global happens to have that name. Close that off by
  // walking every identifier token in the expression and rejecting the whole thing unless every one of
  // them is either a real column or one of the whitelisted Math functions above.
  const allowedNames = new Set([...columns, ...Object.keys(CALC_SCOPE_FNS)]);
  const idents = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const unknown = idents.find((id) => !allowedNames.has(id));
  if (unknown) throw new Error(`Unknown name "${unknown}" — must be a column (${columns.join(", ") || "none"}) or a listed function.`);
  const scopeKeys = [...columns, ...Object.keys(CALC_SCOPE_FNS)];
  const scopeVals = [
    ...columns.map((c) => { const v = Number(row[c]); return Number.isFinite(v) ? v : 0; }),
    ...Object.values(CALC_SCOPE_FNS),
  ];
  // eslint-disable-next-line no-new-func
  const fn = new Function(...scopeKeys, `return (${expr});`);
  return fn(...scopeVals);
}

// User request: "We need options to right click on the vector layers, including collar and survey,
// and do a few things: ... inspect the table and be able to edit attributes in that table." A generic
// spreadsheet-style grid over whatever rows a layer/collars/survey array actually has — columns are
// derived from the union of keys across all rows (so it works unmodified for collars' {hole_id,x,y,z,
// azimuth,dip,length}, survey's {hole_id,depth,azimuth,dip}, and every interval layer's {hole_id,from,
// to,value,extra}), rather than a hardcoded column set per data kind like the existing LayerInspector
// (which is a category-legend/filter tool, not a raw editable grid — this is a different, complementary
// tool). Internal-only bookkeeping fields (starting with "_", e.g. "_src") are hidden from the grid —
// editing them would be meaningless/dangerous, but they're preserved unmodified on save.
export default function AttributeTableModal({ title, rows, onSave, onClose }) {
  const [working, setWorking] = useState(() => rows.map((r) => ({ ...r })));
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcField, setCalcField] = useState("");
  const [calcExpr, setCalcExpr] = useState("");
  const [calcError, setCalcError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const columns = useMemo(() => {
    const set = new Set();
    working.forEach((r) => Object.keys(r).forEach((k) => { if (!k.startsWith("_")) set.add(k); }));
    return Array.from(set);
  }, [working]);

  const filtered = useMemo(() => {
    if (!searchDebounced) return working.map((r, i) => [r, i]);
    const q = searchDebounced.toLowerCase();
    return working.map((r, i) => [r, i]).filter(([r]) => JSON.stringify(r).toLowerCase().includes(q));
  }, [working, searchDebounced]);
  const { scrollRef, onScroll, startIndex, endIndex, topPad, bottomPad } = useVirtualRows(filtered.length, ATTR_ROW_H);

  const setCell = (rowIdx, col, value) => {
    setWorking((prev) => {
      const next = prev.slice();
      const orig = next[rowIdx][col];
      // Preserve numeric-ness: if the original value was a number, keep the field numeric (empty ->
      // null, otherwise parse) so a hand-edited coordinate/grade doesn't silently become a string and
      // break downstream numeric logic (color ramps, from/to sorting, etc.).
      let v = value;
      if (typeof orig === "number" || (orig == null && !isNaN(Number(value)) && value !== "")) {
        v = value === "" ? null : Number(value);
        if (Number.isNaN(v)) v = value; // let an unparseable edit through as-is rather than silently dropping it
      }
      next[rowIdx] = { ...next[rowIdx], [col]: v };
      return next;
    });
    setDirty(true);
  };
  const deleteRow = (rowIdx) => {
    setWorking((prev) => prev.filter((_, i) => i !== rowIdx));
    setDirty(true);
  };
  const save = () => { onSave(working); setDirty(false); };

  const runCalc = () => {
    const field = calcField.trim();
    if (!field) { setCalcError("Field name is required."); return; }
    if (field.startsWith("_")) { setCalcError('Field names starting with "_" are reserved.'); return; }
    if (!calcExpr.trim()) { setCalcError("Expression is required."); return; }
    try {
      const next = working.map((r) => ({ ...r, [field]: evalFieldCalc(calcExpr, r, columns) }));
      // one throwaway evaluation up front (via the map above, which already ran it for every row) is
      // enough to surface a bad expression — if evalFieldCalc throws, we never reach setWorking below
      // and the table stays exactly as it was.
      setWorking(next);
      setDirty(true);
      setCalcError("");
    } catch (e) {
      setCalcError(e.message || "Invalid expression.");
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>{title} <span style={{ color: "#94a1b0", fontSize: 12, fontWeight: 400 }}>({working.length} rows)</span></div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #d9dce1", display: "flex", gap: 8, alignItems: "center" }}>
          <input placeholder="Search rows…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 10px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" }} />
          <button onClick={() => setCalcOpen((v) => !v)} style={{ ...saveBtn, background: calcOpen ? "#eaf1fa" : "transparent", borderColor: calcOpen ? "#a9c6e0" : "#c7ccd3", color: calcOpen ? "#1a2028" : "#55606e" }}><Sigma size={13} /> Field calculator</button>
          <button onClick={save} disabled={!dirty} style={{ ...saveBtn, opacity: dirty ? 1 : 0.5, cursor: dirty ? "pointer" : "default" }}><Save size={13} /> {dirty ? "Save changes" : "Saved"}</button>
        </div>
        {calcOpen && (
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #d9dce1", background: "#f9fafb", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                placeholder="New/target field name (e.g. Au_eq)"
                value={calcField}
                onChange={(e) => setCalcField(e.target.value)}
                style={{ width: 200, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 9px", color: "#1a2028", fontSize: 11.5, fontFamily: "inherit" }}
              />
              <span style={{ color: "#94a1b0", fontSize: 12 }}>=</span>
              <input
                placeholder="Expression, e.g. Au + Cu * 1.5  (columns are numeric variables)"
                value={calcExpr}
                onChange={(e) => setCalcExpr(e.target.value)}
                style={{ flex: 1, minWidth: 260, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 9px", color: "#1a2028", fontSize: 11.5, fontFamily: "inherit" }}
              />
              <button onClick={runCalc} style={{ ...saveBtn, padding: "6px 12px" }}>Apply to {working.length} rows</button>
            </div>
            <div style={{ fontSize: 10.5, color: "#94a1b0" }}>
              Columns available as variables: {columns.join(", ") || "—"}. Functions: abs, sqrt, min, max, round, floor, ceil, pow, log, log10. Missing/non-numeric values are treated as 0.
            </div>
            {calcError && <div style={{ fontSize: 11, color: "#a95555" }}>{calcError}</div>}
          </div>
        )}
        <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflow: "auto", padding: "0 14px 14px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "#ffffff" }}>
                {columns.map((c) => <th key={c} style={th}>{c}</th>)}
                <th style={{ ...th, width: 30 }} />
              </tr>
            </thead>
            <tbody>
              {topPad > 0 && <tr style={{ height: topPad }}><td colSpan={columns.length + 1} style={{ padding: 0, border: "none" }} /></tr>}
              {filtered.slice(startIndex, endIndex).map(([r, rowIdx]) => (
                <tr key={rowIdx} style={{ borderBottom: "1px solid #eef1f5", height: ATTR_ROW_H, boxSizing: "border-box" }}>
                  {columns.map((c) => (
                    <td key={c} style={td}>
                      <input
                        className="ge-attr-cell"
                        value={r[c] ?? ""}
                        onChange={(e) => setCell(rowIdx, c, e.target.value)}
                        style={cellInput}
                      />
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: "center" }}>
                    <Trash2 size={12} style={{ cursor: "pointer", color: "#a95555" }} onClick={() => deleteRow(rowIdx)} />
                  </td>
                </tr>
              ))}
              {bottomPad > 0 && <tr style={{ height: bottomPad }}><td colSpan={columns.length + 1} style={{ padding: 0, border: "none" }} /></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.7)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(1000px, 94vw)", height: "min(680px, 88vh)", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, borderBottom: "1px solid #d9dce1", position: "sticky", top: 0, background: "#ffffff", whiteSpace: "nowrap" };
const td = { padding: "2px 4px", color: "#2a3340" };
const cellInput = { width: "100%", minWidth: 60, background: "transparent", border: "1px solid transparent", borderRadius: 3, padding: "4px 5px", color: "#1a2028", fontSize: 11.5, fontFamily: "inherit" };
const saveBtn = { display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 6, border: "1px solid #3d6b52", background: "#1e3629", color: "#8fd9ab", fontSize: 12, whiteSpace: "nowrap" };
