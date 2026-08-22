import React, { useState } from "react";
import { X, Eye, EyeOff, Trash2 } from "lucide-react";
import { distinctValues } from "../lib/layers.js";

export default function LayerInspector({ layerKey, rows, meta, categoryFilter, numericRange, legendOverride, onToggleCategory, onSetRange, onSetColor, onSetLabel, onClose, onShowAll, onHideAll, onIsolate, onRemoveSource }) {
  const [search, setSearch] = useState("");
  const categories = meta.numeric ? [] : distinctValues(rows);
  const searched = search ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) : rows;
  // TASKS.csv #63 — which source file(s) fed this layer, so a layer built from several CSVs (e.g.
  // litho.csv for one property plus another for a second) can have just one of them pulled back out
  // without clearing the whole layer. Older rows imported before _src was tracked show as "unlabeled".
  const sources = (() => {
    const counts = new Map();
    rows.forEach((r) => { const s = r._src || "(unlabeled — imported before this was tracked)"; counts.set(s, (counts.get(s) || 0) + 1); });
    return Array.from(counts.entries());
  })();

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>{meta.label} <span style={{ color: "#94a1b0", fontSize: 12, fontWeight: 400 }}>({rows.length} rows)</span></div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ width: 280, borderRight: "1px solid #d9dce1", padding: 14, overflowY: "auto" }}>
            <div style={label}>{meta.numeric ? "Range filter" : "Legend & filter"}</div>
            {meta.numeric ? (
              numericRange && (
                <div style={{ fontSize: 12, color: "#1a2028" }}>
                  <div style={{ marginBottom: 8, color: "#55606e", fontSize: 11 }}>Only render rows with value in range:</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" value={numericRange.min} onChange={(e) => onSetRange({ ...numericRange, min: Number(e.target.value) })} style={numInp} />
                    <span style={{ color: "#94a1b0" }}>–</span>
                    <input type="number" value={numericRange.max} onChange={(e) => onSetRange({ ...numericRange, max: Number(e.target.value) })} style={numInp} />
                  </div>
                </div>
              )
            ) : (
              <>
                {/* Bulk show/hide (TASKS.csv #63) — the per-row eye icons already let you toggle one
                    category at a time, but "hide everything, then turn on just one" was tedious with
                    many categories (e.g. a dozen lithology codes). "Only" on each row does that in one
                    click; Show all/Hide all handle the common "reset" cases. */}
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <button onClick={onShowAll} style={miniBtn}>Show all</button>
                  <button onClick={onHideAll} style={miniBtn}>Hide all</button>
                </div>
                {categories.map(([value, count]) => {
                  const hidden = categoryFilter.has(value);
                  const ov = legendOverride[value] || {};
                  const color = ov.color || meta.colorFn(value);
                  const lbl = ov.label || (meta.nameFn ? meta.nameFn(value) : value);
                  return (
                    <div key={value} style={{ marginBottom: 8, opacity: hidden ? 0.4 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div onClick={() => onToggleCategory(value)} style={{ cursor: "pointer", color: hidden ? "#9aa5b3" : "#e2a63c", flexShrink: 0 }}>{hidden ? <EyeOff size={13} /> : <Eye size={13} />}</div>
                        <input type="color" value={toHex(color)} onChange={(e) => onSetColor(value, e.target.value)} style={{ width: 20, height: 20, padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0 }} />
                        <input value={lbl} onChange={(e) => onSetLabel(value, e.target.value)} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderBottom: "1px solid #d9dce1", color: "#1a2028", fontSize: 11.5, padding: "2px 0", fontFamily: "inherit" }} />
                        <span style={{ fontSize: 9.5, color: "#94a1b0", flexShrink: 0 }}>{count}</span>
                        <span onClick={() => onIsolate(value)} style={{ fontSize: 9.5, color: "#6a9fd8", cursor: "pointer", flexShrink: 0, textDecoration: "underline" }}>only</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {sources.length > 1 && (
              <>
                <div style={{ ...label, marginTop: 16 }}>Sources ({sources.length} files)</div>
                {sources.map(([src, count]) => (
                  <div key={src} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 11 }}>
                    <div style={{ flex: 1, minWidth: 0, color: "#55606e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={src}>{src}</div>
                    <span style={{ color: "#94a1b0", flexShrink: 0 }}>{count}</span>
                    <Trash2 size={11} style={{ cursor: "pointer", color: "#55606e", flexShrink: 0 }} onClick={() => { if (window.confirm(`Remove the ${count} row(s) from "${src}"?`)) onRemoveSource(src); }} />
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #d9dce1" }}>
              <input placeholder="Search rows…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 10px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" }} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead><tr style={{ position: "sticky", top: 0, background: "#ffffff" }}><th style={th}>from/depth</th><th style={th}>to</th><th style={th}>value</th><th style={th}>extra</th></tr></thead>
                <tbody>
                  {searched.slice(0, 400).map((r, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #eef1f5", opacity: !meta.numeric && categoryFilter.has(String(r.value)) ? 0.35 : 1 }}>
                      <td style={td}>{(r.from ?? r.depth)?.toFixed?.(2) ?? r.from ?? r.depth}</td>
                      <td style={td}>{r.to != null ? r.to.toFixed(2) : "—"}</td>
                      <td style={td}>{String(r.value)}</td>
                      <td style={td}>{r.extra != null ? r.extra : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {searched.length > 400 && <div style={{ padding: "8px 0", color: "#94a1b0", fontSize: 11 }}>Showing first 400 of {searched.length} matching rows.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toHex(c) {
  if (c.startsWith("#")) return c;
  const m = c.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return "#" + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, "0")).join("");
  try { const d = document.createElement("div"); d.style.color = c; document.body.appendChild(d); const rgb = getComputedStyle(d).color; document.body.removeChild(d); const mm = rgb.match(/\d+/g); return "#" + mm.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join(""); } catch (_) { return "#888888"; }
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.7)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(820px, 92vw)", maxHeight: "84vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, borderBottom: "1px solid #d9dce1", position: "sticky", top: 0, background: "#ffffff" };
const td = { padding: "5px 8px", color: "#2a3340" };
const numInp = { width: 70, background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 5, padding: "5px 6px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const miniBtn = { flex: 1, padding: "5px 0", borderRadius: 5, fontSize: 10.5, cursor: "pointer", border: "1px solid #c7ccd3", background: "#f4f5f7", color: "#55606e", fontFamily: "inherit" };
