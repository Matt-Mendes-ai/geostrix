import React, { useState } from "react";
import { X } from "lucide-react";
import { TARGET_SCHEMAS } from "../lib/layers.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #299 — proj4js applies no real NAD27->NAD83 datum shift, so any of these codes silently
// lands data ~100m off in BC. 4267 = NAD27 geographic, 26701-26722 = NAD27 UTM zones 1N-22N.
function isNad27Epsg(v) {
  const n = Number(v);
  return n === 4267 || (n >= 26701 && n <= 26722);
}

export default function ImportMappingModal({ modal, onChange, onCancel, onCommit, projectEpsg }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const schema = TARGET_SCHEMAS[modal.target];
  // TASKS.csv #208 — generic "add a custom field" control, usable for any target/schema, not just
  // litho's new built-in Description field: map an arbitrary source column into an arbitrarily-named
  // field carried through on every imported row (see applyCustomFields in ViewerModule.jsx).
  const customFields = modal.customFields || [];
  const [addName, setAddName] = useState("");
  const [addColumn, setAddColumn] = useState("");
  // TASKS.csv #213 — user request: "other software will let the user assign a data type to the added
  // column eg. text, number, category, etc." Type controls how applyCustomFields (ViewerModule.jsx)
  // coerces the raw CSV value: "number" parses it so the field is filterable/sortable like a real
  // numeric layer field rather than a display-only string, "category" trims it to a clean string
  // (for a coded value that should match consistently), "text" keeps it exactly as Papa Parse read it
  // (the original, pre-#213 behavior — the default for any field added without picking a type).
  const [addType, setAddType] = useState("text");
  const addCustomField = () => {
    const name = addName.trim();
    if (!name || !addColumn) return;
    onChange({ ...modal, customFields: [...customFields, { column: addColumn, name, type: addType }] });
    setAddName(""); setAddColumn(""); setAddType("text");
  };
  const removeCustomField = (i) => onChange({ ...modal, customFields: customFields.filter((_, j) => j !== i) });
  const setCustomFieldType = (i, type) => onChange({ ...modal, customFields: customFields.map((cf, j) => (j === i ? { ...cf, type } : cf)) });
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
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Import {modal.fileName}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{modal.rowCount} rows detected · match each field to a column below</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>What kind of data is this?</div>
          <select value={modal.target} onChange={(e) => setTarget(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 16 }}>
            {Object.entries(TARGET_SCHEMAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <div style={label}>Column mapping</div>
          {schema.fields.map((f) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 220, fontSize: "var(--font-size-base)", color: f.required ? "var(--color-text)" : "var(--color-text-secondary)", flexShrink: 0 }}>
                {f.label}{f.required && <span style={{ color: "var(--color-danger-solid)" }}> *</span>}
              </div>
              <select value={modal.mapping[f.key] || ""} onChange={(e) => setMapping(f.key, e.target.value)} style={{ ...sel, flex: 1, borderColor: f.required && !modal.mapping[f.key] ? "var(--color-danger-border-strong)" : "var(--color-border)" }}>
                <option value="">— none —</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}

          {/* TASKS.csv #208 — "make it possible to add extra fields whenever importing csv or
              vectors" — a generic escape hatch for source columns that don't correspond to any of
              this schema's built-in fields (comments, sample IDs, lab batch numbers, whatever the
              source actually carries). Carried straight through to the attribute table (which
              already derives its columns from whatever keys a row has) and, for interval layers, the
              hover tooltip shows one named "description" specifically — see ViewerModule.jsx. */}
          <div style={{ marginTop: 4, marginBottom: 14 }}>
            <div style={label}>Extra fields (optional)</div>
            {customFields.map((cf, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{cf.column} <span style={{ color: "var(--color-text-muted)" }}>→</span> {cf.name}</div>
                <select value={cf.type || "text"} onChange={(e) => setCustomFieldType(i, e.target.value)} style={{ ...sel, fontSize: "var(--font-size-sm)", padding: "2px 4px", flexShrink: 0 }} title="How this field's value is stored">
                  <option value="text">text</option>
                  <option value="number">number</option>
                  <option value="category">category</option>
                </select>
                <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} onClick={() => removeCustomField(i)} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <select value={addColumn} onChange={(e) => setAddColumn(e.target.value)} style={{ ...sel, flex: 1, minWidth: 0 }}>
                <option value="">— pick a column —</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <input
                type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                placeholder="Field name" style={{ ...sel, width: 130 }}
              />
              <select value={addType} onChange={(e) => setAddType(e.target.value)} style={{ ...sel, width: 82, fontSize: "var(--font-size-sm)" }} title="Data type">
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="category">category</option>
              </select>
              <button
                onClick={addCustomField}
                disabled={!addColumn || !addName.trim()}
                style={{ ...btn(true), width: "auto", padding: "6px 10px", fontSize: "var(--font-size-base)", opacity: (addColumn && addName.trim()) ? 1 : 0.5 }}
              >Add</button>
            </div>
          </div>

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
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                If this file's x/y is in a different EPSG than the project (e.g. a claim boundary or
                collar list pulled in a different UTM zone), enter its EPSG code here and it'll be
                reprojected into the project's EPSG:{projectEpsg ?? "?"} on import so it lines up with
                everything else. Recognized codes: WGS84/NAD83/NAD27 geographic, WGS84 &amp; NAD83 UTM
                zones, and NAD83(CSRS) UTM 7N–11N (BC).
              </div>
              {isNad27Epsg(modal.sourceEpsg) && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "#e0a030", marginTop: 6, lineHeight: 1.4 }}>
                  ⚠ NAD27 (TASKS.csv #299): an <em>approximate</em> NAD27→NAD83 datum shift is applied
                  (EPSG:1179, a published 3-parameter fit for Alberta/BC — typically within ~10&nbsp;m).
                  This is not survey-grade: the exact shift varies from place to place and needs a
                  grid-based (NTv2) transform, which GeoStrix doesn't ship yet. Fine for siting old
                  assessment-report or claim-map coordinates in context; don't survey off it.
                </div>
              )}

              {/* TASKS.csv #205 — a merged/regional dataset can have DIFFERENT rows in different
                  EPSGs (e.g. one collar list spanning two UTM zones), which the single Source CRS
                  field above can't express. If a likely per-row CRS column exists in the source
                  data, offer mapping it here — each row is then reprojected from its OWN EPSG,
                  falling back to the Source CRS field above for rows with a missing/unrecognized
                  value. */}
              <div style={{ marginTop: 10 }}>
                <div style={label}>Per-row Source CRS column (optional)</div>
                <select
                  value={modal.perRowEpsgCol || ""}
                  onChange={(e) => onChange({ ...modal, perRowEpsgCol: e.target.value })}
                  style={{ ...sel, width: "100%" }}
                >
                  <option value="">— none, use one Source CRS for the whole file —</option>
                  {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>
                  If this dataset's own column already tags each row with its EPSG (e.g. a merged
                  regional database export with rows in more than one UTM zone), map it here instead —
                  each row is reprojected from its own value in that column. Rows with a blank or
                  unrecognized value fall back to the Source CRS field above.
                </div>
              </div>
            </div>
          )}

          {schema.dipConvention && (
            <div style={{ marginTop: 14 }}>
              <div style={label}>Dip sign convention</div>
              <div style={{ display: "flex", gap: 14, fontSize: "var(--font-size-base)" }}>
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
            customFields.forEach((cf) => { (colToFields[cf.column] = colToFields[cf.column] || []).push(cf.name); });
            return (
              <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
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
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-hover-bg)" }}>
                        {modal.headers.map((h) => <td key={h} style={colToFields[h] ? tdMapped : td}>{String(r[h] ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>

        {/* TASKS.csv #248 — found by a pre-release review: this button stayed clickable with a required
            field left unmapped, only failing after the click via a toast — not a data-safety issue
            (onCommit already validates and refuses cleanly), just avoidable friction. The per-row "*"/
            red-border cues above already exist; this just stops the click from being possible at all. */}
        {(() => {
          const missingRequired = schema.fields.filter((f) => f.required && !modal.mapping[f.key]);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
              {missingRequired.length > 0 && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-icon)" }}>
                  Map the required field{missingRequired.length === 1 ? "" : "s"} above: {missingRequired.map((f) => f.label).join(", ")}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>Cancel</button>
                <button
                  onClick={onCommit}
                  disabled={missingRequired.length > 0}
                  style={{ ...btn(true), flex: 2, opacity: missingRequired.length > 0 ? 0.5 : 1, cursor: missingRequired.length > 0 ? "not-allowed" : "pointer" }}
                >
                  Import {modal.rowCount} rows
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

const panel = { width: "min(640px, 92vw)", maxHeight: "86vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const label = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)", marginBottom: 8 };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const th = { textAlign: "left", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)" };
const td = { padding: "5px 8px", color: "var(--color-text-strong)", whiteSpace: "nowrap" };
const thMapped = { ...th, color: "var(--color-accent-dark)", fontWeight: 600, background: "#fbf1d9", borderBottom: "2px solid var(--color-accent)" };
const tdMapped = { ...td, background: "#fdf7ea" };
const mappedCaption = { fontSize: "var(--font-size-xs)", fontWeight: 400, color: "#a9873f", textTransform: "none", letterSpacing: 0, marginTop: 1 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
