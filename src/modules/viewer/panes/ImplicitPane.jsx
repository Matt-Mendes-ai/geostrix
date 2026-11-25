// TASKS.csv #4070 — the Implicit surface pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "implicit"` test inside
// is ModellingPanes' own, kept as it was.
import { ChevronDown, ChevronRight, Layers3, Mountain } from "../../../components/icons.js";
import InfoButton from "../../../components/InfoButton.jsx";
import NumberInput from "../../../components/NumberInput.jsx"; // TASKS.csv #3926
import { activateOnKey } from "../../../lib/a11y.js";
import { t as tr } from "../../../lib/i18n.js";
import { isCrossCuttingRole } from "../../../lib/layers.js";

export default function ImplicitPane({ clusterNote, collars, emptyPaneHint, gempyTitle, implicitBusy, implicitTarget, includeSectionContacts, leftOutCodes, leftOutNote, lithoGroupCrossCuts, lithoGroupKey, lithoGroupRole, lithoGroups, litho_units, mcodeNames, mcodeRole, modellingCodeList, paneHeader, rawRole, runImplicitModel, sections, sensBudget, sensN, sensOpen, sensSigmaDeg, sensSigmaPos, setImplicitTarget, setIncludeSectionContacts, setSensBudget, setSensN, setSensOpen, setSensSigmaDeg, setSensSigmaPos, toolPane }) {
  return (<>
{toolPane === "implicit" && (<>
        {paneHeader("Implicit surface", Mountain, "model")}
        {clusterNote() /* #3268 */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models one unit's top contact from litho intervals with GemPy (Python engine), oriented by structure picks or, without them, by the contacts' own shape.")}</div>
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the StrixViewer tab (Add layer › Lithology), or load the sample project."))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title={tr("Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points")}>
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />{tr("Include drawn cross-section contacts{v}", { v: sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : "" })}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Unit to model")} value={implicitTarget} onChange={(e) => setImplicitTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a unit…")}</option>
            {litho_units.filter((u) => !mcodeRole.has(u)).map((u) => { // #2532 — a code listed under Modelling codes is offered there, once
              const role = rawRole(u);
              return <option key={u} value={u}>{u}{role !== "stratigraphic" ? ` (${role}${isCrossCuttingRole(role) ? ", cross-cutting" : ""})` : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups under their own optgroup; a mixed-role group gets no role
                suffix (no guessing), a cross-cutting group is still offered HERE (this tool has no
                non-crossing constraint), just labelled. */}
            {/* TASKS.csv #3876 (#3767) — a group with a Modelling codes twin (the same name: its role set there) is offered once, under Modelling codes */}
            {lithoGroups.some((g) => !mcodeNames.has(g.name)) && (
              <optgroup label={tr("Groups")}>
                {lithoGroups.filter((g) => !mcodeNames.has(g.name) && !leftOutCodes.includes(g.name)).map((g) => {
                  const role = lithoGroupRole(g);
                  const xcut = lithoGroupCrossCuts(g);
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || tr("no codes yet")}]{xcut ? tr(" (cross-cutting)") : role && role !== "stratigraphic" ? ` (${role})` : ""}</option>;
                })}
              </optgroup>
            )}
            {modellingCodeList.length > 0 && (
              <optgroup label={tr("Modelling codes")}>
                {modellingCodeList.map((c) => <option key={c.name} value={`mcode:${c.name}`}>{c.name}{c.role !== "stratigraphic" ? ` (${c.role})` : ""}</option>)}
              </optgroup>
            )}
          </select>
          <button
            onClick={() => runImplicitModel(implicitTarget)}
            disabled={!implicitTarget || implicitBusy}
            aria-label={tr("Run the implicit model (GemPy)")}
            title={gempyTitle(!collars.length ? tr("No holes with collars yet: import collars first.") : !implicitTarget ? tr("Choose a unit first.") : null)}
            className="gs-btn gs-btn--block" style={{ width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", whiteSpace: "nowrap", opacity: implicitTarget && !implicitBusy ? 1 : 0.5, cursor: implicitTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? tr("Running…") : <><Layers3 size={14} aria-hidden="true" />{" "}{tr("Run")}</>}</button>{/* #572 — was an unlabeled icon */}
        </div>
        {leftOutNote}
        {/* TASKS.csv #52 (a) — sensitivity spread. Collapsed by default: it is N+1 GemPy runs, not a
            casual click. Copy says "spread", never "confidence" — see lib/surfaceSpread.js's header. */}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSensOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
          {sensOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}{tr("Sensitivity: spread across realizations")}<InfoButton title={tr("Sensitivity spread")} width={380} text={tr("Re-runs the model with every contact moved at random (position sigma, m) and every orientation tipped (orientation sigma, degrees), then colours the surface by how far the runs land: pale = stable, dark = moves a lot, grey = no surface in some run. A spread under the sigmas you enter — not a probability or a confidence. A pick's 'uncertainty_m' column overrides the position sigma.")} />
        </div>
        {sensOpen && (
          <div style={{ padding: "8px 9px", marginBottom: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            {[
              [tr("Contact position ±"), sensSigmaPos, setSensSigmaPos, "m", "e.g. 2"],
              [tr("Orientation ±"), sensSigmaDeg, setSensSigmaDeg, "°", "e.g. 5"],
            ].map(([label, val, set, unit, ph]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ width: 108, flexShrink: 0 }}>{label}</span>
                <NumberInput min={0} allowEmpty value={val === "" || val == null ? null : val} placeholder={ph} onChange={(v) => set(v == null ? "" : String(v))} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
                <span>{unit} (1 σ)</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ width: 108, flexShrink: 0 }}>{tr("Realizations")}</span>
              <NumberInput min={3} max={50} allowEmpty value={sensN === "" || sensN == null ? null : sensN} onChange={(v) => setSensN(v == null ? "" : String(v))} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ width: 108, flexShrink: 0 }}>{tr("Time budget")}</span>
              <NumberInput min={10} step={30} allowEmpty value={sensBudget === "" || sensBudget == null ? null : sensBudget} onChange={(v) => setSensBudget(v == null ? "" : String(v))} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
              <span>s</span>
            </div>
            {(() => {
              const sp = Number(sensSigmaPos), sd = Number(sensSigmaDeg);
              const ready = implicitTarget && !implicitBusy && sensSigmaPos !== "" && sensSigmaDeg !== "" && sp >= 0 && sd >= 0 && (sp > 0 || sd > 0);
              return (
                <button
                  onClick={() => runImplicitModel(implicitTarget, { ensemble: { n: Math.min(50, Math.max(3, Number(sensN) || 8)), sigmaPos: sp, sigmaDeg: sd, budgetS: Math.max(10, Number(sensBudget) || 300) } })}
                  disabled={!ready}
                  title={!implicitTarget ? tr("Choose a unit above first") : (sensSigmaPos === "" || sensSigmaDeg === "") ? tr("Enter both sigmas — there is deliberately no default") : tr("Run the model, then the realizations")}
                  className="gs-btn gs-btn--block" style={{ marginBottom: 0, justifyContent: "center", opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "default" }}
                >{tr("Run with sensitivity spread")}</button>
              );
            })()}
          </div>
        )}

        </>)}
  </>);
}
