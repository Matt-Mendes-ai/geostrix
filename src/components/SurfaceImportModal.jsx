// TASKS.csv #228 — surface geochemistry (soil/rock-chip/stream-sediment/talus-fines) sample import.
// Deliberately a separate, simpler modal rather than generalizing AssayImportModal: a surface sample
// is one row per sample with its own world x/y/z (no hole_id/from/to, no long-vs-wide analyte format
// real exports use for downhole assays) — the only things genuinely shared with the assay importer are
// the element-column auto-detection/unit-inference helpers (isElementColumn/inferUnit, both reused
// as-is from geochem.js) and this same left-column-mapping/right-element-checklist layout.
import { useStore } from "../lib/store.jsx"; // TASKS.csv #615
import React, { useMemo, useRef, useState } from "react"; // useRef: #1670; useMemo: #2728
import { X } from "./icons.js";
import { inferUnit, ELEMENT_SYMBOLS, UNIT_ONLY_SYMBOLS, surfaceAttrLeftOut, SURFACE_ATTR_MAX_DISTINCT, oxideOfHeader, keepsOxide } from "../lib/geochem.js"; // left out: #2728; basis: #2627
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import SourceCrsField from "./SourceCrsField.jsx"; // TASKS.csv #600
import { crsName } from "../lib/reproject.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { conversionsOver100 } from "../lib/assayReimport.js"; // TASKS.csv #3217

// TASKS.csv #845 — every stream program (Matt: "Do all stream programs"): moss mats, heavy-mineral concentrates, BLEG and
// stream waters are different measurements from active sediment and are kept as their own media (never ranked together)
export const SURFACE_MEDIA = ["soil", "rock chip", "stream sediment", "moss mat", "heavy mineral concentrate", "BLEG", "stream water", "talus fines", "other"];

export default function SurfaceImportModal({ modal, onChange, onCancel, onCommit, onJoinFile, projectEpsg, mineGrid = null }) { // onJoinFile: #1670; mineGrid: #2684 (lib/mineGrid.js mineSourceOf)
  const joinRef = useRef(null);
  const svStore = useStore(), crsUnset = svStore.project?.crsSet === false; // TASKS.csv #615
  // TASKS.csv #3217 (surface follow-up) — last time's choices said, and a conversion that would put readings over 100 % said before Import refuses it
  const svUnits = useMemo(() => Object.fromEntries((svStore.surfaceElements || []).map((e) => [e.symbol, e.unit])), [svStore.surfaceElements]);
  const svClashes = modal.elements.filter((e) => e.checked && svUnits[e.symbol] && svUnits[e.symbol] !== e.unit);
  const svClashKey = svClashes.map((e) => `${e.symbol}:${e.header}:${e.unit}`).join("|");
  const svOver = useMemo(() => conversionsOver100(modal.allRows || [], modal.elements.filter((e) => e.checked && svUnits[e.symbol] && svUnits[e.symbol] !== e.unit)), [modal.allRows, svClashKey, svUnits]); // svClashKey stands for the clashes
  const svLast = modal.elements.filter((e) => e.checked && e.asLastTime);
  useEscapeKey(onCancel);
  useFocusTrap(); // TASKS.csv #238
  const checkedCount = modal.elements.filter((e) => e.checked).length;
  // TASKS.csv #2728 — the columns that will not be kept as sample attributes (too many different values), named before the import
  const leftOut = useMemo(() => surfaceAttrLeftOut(modal.headers, modal.allRows, modal.mapping, modal.elements, modal.attrExclude), [modal.headers, modal.allRows, modal.mapping, modal.elements, modal.attrExclude]);
  const [addSymbol, setAddSymbol] = useState("");
  const [addHeader, setAddHeader] = useState("");

  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });
  const toggleEl = (sym) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, checked: !e.checked } : e) });
  // unitChosen: #3217 — kept on the project's element, so the next import of the file opens with it; a change is the user's, not last time's
  const setUnit = (sym, unit) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, unit, unitChosen: true, asLastTime: e.asLastTime && e.unit === unit } : e) });
  const setHeader = (sym, header) => onChange({ ...modal, elements: modal.elements.map((e) => e.symbol === sym ? { ...e, header, asLastTime: e.asLastTime && e.header === header } : e) });
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
  const setKeepOxide = (sym, keep) => onChange({ ...modal, elements: modal.elements.map((e) => (e.symbol === sym ? { ...e, keepOxide: keep } : e)) }); // TASKS.csv #2627

  const required = [["x", "Easting (X)"], ["y", "Northing (Y)"]]; // #606: Z is optional (missing -> placed on the terrain)

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Import surface samples: {fileName}", { fileName: modal.fileName })}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{modal.elements.length === 1 ? tr("1 element recognized") /* TASKS.csv #2707 */ : tr("{elements} elements recognized", { elements: modal.elements.length })}</div>
            {leftOut.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }} title={leftOut.join(", ")}>{tr("Not kept as sample attributes (more than {max} different values; not a note or an id): {list}", { max: SURFACE_ATTR_MAX_DISTINCT, list: leftOut.length > 8 ? `${leftOut.slice(0, 8).join(", ")} …` : leftOut.join(", ") })}</div>}{/* #2728 */}
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>{tr("Column mapping")}</div>
          {required.map(([key, lbl]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{lbl} <span style={{ color: "var(--color-danger-solid)" }}>*</span></div>
              <select value={modal.mapping[key] || ""} onChange={(e) => setMapping(key, e.target.value)} style={{ ...sel, flex: 1, borderColor: modal.mapping[key] ? "var(--color-border)" : "var(--color-danger-border-strong)" }}>
                <option value="">{tr("— none —")}</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }} title={tr("Optional. Samples with no elevation (blank, or a column that is 0 on every row) are placed on the terrain in the 3D view.")}>
            <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{tr("Elevation (Z)")}</div>
            <select value={modal.mapping.z || ""} onChange={(e) => setMapping("z", e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="">{tr("— none: place on the terrain —")}</option>
              {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{tr("Sample ID")}</div>
            <select value={modal.mapping.sample_id || ""} onChange={(e) => setMapping("sample_id", e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="">{tr("— none —")}</option>
              {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          {/* TASKS.csv #1670 (review #1646, Kodiak) — a soil program's field sheet and assay sheet, joined here by sample ID */}
          {onJoinFile && (
            <div style={{ marginBottom: 10, marginInlineStart: 130 }}>
              <button type="button" onClick={() => joinRef.current?.click()} style={{ ...sel, cursor: "pointer", background: "var(--color-bg-subtle)" }}
                title={tr("For samples whose data come in two files (a field sheet and the lab's assay sheet): the other file's columns are added to these rows where the sample IDs match.")}>{tr("Add columns from another file (by sample ID)…")}</button>
              <input ref={joinRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} aria-label={tr("File to join by sample ID")} onChange={(e) => { const f = e.target.files[0]; if (f) onJoinFile(f); e.target.value = ""; }} />
              {modal.joinNote && <div role="status" style={{ fontSize: "var(--font-size-sm)", marginTop: 4, lineHeight: 1.4, color: modal.joinNote.warn ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>{modal.joinNote.text}</div>}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{tr("Sample medium")}</div>
            <select value={modal.mapping.medium || ""} onChange={(e) => setMapping("medium", e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="">{tr("— column, if present —")}</option>
              {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={modal.defaultMedium} onChange={(e) => onChange({ ...modal, defaultMedium: e.target.value })} style={{ ...sel, width: 140 }} title={tr("Used for every row when no medium column is mapped, or a row's medium value doesn't match anything recognized")}>
              {SURFACE_MEDIA.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {!modal.mapping.medium && (() => { // TASKS.csv #2085 — what the file's own medium column holds, when it is not used
            const col = modal.headers.find((h) => /^(medium|sample_?medium|samp_?type|sample_?type|smpl_?medium)$/i.test(String(h).trim()));
            if (!col) return null;
            const counts = new Map();
            for (const r of modal.allRows || []) { const v = String(r[col] ?? "").trim(); if (v) counts.set(v, (counts.get(v) || 0) + 1); }
            if (!counts.size) return null;
            const list = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v, n]) => `${v} ${n}`).join(", ");
            return <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "-4px 0 8px 130px", lineHeight: 1.4 }}>{tr("The file's \"{col}\" column holds {list}; with no medium column chosen, every row is imported as {medium}.", { col, list, medium: modal.defaultMedium })}</div>;
          })()}
          {/* TASKS.csv #1794 (review #1646, Kodiak) — the QC type apart from the medium: REG / DUP / STD / BLK / Control mark inserts, not media */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }} title={tr("The column that marks standards, blanks and duplicates (REG / DUP / STD / BLK / Control ...). Those rows are kept for Surface QAQC, not drawn as samples. Left on none, the medium column is read for these labels, as before.")}>
            <div style={{ width: 120, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{tr("QC type")}</div>
            <select value={modal.mapping.qcType || ""} onChange={(e) => setMapping("qcType", e.target.value)} style={{ ...sel, flex: 1 }} aria-label={tr("QC type column")}>
              <option value="">{tr("— none —")}</option>
              {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          {/* TASKS.csv #600 — reprojected into the project CRS on import, like collars */}
          <div style={{ marginTop: 12 }}>
            <SourceCrsField
              value={modal.sourceEpsg || ""} onChange={(c) => onChange({ ...modal, sourceEpsg: c === "" ? "" : String(c), sourceEpsgFrom: null })} mineGrid={mineGrid}
              defaultText={crsUnset ? tr("The project CRS isn't chosen yet — pick these coordinates' CRS here, or GeoStrix asks on import") : tr("Same as project — {v}", { v: crsName(projectEpsg) || tr("EPSG:{v}", { v: projectEpsg ?? "?" }) })}
            />
            {modal.sourceEpsgFrom === "(own CRS)" ? ( /* TASKS.csv #2016 — from the shapefile's .prj / the GeoPackage's SRS */
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: -4, lineHeight: 1.4 }}>{tr("Read from the file's own CRS (its .prj or GeoPackage SRS) — check it. Samples are reprojected into the project CRS on import.")}</div>
            ) : modal.sourceEpsgFrom && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: -4, lineHeight: 1.4 }}>{tr("Read from the file's \"{sourceEpsgFrom}\" column — check it. Samples are reprojected into the project CRS on import.", { sourceEpsgFrom: modal.sourceEpsgFrom })}</div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 }}>
            <div style={{ ...label, marginBottom: 0 }}>{tr("Elements ({checkedCount} of {elements})", { checkedCount, elements: modal.elements.length })}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAll(true)} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-accent)", cursor: "pointer" }}>{tr("All")}</span>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAll(false)} style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("None")}</span>
            </div>
          </div>
          {svLast.length > 0 && ( /* TASKS.csv #3217 */
            <div role="status" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "0 0 6px", lineHeight: 1.45 }}>{tr("As last time in this project: {list}. Change any of them in the list below.", { list: svLast.slice(0, 12).map((e) => `${e.symbol} ${e.header} (${e.unit})`).join(", ") + (svLast.length > 12 ? ", …" : "") })}</div>
          )}
          {svOver.length > 0 && ( /* TASKS.csv #3217 */
            <div role="alert" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-text)", margin: "0 0 6px", lineHeight: 1.45 }}>{tr("Converting {list} would put readings over 100 %: set their unit to the one the column is in, or Import will refuse them.", { list: svOver.map((b) => `${b.header} (${b.unit})`).join(", ") })}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
            {modal.elements.map((e) => (
              <div key={e.symbol} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: e.checked ? "var(--color-bg-subtle)" : "transparent", borderRadius: 5 }}>
                <input type="checkbox" checked={e.checked} onChange={() => toggleEl(e.symbol)} />
                <span style={{ fontSize: "var(--font-size-base)", color: e.checked ? "var(--color-text)" : "var(--color-text-muted)", width: 28, flexShrink: 0 }}>{e.symbol}</span>
                  {e.n === 0 && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flexShrink: 0 }} title={tr("This column is blank in every row of the file: left unticked so it does not appear in every element list.")}>{tr("no values")}</span>} {/* #1389 */}
                <select value={e.header} onChange={(ev) => setHeader(e.symbol, ev.target.value)} style={{ ...sel, flex: 1, minWidth: 0, fontSize: "var(--font-size-sm)" }} title={tr("Which column this element's values come from")}>
                  {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <select value={e.unit} onChange={(ev) => setUnit(e.symbol, ev.target.value)} style={{ ...sel, fontSize: "var(--font-size-xs)", padding: "1px 3px", flexShrink: 0 }}>
                  <option value="ppm">{tr("ppm")}</option><option value="%">%</option><option value="ppb">{tr("ppb")}</option>
                </select>
                {oxideOfHeader(e.header) && ( /* TASKS.csv #2627 — the basis this oxide column is stored in, as the drill import (#2487) */
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

          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <input
              list="geostrix-element-symbols-surface" value={addSymbol} onChange={(ev) => setAddSymbol(ev.target.value)}
              placeholder={tr("Symbol (e.g. Cu)")} style={{ ...sel, width: 100, fontSize: "var(--font-size-sm)" }}
            />
            <datalist id="geostrix-element-symbols-surface">
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
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>{tr("Cancel")}</button>
          <button onClick={onCommit} style={{ ...btn(true), flex: 2 }} disabled={!modal.mapping.x || !modal.mapping.y /* TASKS.csv #847 — Z is optional since #606 */}>{tr("Import {checkedCount} {v}", { checkedCount, v: tr(checkedCount === 1 ? "element" : "elements") })}</button>
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
