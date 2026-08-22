import React from "react";
import { X } from "lucide-react";
import { TARGET_SCHEMAS } from "../lib/layers.js";

export default function ImportMappingModal({ modal, onChange, onCancel, onCommit, projectEpsg }) {
  const schema = TARGET_SCHEMAS[modal.target];
  // TASKS.csv #120 — only targets carrying ABSOLUTE world x/y (collars; every other target is
  // hole-relative and inherits its position from the already-reprojected collar) can meaningfully
  // have a different source CRS than the project.
  const hasAbsoluteXY = schema.fields.some((f) => f.key === "x") && schema.fields.some((f) => f.key === "y");
  const setTarget = (target) => {
    const s = TARGET_SCHEMAS[target];
    const mapping = {};
    s.fields.forEach((f) => { mapping[f.key] = ""; });
    onChange({ ...modal, target, mapping });
  };
  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Import {modal.fileName}</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>{modal.rowCount} rows detected · match each field to a column below</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>What kind of data is this?</div>
          <select value={modal.target} onChange={(e) => setTarget(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 16 }}>
            {Object.entries(TARGET_SCHEMAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <div style={label}>Column mapping</div>
          {schema.fields.map((f) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 220, fontSize: 12, color: f.required ? "#1a2028" : "#55606e", flexShrink: 0 }}>
                {f.label}{f.required && <span style={{ color: "#c0392b" }}> *</span>}
              </div>
              <select value={modal.mapping[f.key] || ""} onChange={(e) => setMapping(f.key, e.target.value)} style={{ ...sel, flex: 1, borderColor: f.required && !modal.mapping[f.key] ? "#5a2a2a" : "#d9dce1" }}>
                <option value="">— none —</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          {hasAbsoluteXY && (
            <div style={{ marginTop: 14 }}>
              <div style={label}>Source CRS (EPSG, optional)</div>
              <input
                type="text"
                inputMode="numeric"
                placeholder={`leave blank to assume this file is already EPSG:${projectEpsg ?? "?"} (the project CRS)`}
                value={modal.sourceEpsg || ""}
                onChange={(e) => onChange({ ...modal, sourceEpsg: e.target.value.replace(/[^0-9]/g, "") })}
                style={{ ...sel, width: "100%" }}
              />
              <div style={{ fontSize: 10.5, color: "#94a1b0", marginTop: 4, lineHeight: 1.4 }}>
                If this file's x/y is in a different EPSG than the project (e.g. a claim boundary or
                collar list pulled in a different UTM zone), enter its EPSG code here and it'll be
                reprojected into the project's EPSG:{projectEpsg ?? "?"} on import so it lines up with
                everything else. Recognized codes: WGS84/NAD83/NAD27 geographic, WGS84 &amp; NAD83 UTM
                zones, and NAD83(CSRS) UTM 7N–11N (BC).
              </div>
            </div>
          )}

          {schema.dipConvention && (
            <div style={{ marginTop: 14 }}>
              <div style={label}>Dip sign convention</div>
              <div style={{ display: "flex", gap: 14, fontSize: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" checked={modal.dipConvention === "neg_down"} onChange={() => onChange({ ...modal, dipConvention: "neg_down" })} /> Negative = down (industry standard)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" checked={modal.dipConvention === "pos_down"} onChange={() => onChange({ ...modal, dipConvention: "pos_down" })} /> Positive = down
                </label>
              </div>
            </div>
          )}

          <div style={{ ...label, marginTop: 16 }}>Preview</div>
          {/* User request: highlight the columns currently selected in the mapping above, right in the
              preview table, so it's obvious at a glance which raw CSV columns are actually being used
              (and which are being ignored) before committing the import. Maps column name -> the
              field label(s) it's mapped to (a column CAN legitimately be picked for more than one
              field, e.g. reusing a "depth" column for both from/to on a point-style schema) so the
              header caption always reflects every mapping, not just the first one found. */}
          {(() => {
            const colToFields = {};
            schema.fields.forEach((f) => {
              const col = modal.mapping[f.key];
              if (!col) return;
              (colToFields[col] = colToFields[col] || []).push(f.label);
            });
            return (
              <div style={{ overflowX: "auto", border: "1px solid #d9dce1", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {modal.headers.map((h) => {
                        const mapped = colToFields[h];
                        return (
                          <th key={h} style={mapped ? thMapped : th}>
                            {h}
                            {mapped && <div style={mappedCaption}>{mapped.join(" + ")}</div>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {modal.sampleRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eef1f5" }}>
                        {modal.headers.map((h) => <td key={h} style={colToFields[h] ? tdMapped : td}>{String(r[h] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={onCommit} style={{ ...btn(true), flex: 2 }}>Import {modal.rowCount} rows</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(640px, 92vw)", maxHeight: "86vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const label = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0", marginBottom: 8 };
const sel = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, borderBottom: "1px solid #d9dce1" };
const td = { padding: "5px 8px", color: "#2a3340", whiteSpace: "nowrap" };
const thMapped = { ...th, color: "#8a6a1f", fontWeight: 600, background: "#fbf1d9", borderBottom: "2px solid #e2a63c" };
const tdMapped = { ...td, background: "#fdf7ea" };
const mappedCaption = { fontSize: 9, fontWeight: 400, color: "#a9873f", textTransform: "none", letterSpacing: 0, marginTop: 1 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
