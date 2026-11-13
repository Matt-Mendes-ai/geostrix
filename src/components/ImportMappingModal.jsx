import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #615
import { crsName } from "../lib/reproject.js"; // TASKS.csv #488
import SourceCrsField from "../components/SourceCrsField.jsx"; // TASKS.csv #488
import { mineSourceOf, isMineSource } from "../lib/mineGrid.js"; // TASKS.csv #2811 — 'Local mine grid (no CRS)' in the 3D View's import
import { X } from "./icons.js";
import { TARGET_SCHEMAS, guessMapping, LAYER_META } from "../lib/layers.js";
import { alterationStyleFromName, blankShare } from "../lib/viewer/importHelpers.js"; // TASKS.csv #1511; blankShare: #2182
import { AZIMUTH_REFS } from "../lib/azimuthRef.js"; // TASKS.csv #396
import { fitSimilarity, parseControlPoints } from "../lib/localGrid.js"; // TASKS.csv #412
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { fieldNeedsNumber, columnHasNoNumbers } from "../lib/importChecks.js"; // TASKS.csv #1257
import { customFromPrevious } from "../lib/viewer/customMapping.js"; // TASKS.csv #1654
import { tieOf } from "../lib/localGridTie.js"; // TASKS.csv #2491
import CoordSetsNote from "./CoordSetsNote.jsx"; // TASKS.csv #2492 — two coordinate sets, X / Y / Z from different sets, mine-grid numbers
import LogChannelsBox from "./LogChannelsBox.jsx"; // TASKS.csv #2160 — one numeric layer per log channel
import RowFilterBox from "./RowFilterBox.jsx"; // TASKS.csv #2330 — only rows where a column is some values (a Superseded flag pre-set)
import { looksLikeStationTable } from "../lib/geophysColumns.js"; // TASKS.csv #2848
import { perHoleJoinOf } from "../lib/perHoleJoin.js"; // TASKS.csv #2659
import { requestModuleAction } from "../lib/menuRequests.js"; // #2848
import { applyRowFilter, defaultRowFilter } from "../lib/importRowFilter.js"; // TASKS.csv #2330 — the button counts the rows the filter keeps
// the rows the Import button will bring in: after the row filter (the user's, else the flag preset), as the commit counts them
// cached per row array and filter: the dialog re-renders on every change, and a 400,000-row table must not be scanned each time
// TASKS.csv #2900 (5) — a share under 1 % is not '0 %' (5,840 of 2,584,475 rows read '0 %')
const blankPct = (n, total) => { const p = (100 * n) / total; return p > 0 && p < 1 ? (p < 0.1 ? "< 0.1" : p.toFixed(1)) : String(Math.round(p)); };
const countCache = new WeakMap();
const importCount = (modal) => {
  const rows = modal.allRows; if (!rows?.length || modal.logTable) return modal.rowCount; // logTable: #3038 — the rows are its first 5,000
  let c = countCache.get(rows); if (!c) countCache.set(rows, (c = new Map()));
  const k = modal.rowFilter === undefined ? "preset" : JSON.stringify(modal.rowFilter);
  if (!c.has(k)) { const f = modal.rowFilter !== undefined ? modal.rowFilter : defaultRowFilter(modal.headers, rows); c.set(k, f ? applyRowFilter(rows, f).rows.length : modal.rowCount); }
  return c.get(k);
};
import { logChannelsFor } from "../lib/downholeLogChannels.js";
import { numberColumnsLeft } from "../lib/valueGuess.js"; // TASKS.csv #2889
import { recoveryColumns } from "../lib/recoveryCalc.js"; // TASKS.csv #2891
import { codeOverlap, otherCodeSystem } from "../lib/codeOverlap.js"; // TASKS.csv #2893


export default function ImportMappingModal({ modal, onChange, onCancel, onCommit, projectEpsg, replaceInfo = null }) { // replaceInfo: #1649
  const { project: storeProject, layers: storeLayers, goToModule, collars: storeCollars } = useStore(); // #2492; layers: #2893; goToModule: #2848; collars: #2659
  // TASKS.csv #2659 — every id an existing collar at its own position: a per-hole table, whose columns join onto those holes
  const perHole = useMemo(() => (modal.target === "collars" ? perHoleJoinOf(modal.allRows || modal.sampleRows || [], modal.mapping, storeCollars) : null), [modal.target, modal.allRows, modal.sampleRows, modal.mapping, storeCollars]);
  const crsUnset = storeProject?.crsSet === false; // TASKS.csv #615
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
  // TASKS.csv #2889 — every number column left over, added at once (the WA iron material-type log: 43 Met_*_pct columns, one Add each)
  const numbersLeft = numberColumnsLeft(modal.headers, modal.allRows || modal.sampleRows || [], modal.mapping, customFields);
  // TASKS.csv #2893 — the file's codes against the layer's (a code layer that already holds another file's rows)
  const codeClash = useMemo(() => {
    if (!modal.mapping?.value || modal.target === "custom" || LAYER_META[modal.target]?.numeric || !TARGET_SCHEMAS[modal.target]?.fields.some((f) => f.key === "from")) return null;
    const o = codeOverlap(storeLayers?.[modal.target], modal.allRows || modal.sampleRows || [], modal.mapping.value, modal.mapping.hole_id);
    return otherCodeSystem(o) ? o : null;
  }, [modal.target, modal.mapping?.value, modal.mapping?.hole_id, modal.allRows, storeLayers]);
  const asOwnLayer = () => onChange({ ...modal, target: "custom", customName: String(modal.fileName || "").replace(/ \(\d+ more queued\)$/, "").replace(/\.(csv|txt|xlsx?)$/i, ""), mapping: { hole_id: modal.mapping.hole_id, from: modal.mapping.from, to: modal.mapping.to, depth: "", value: modal.mapping.value } });
  const addAllNumbers = () => onChange({ ...modal, customFields: [...customFields, ...numbersLeft.map((c) => ({ column: c, name: c, type: "number" }))] });
  // TASKS.csv #120 — only targets carrying ABSOLUTE world x/y (collars; every other target is
  // hole-relative and inherits its position from the already-reprojected collar) can meaningfully
  // have a different source CRS than the project.
  const hasAbsoluteXY = schema.fields.some((f) => f.key === "x") && schema.fields.some((f) => f.key === "y");
  const setTarget = (target) => {
    // TASKS.csv #426 — re-guess the columns for the newly chosen type instead of clearing them all.
    let mapping = guessMapping(target, modal.headers || []);
    // TASKS.csv #1654 (review #1645, Copley) — 'Custom layer' forgot the guesses: Value went back to '— none —' (Rock_Oxidation was the
    // guess), and a table of points (From = To on every row, the SWIR files) kept From / To instead of Depth
    if (target === "custom") mapping = customFromPrevious(mapping, modal.mapping || {}, modal.allRows || modal.sampleRows || []);
    onChange({ ...modal, target, mapping });
  };
  const setMapping = (key, col) => onChange({ ...modal, mapping: { ...modal.mapping, [key]: col } });

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Import {fileName}", { fileName: modal.fileName })}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{rowCount} rows detected · match each field to a column below", { rowCount: modal.rowCount })}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto" }}>
          <div style={label}>{tr("What kind of data is this?")}</div>
          <select aria-label={tr("Import as")} value={modal.target} onChange={(e) => setTarget(e.target.value)} style={{ ...sel, width: "100%", marginBottom: 16 }}>
            {Object.entries(TARGET_SCHEMAS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
          </select>
          {/* TASKS.csv #1649 — a guess that would have replaced another file's log, and what the current choice replaces */}
          {/* TASKS.csv #1649 / #2021 — a guessed layer that would replace another file's rows stays the guess: the replace alert below says what it
              replaces (Ctrl+Z undoes it), and Custom layer is one choice away */}
          {perHole && ( /* TASKS.csv #2659 */
            <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", margin: "-10px 0 12px", lineHeight: 1.4 }}>
              {tr("Per-hole values: all {n} hole(s) are already in the project at these coordinates. Importing joins the file's other columns ({cols}) onto those holes, on the hole id; no new hole is added.", { n: perHole.n.toLocaleString(), cols: perHole.columns.slice(0, 6).join(", ") + (perHole.columns.length > 6 ? "…" : "") })}
            </div>
          )}
          {/* TASKS.csv #2338 — a custom layer's name: two columns of one file were two layers both called after the file */}
          {modal.target === "custom" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "-6px 0 12px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Layer name")}
              <input aria-label={tr("Custom layer name")} value={modal.customName ?? ""} placeholder={`${String(modal.fileName || "").replace(/\.csv$/i, "")}${modal.mapping?.value ? `: ${modal.mapping.value}` : ""}`} onChange={(e) => onChange({ ...modal, customName: e.target.value })} style={{ ...sel, flex: 1, minWidth: 0 }} />
            </label>
          )}
          {replaceInfo && (
            <div role="alert" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", margin: "-10px 0 12px", lineHeight: 1.4 }}>
              {tr("Importing as {layer} replaces {n} row(s) from {src} in {holes} hole(s) (Ctrl+Z undoes it).", { layer: tr(LAYER_META[replaceInfo.target]?.label || replaceInfo.target), n: replaceInfo.n, src: replaceInfo.src || tr("an earlier import"), holes: replaceInfo.holes })}
            </div>
          )}

          <div style={label}>{tr("Column mapping")}</div>
          {schema.fields.map((f) => (
            <div key={f.key} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ width: 220, fontSize: "var(--font-size-base)", color: f.required ? "var(--color-text)" : "var(--color-text-secondary)", flexShrink: 0 }}>
                {tr(f.label)}{f.required && <span style={{ color: "var(--color-danger-solid)" }}> *</span>}
              </div>
              <select aria-label={tr(f.label)} value={modal.mapping[f.key] || ""} onChange={(e) => setMapping(f.key, e.target.value)} style={{ ...sel, flex: 1, borderColor: f.required && !modal.mapping[f.key] ? "var(--color-danger-border-strong)" : "var(--color-border)" }}>
                <option value="">{tr("— none —")}</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              {f.key === "value" && codeClash && ( /* TASKS.csv #2893 — another code system than the layer's: said, with the way out */
                <div role="note" style={{ flexBasis: "100%", marginInlineStart: 220, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>
                  {tr(codeClash.shared ? "Only {shared} of the {n} codes in {col} are in {layer}, which holds {m} codes from {files}: adding them puts two code systems in one layer." : "None of the {n} codes in {col} is in {layer}, which holds {m} codes from {files}: adding them puts two code systems in one layer.", { shared: codeClash.shared, n: codeClash.codes, col: modal.mapping.value, layer: tr(LAYER_META[modal.target]?.label || modal.target), m: codeClash.layerCodes, files: codeClash.files.slice(0, 3).join(", ") || tr("an earlier import") })}{" "}
                  <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={asOwnLayer} style={{ color: "var(--color-accent)", cursor: "pointer" }}>{tr("Import it as its own layer")}</span>
                </div>
              )}
              {f.key === "value" && modal.valueGuess && modal.mapping.value === modal.valueGuess.col && ( /* TASKS.csv #2889 — a guess, said as one */
                <div role="note" style={{ flexBasis: "100%", marginInlineStart: 220, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("No column name matched, so {col} was chosen: the file's only column of codes ({n} codes). Check it is the one to draw.", { col: modal.valueGuess.col, n: modal.valueGuess.codes })}</div>
              )}
              {/* TASKS.csv #2182 — a coded log's Value column blank on many rows: those rows are skipped, said before the import */}
              {f.key === "value" && !fieldNeedsNumber(f) && modal.target !== "custom" && !LAYER_META[modal.target]?.numeric /* #2900 (5) — a numeric layer has no codes */ && modal.mapping.value && (() => { const b = blankShare(modal.allRows, modal.mapping.value); if (!b || !b.blank) return null; const many = b.blank / b.total >= 0.2; /* #2493 — always said, with the choice to keep them */ return (
                <div role="note" style={{ flexBasis: "100%", marginInlineStart: 220, fontSize: "var(--font-size-sm)", color: many ? "var(--color-warn-text)" : "var(--color-text-muted)" }}>
                  {modal.keepBlankCodes ? tr("{col} is blank on {pct} % of the rows ({n} of {m}): those rows are kept as (no code), unless a next code column has a code.", { col: modal.mapping.value, pct: blankPct(b.blank, b.total), n: b.blank.toLocaleString(), m: b.total.toLocaleString() })
                    : tr("{col} is blank on {pct} % of the rows ({n} of {m}): those rows have no code and are skipped.", { col: modal.mapping.value, pct: blankPct(b.blank, b.total), n: b.blank.toLocaleString(), m: b.total.toLocaleString() })}
                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center", marginInlineStart: 8 }}><input type="checkbox" checked={!!modal.keepBlankCodes} onChange={(e) => onChange({ ...modal, keepBlankCodes: e.target.checked })} />{tr("Keep them as (no code)")}</label>
                </div>); })()}
              {fieldNeedsNumber(f) && modal.mapping[f.key] && columnHasNoNumbers(modal.sampleRows, modal.mapping[f.key]) && <div role="alert" style={{ flexBasis: "100%", marginInlineStart: 220, fontSize: "var(--font-size-sm)", color: "var(--color-danger-icon)" }}>{tr("\"{col}\" has no numbers in the preview rows: {field} needs a number.", { col: modal.mapping[f.key], field: tr(f.label) })}</div>}
            </div>
          ))}

          {/* TASKS.csv #208 — "make it possible to add extra fields whenever importing csv or
              vectors" — a generic escape hatch for source columns that don't correspond to any of
              this schema's built-in fields (comments, sample IDs, lab batch numbers, whatever the
              source actually carries). Carried straight through to the attribute table (which
              already derives its columns from whatever keys a row has) and, for interval layers, the
              hover tooltip shows one named "description" specifically — see ViewerModule.jsx. */}
          {modal.target === "recovery" && !modal.mapping.value && (() => { const rc = recoveryColumns(modal.headers); if (!rc) return null; const run = rc.drilled || tr("To − From"); return ( /* TASKS.csv #2891 */
            <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: "var(--font-size-sm)", color: "var(--color-text)", marginBottom: 12, lineHeight: 1.45 }}>
              <input type="checkbox" checked={!modal.recoveryCalcOff} onChange={(e) => onChange({ ...modal, recoveryCalcOff: !e.target.checked })} style={{ marginTop: 2 }} />
              <span>{rc.loss ? tr("No recovery column: compute Recovery % from {loss} and {run}, as (run − loss) / run × 100.", { loss: rc.loss, run }) : tr("No recovery column: compute Recovery % from {rec} and {run}, as recovered / run × 100.", { rec: rc.recovered, run })}</span>
            </label>); })()}
          <CoordSetsNote modal={modal} project={storeProject} />{/* #2492 */}
          <LogChannelsBox modal={modal} onChange={onChange} sel={sel} />{/* #2160 */}
          <RowFilterBox modal={modal} onChange={onChange} sel={sel} />{/* #2330 */}
          <div style={{ marginTop: 4, marginBottom: 14 }}>
            <div style={label}>{tr("Extra fields (optional)")}</div>
            {numbersLeft.length > 1 && ( /* #2889 */
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 6 }}>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={addAllNumbers} style={{ color: "var(--color-accent)", cursor: "pointer" }}>{tr("Add every number column ({n})", { n: numbersLeft.length })}</span>
                {" "}{tr("as number fields on each row: {list}", { list: numbersLeft.slice(0, 6).join(", ") + (numbersLeft.length > 6 ? " …" : "") })}
              </div>
            )}
            {customFields.map((cf, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>{cf.column} <span style={{ color: "var(--color-text-muted)" }}>→</span> {cf.name}</div>
                <select value={cf.type || "text"} onChange={(e) => setCustomFieldType(i, e.target.value)} style={{ ...sel, fontSize: "var(--font-size-sm)", padding: "2px 4px", flexShrink: 0 }} title={tr("How this field's value is stored")}>
                  <option value="text">{tr("text")}</option>
                  <option value="number">{tr("number")}</option>
                  <option value="category">{tr("category")}</option>
                </select>
                <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Remove field \"{v}\"", { v: cf.name || cf.column })} title={tr("Remove this field")} size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} onClick={() => removeCustomField(i)} />{/* #596: was named "Close" */}
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <select value={addColumn} onChange={(e) => { const v = e.target.value; setAddColumn(v); if (!addName.trim() || addName === addColumn) setAddName(v); /* #2341 — the name pre-filled from the column */ }} style={{ ...sel, flex: 1, minWidth: 0 }}>
                <option value="">{tr("— pick a column —")}</option>
                {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <input
                type="text" value={addName} onChange={(e) => setAddName(e.target.value)}
                placeholder={tr("Field name")} style={{ ...sel, width: 130 }}
              />
              <select value={addType} onChange={(e) => setAddType(e.target.value)} style={{ ...sel, width: 82, fontSize: "var(--font-size-sm)" }} title={tr("Data type")}>
                <option value="text">{tr("text")}</option>
                <option value="number">{tr("number")}</option>
                <option value="category">{tr("category")}</option>
              </select>
              <button
                onClick={addCustomField}
                disabled={!addColumn || !addName.trim()}
                style={{ ...btn(true), width: "auto", padding: "6px 10px", fontSize: "var(--font-size-base)", opacity: (addColumn && addName.trim()) ? 1 : 0.5 }}
              >{tr("Add")}</button>
            </div>
          </div>

          {hasAbsoluteXY && (
            <div style={{ marginTop: 14 }}>
              <SourceCrsField
                value={modal.sourceEpsg || ""} onChange={(c) => onChange({ ...modal, sourceEpsg: c === "" ? "" : String(c) })} mineGrid={modal.target === "collars" ? mineSourceOf(storeProject) : null /* #2811 — collars are what this import reprojects */}
                defaultText={crsUnset ? tr("The project CRS isn't chosen yet — pick these coordinates' CRS here, or GeoStrix asks on import") : tr("Same as project — {v}", { v: crsName(projectEpsg) || tr("EPSG:{v}", { v: projectEpsg ?? "?" }) })}
              />
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: -4, lineHeight: 1.4 }}>{tr("If this file's x/y is in another CRS (a collar list or claim boundary in a different UTM zone or datum), pick it here and it is reprojected into the project CRS on import so it lines up with everything else.")}</div>

              {/* TASKS.csv #205 — a merged/regional dataset can have DIFFERENT rows in different
                  EPSGs (e.g. one collar list spanning two UTM zones), which the single Source CRS
                  field above can't express. If a likely per-row CRS column exists in the source
                  data, offer mapping it here — each row is then reprojected from its OWN EPSG,
                  falling back to the Source CRS field above for rows with a missing/unrecognized
                  value. */}
              <div style={{ marginTop: 10 }}>
                <div style={label}>{tr("Per-row Source CRS column (optional)")}</div>
                <select
                  value={modal.perRowEpsgCol || ""}
                  onChange={(e) => onChange({ ...modal, perRowEpsgCol: e.target.value })}
                  style={{ ...sel, width: "100%" }}
                >
                  <option value="">{tr("— none, use one Source CRS for the whole file —")}</option>
                  {modal.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("If this dataset's own column already tags each row with its EPSG (e.g. a merged regional database export with rows in more than one UTM zone), map it here instead — each row is reprojected from its own value in that column. Rows with a blank or unrecognized value fall back to the Source CRS field above.")}</div>
              </div>
            </div>
          )}

          {/* TASKS.csv #1511 — one table per alteration style: its codes come in as 'Style: code', apart from another style's same code */}
          {modal.target === "alt" && (
            <div style={{ marginTop: 14 }}>
              <label style={label}>{tr("Alteration style (optional)")}
                <input type="text" value={modal.altStyle ?? alterationStyleFromName(modal.fileName)} placeholder={tr("e.g. Oxidation")} onChange={(e) => onChange({ ...modal, altStyle: e.target.value })}
                  style={{ display: "block", marginTop: 4, width: 220, fontSize: "var(--font-size-base)" }} aria-label={tr("Alteration style")} />
              </label>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("A logging database with one table per style (oxidation, silicification…)? Name this file's style and its codes come in as 'Style: code' (Oxidation: Pchy), kept apart from another style's same code. Leave it blank to keep the codes as they are.")}</div>
            </div>
          )}

          {schema.dipConvention && (
            <div style={{ marginTop: 14 }}>
              <div style={label}>{tr("Dip sign convention")}</div>
              <div style={{ display: "flex", gap: 14, fontSize: "var(--font-size-base)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" checked={modal.dipConvention === "neg_down"} onChange={() => onChange({ ...modal, dipConvention: "neg_down" })} />{" "}{tr("Negative = down (industry standard)")}</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" checked={modal.dipConvention === "pos_down"} onChange={() => onChange({ ...modal, dipConvention: "pos_down" })} />{" "}{tr("Positive = down")}</label>
              </div>
              {modal.dipGuess && modal.dipConvention === "pos_down" && ( // TASKS.csv #2886 — the file decided it: say why
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{tr("Every dip in this file is positive, and steep ({n} row(s)): read as Positive = down, so the holes go into the ground. Choose Negative = down for underground up-holes.", { n: modal.dipGuess.n.toLocaleString() })}</div>
              )}
            </div>
          )}

          {/* TASKS.csv #427 — which scribed line beta is measured from (oriented core). */}
          {modal.target === "structure" && modal.mapping.alpha && modal.mapping.beta && (
            <div style={{ marginTop: 14 }}>
              <div style={label}>{tr("Beta is measured clockwise (looking down-hole) from the")}</div>
              <div style={{ display: "flex", gap: 14, fontSize: "var(--font-size-base)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" name="betaref" checked={(modal.betaRefLine || "bottom") === "bottom"} onChange={() => onChange({ ...modal, betaRefLine: "bottom" })} />{" "}{tr("Bottom-of-hole line (usual)")}</label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="radio" name="betaref" checked={modal.betaRefLine === "top"} onChange={() => onChange({ ...modal, betaRefLine: "top" })} />{" "}{tr("Top-of-hole line")}</label>
              </div>
            </div>
          )}

          {/* TASKS.csv #412 — units and local mine grid. Legacy BC data (pre-1990 ARIS logs, old mine
              plans) is often in feet and/or on a local grid; both used to be imported as if metric UTM. */}
          {(() => {
            const keys = (TARGET_SCHEMAS[modal.target]?.fields || []).map((f) => f.key);
            const hasLengths = keys.some((k) => ["depth", "from", "to", "length", "z"].includes(k));
            if (!hasLengths && modal.target !== "collars") return null;
            let fit = null, fitErr = null;
            if (modal.target === "collars" && modal.localGridOn) {
              try { fit = fitSimilarity(parseControlPoints(modal.localGridText)); } catch (e) { fitErr = e.message; }
            }
            return (
              <div style={{ marginTop: 14 }}>
                <div style={label}>{tr("Units")}</div>
                <div style={{ display: "flex", gap: 14, fontSize: "var(--font-size-base)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="radio" name="units" checked={(modal.units || "m") === "m"} onChange={() => onChange({ ...modal, units: "m" })} />{" "}{tr("Metres")}</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="radio" name="units" checked={modal.units === "ft"} onChange={() => onChange({ ...modal, units: "ft" })} />{" "}{tr(keys.includes("z") ? "Feet (depths, lengths and elevations are converted to metres)" : "Feet (depths and lengths are converted to metres)")}</label>
                </div>
                {modal.target === "collars" && (
                  <div style={{ marginTop: 10 }}>
                    {/* TASKS.csv #2497 — the shift on its own: a project kept on its mine grid, or MGA X / Y with the mine RL, says "RL is +1000" without control points */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: "var(--font-size-base)" }}>{tr("Elevation shift")}{" "}<input type="number" value={modal.zShift ?? ""} onChange={(e) => onChange({ ...modal, zShift: e.target.value })} style={{ ...sel, width: 90 }} aria-label={tr("Elevation shift in metres")} /> m <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("added to every collar elevation (e.g. -1000 for a mine datum)")}</span></div>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "var(--font-size-base)" }}>
                      <input type="checkbox" checked={!!modal.localGridOn} onChange={(e) => onChange({ ...modal, localGridOn: e.target.checked })} />{" "}{tr("X/Y are on a local mine grid")}</label>
                    {modal.localGridOn && (
                      <div style={{ marginTop: 6, marginLeft: 22 }}>
                        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("Two or more control points, one per line:")}{" "}<code>local_x local_y project_x project_y</code>{" "}{(crsUnset ? tr("— the same place on both grids (surveyed pins, a re-located hole), with project coordinates in the project CRS, which isn't chosen yet: choose it first (status bar). Leave Source CRS above blank. A 4-parameter similarity (scale, rotation, shift) is fitted; local coordinates in feet are handled by the fitted scale.") : tr("— the same place on both grids (surveyed pins, a re-located hole), with project coordinates in EPSG:{v}. Leave Source CRS above blank. A 4-parameter similarity (scale, rotation, shift) is fitted; local coordinates in feet are handled by the fitted scale.", { v: projectEpsg ?? "?" }))}</div>
                        <textarea value={modal.localGridText || ""} onChange={(e) => onChange({ ...modal, localGridText: e.target.value })} rows={4} spellCheck={false} placeholder={"10000 5000 463000.0 6178000.0" + String.fromCharCode(10) + "12500 5200 463629.0 6178421.5"} style={{ ...sel, width: "100%", fontFamily: "monospace", resize: "vertical" }} aria-label={tr("Local grid control points")} />
                        <div role="status" style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: fitErr ? "var(--color-danger-icon-strong)" : "var(--color-text-secondary)" }}>
                          {fitErr || (fit && tr("Fitted from {n} points: scale {scale}, rotation {rotationDeg}° counter-clockwise from the local grid to the map, RMS misfit {rmsM} m{v}. Residuals: {v2} m.", { n: fit.n, scale: fit.scale.toFixed(6), rotationDeg: fit.rotationDeg.toFixed(3), rmsM: fit.rmsM.toFixed(2), v: fit.n === 2 ? tr(" (two points fit exactly — add a third to check the fit)") : fit.rmsM > 2 ? tr(" — large: check the control points") : "", v2: fit.residuals.map((r) => r.toFixed(2)).join(", ") }))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TASKS.csv #396 — which north the file's azimuths are measured from. GeoStrix draws against the
              project grid; magnetic azimuths at Harry are ~17-19 deg off grid north. */}
          {["collars", "survey", "structure"].includes(modal.target) && (
            <div style={{ marginTop: 14 }}>
              <div style={label}>{tr("Azimuths in this file are measured from")}</div>
              {modal.azimuthRefFrom && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4 }}>{tr("Set from the file's {col} column.", { col: modal.azimuthRefFrom })}</div>}{/* #1647 */}
              {modal.azimuthRefAlso?.length > 0 && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 4 }}>{tr("This file has more than one azimuth column: {list}. {col} is read. To read another, pick it as the Azimuth column above and set the north below to match.", { list: [modal.azimuthRefFrom, ...modal.azimuthRefAlso.map((a) => a.col)].join(", "), col: modal.azimuthRefFrom })}</div>}{/* #2154 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--font-size-base)" }}>
                {Object.entries(AZIMUTH_REFS).map(([k, text]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="radio" name="azref" checked={(modal.azimuthRef || "grid") === k} onChange={() => onChange({ ...modal, azimuthRef: k })} /> {text}
                  </label>
                ))}
                {/* TASKS.csv #2491 — true / magnetic north with no project CRS: said here, before Import, not only in the notice after */}
                {crsUnset && (modal.azimuthRef === "true" || modal.azimuthRef === "magnetic") && (() => {
                  const tie = tieOf(storeProject);
                  return tie
                    ? <div role="note" style={{ marginLeft: 22, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Converted to the local grid's north through its tie to EPSG:{epsg} (grid rotation {rot}°), at each hole's collar.", { epsg: tie.epsg, rot: tie.rotationDeg.toFixed(2) })}</div>
                    : <div role="alert" style={{ marginLeft: 22, fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>{storeProject?.localGrid
                      ? tr("This project is on a local grid with no tie to a coordinate system, so its north is not known: these azimuths will be left as they are in the file. Tie the grid in Maps > Coordinates first (control points, or an origin and a rotation).")
                      : modal.target === "collars" // #2900 (1) — a collar import asks for the CRS first, and the azimuths are converted then
                        ? tr("The project has no coordinate system yet: importing these collars asks for it first, and these azimuths are then converted to grid north.")
                        : tr("The project has no coordinate system yet, so these azimuths cannot be converted to grid north and will be left as they are in the file. Choose the project CRS first.")}</div>;
                })()}
                {/* TASKS.csv #490 — which grid "grid north" is. Collars: the Source CRS above (their azimuths are
                    turned with their coordinates). Survey / structure files have no coordinates: pick the CRS here. */}
                {(modal.azimuthRef || "grid") === "grid" && modal.target === "collars" && modal.sourceEpsg && !isMineSource(modal.sourceEpsg) /* #2811 */ && Number(modal.sourceEpsg) !== Number(projectEpsg) && (
                  <div style={{ marginLeft: 22, fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Grid north of the Source CRS above ({crs}): azimuths are turned to the project grid along with the coordinates.", { crs: crsName(modal.sourceEpsg) || `EPSG:${modal.sourceEpsg}` })}</div>
                )}
                {(modal.azimuthRef || "grid") === "grid" && modal.target !== "collars" && (
                  <div style={{ marginLeft: 22, marginTop: 4 }}>
                    <SourceCrsField
                      label={tr("Grid of")} value={modal.azimuthGridEpsg || ""}
                      onChange={(c) => onChange({ ...modal, azimuthGridEpsg: c === "" ? "" : String(c) })} mineGrid={mineSourceOf(storeProject) /* #2811 */}
                      defaultText={crsUnset ? tr("The project CRS — not chosen yet") /* #2179: not the placeholder's name */ : tr("The project CRS — {v}", { v: crsName(projectEpsg) || tr("EPSG:{v}", { v: projectEpsg ?? "?" }) })}
                      title={tr("If these azimuths were measured against another CRS's grid (e.g. the neighbouring UTM zone), pick it: each one is turned to the project grid at its hole's collar.")}
                    />
                  </div>
                )}
                {modal.azimuthRef === "magnetic" && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 22 }}>{tr("Survey date")}<input type="date" value={modal.azimuthDate || ""} onChange={(e) => onChange({ ...modal, azimuthDate: e.target.value })} style={{ ...sel, width: "auto" }} />
                    <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("declination from IGRF-14 at each hole, plus grid convergence")}</span>
                  </label>
                )}
              </div>
            </div>
          )}

          <div style={{ ...label, marginTop: 16 }}>{tr("Preview")}</div>
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
          const logOn = !!logChannelsFor(modal.target, modal.headers, modal.allRows || modal.sampleRows || [], modal.mapping, modal.logChannels); // #2160 — the channels are the values
          const recOn = modal.target === "recovery" && !modal.mapping.value && !modal.recoveryCalcOff && !!recoveryColumns(modal.headers); // #2891 — the value is computed
          const missingRequired = schema.fields.filter((f) => f.required && !modal.mapping[f.key] && !(logOn && f.key === "value") && !(recOn && f.key === "value"))
            .concat(schema.oneOf && !schema.oneOf.some((keys) => keys.every((k) => modal.mapping[k])) ? [{ key: "oneOf", label: "From + To, or Depth" }] : []); // #605
          // TASKS.csv #2895 (review #2876, WA iron) — magnetic azimuths with no survey date: Import was enabled, the dialog closed and nothing
          // was imported (the commit refuses it), so the mapping had to be redone from a fresh drop. The button waits for the date instead.
          const needsDate = ["collars", "survey", "structure"].includes(modal.target) && modal.azimuthRef === "magnetic" && !/^\d{4}-\d{2}-\d{2}$/.test(modal.azimuthDate || "");
          const blocked = missingRequired.length > 0 || needsDate || importCount(modal) === 0;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
              {missingRequired.length > 0 && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-icon)" }}>{tr(missingRequired.length === 1 ? "Map the required field above:" : "Map the required fields above:")}{" "}{missingRequired.map((f) => tr(f.label)).join(", ")}
                  {/* TASKS.csv #2165 — which column names were looked for: the file's own name for it is then easy to spot (or it is not this kind of table) */}
                  {missingRequired.filter((f) => f.aliases?.length).map((f) => <div key={f.key} style={{ color: "var(--color-text-muted)" }}>{tr("{field}: no column matched; the names looked for are {names}.", { field: tr(f.label), names: f.aliases.slice(0, 10).join(", ") + (f.aliases.length > 10 ? ", …" : "") })}</div>)}
                </div>
              )}
              {/* TASKS.csv #2848 — no hole column but X / Y and a measurement: survey stations, which Geophysics > Point survey imports */}
              {missingRequired.some((f) => f.key === "hole_id") && modal.file && looksLikeStationTable(modal.headers) && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                  <span style={{ flex: 1 }}>{tr("No hole column: if these are survey stations (X, Y and a measurement), import them under Geophysics > Point survey.")}</span>
                  <button type="button" onClick={() => { const file = modal.file; onCancel(); goToModule("geophysics"); requestModuleAction("geophysics-drop", { files: [file] }); }} style={{ padding: "4px 10px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text)", cursor: "pointer", whiteSpace: "nowrap" }}>{tr("Import as survey stations")}</button>
                </div>
              )}
              {needsDate && <div role="alert" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-danger-icon)" }}>{tr("Type the survey date above: magnetic azimuths need it to work out the declination.")}</div>}{/* #2895 */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onCancel} style={{ ...btn(false), flex: 1 }}>{tr("Cancel")}</button>
                <button
                  onClick={onCommit}
                  disabled={blocked} // 0 rows: TASKS.csv #2431 — the row filter keeps none; the survey date: #2895
                  style={{ ...btn(true), flex: 2, opacity: blocked ? 0.5 : 1, cursor: blocked ? "not-allowed" : "pointer" }}
                  title={importCount(modal) === 0 ? tr("The row filter keeps no row: tick at least one value under Rows.") : undefined}
                >{tr("Import {rowCount} rows", { rowCount: importCount(modal) })}</button>
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
const th = { textAlign: "start", padding: "6px 8px", color: "var(--color-text-muted)", fontWeight: 500, borderBottom: "1px solid var(--color-border)" };
const td = { padding: "5px 8px", color: "var(--color-text-strong)", whiteSpace: "nowrap" };
const thMapped = { ...th, color: "var(--color-accent-dark)", fontWeight: 600, background: "#fbf1d9", borderBottom: "2px solid var(--color-accent)" };
const tdMapped = { ...td, background: "#fdf7ea" };
const mappedCaption = { fontSize: "var(--font-size-xs)", fontWeight: 400, color: "#a9873f", textTransform: "none", letterSpacing: 0, marginTop: 1 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });
