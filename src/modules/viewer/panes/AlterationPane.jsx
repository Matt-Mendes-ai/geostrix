// TASKS.csv #4070 — the Alteration modelling pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "alteration"` test inside
// is ModellingPanes' own, kept as it was.
import { Droplets, Layers3 } from "../../../components/icons.js";
import NumberInput from "../../../components/NumberInput.jsx"; // TASKS.csv #3926
import { t as tr } from "../../../lib/i18n.js";
import { isNotLogged } from "../../../lib/notLogged.js";
import { smallSel } from "../../../lib/sidebarStyles.js";

export default function AlterationPane({ altCustomLayers, altEmpty, altGroupOf, altGroups, altLoggedM, altNumericFields, altSource, altSourceCodes, altVocab, altVocabFields, alt_units, alterationBusy, alterationCellSize, alterationSearchRadius, alterationTarget, miniField, paneHeader, runAlterationModel, setAltSource, setAlterationCellSize, setAlterationSearchRadius, setAlterationTarget, storeLayers, toolPane }) {
  return (<>
{toolPane === "alteration" && (<>
        {paneHeader("Alteration modelling", Droplets, "model")}
        {/* TASKS.csv #272 — this tool no longer builds a draped contact through the alteration tops via
            GemPy; it interpolates a 0/1 "altered?" indicator and takes the 0.5 iso-surface, which is a
            closed envelope with no assumed up-direction. Runs in-app, no sidecar. */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Builds a closed halo envelope for one assemblage from the logged alteration intervals; unlike a contact, a halo has no \"up\". Runs in-app, no Python engine.")}</div>
        {alt_units.some((u) => isNotLogged(u)) && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("Not offered: {v} (intervals with no assemblage logged).", { v: alt_units.filter((u) => isNotLogged(u)).map((u) => `"${u}"`).join(", ") })}</div>}
        {(altCustomLayers.length > 0 || altNumericFields.length > 0 || altVocabFields.length > 0 || (storeLayers.vein || []).length > 0) && ( // TASKS.csv #1574 — which log, and an intensity floor; vein: #2050
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {(altCustomLayers.length > 0 || (storeLayers.vein || []).length > 0 || (storeLayers.litho || []).length > 0) && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                <span style={{ flexShrink: 0 }}>{tr("Layer")}</span>
                <select aria-label={tr("Alteration layer")} value={altSource.layer} onChange={(e) => { setAltSource({ layer: e.target.value, field: "", min: "" }); setAlterationTarget(""); }} style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }}>
                  <option value="alt">{altEmpty ? tr("Alteration (none logged)") : tr("Alteration")}</option>{/* #2540 (2) */}
                  {(storeLayers.vein || []).length > 0 && <option value="vein">{tr("Veins (a vein set as an envelope)")}</option>}{/* #2050 */}
                  {(storeLayers.litho || []).length > 0 && <option value="litho">{tr("Lithology (a code set as an envelope)")}</option>}{/* #2226 */}
                  {(storeLayers.weath || []).length > 0 && <option value="weath">{tr("Weathering (a code set as an envelope)")}</option>}{/* #2529 */}
                  {altCustomLayers.map((c) => <option key={c.id} value={`custom:${c.id}`}>{tr("{name} (custom layer)", { name: c.name })}</option>)}
                </select>
              </label>
            )}
              {altSource.layer === "alt" && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }} title={tr("For a log that records alteration only where seen: rock logged in Lithology between its rows counts as unaltered, closing the halo there. Off: that rock is unknown.")}><input type="checkbox" checked={!!altSource.unloggedZero} onChange={(e) => setAltSource((x) => ({ ...x, unloggedZero: e.target.checked }))} />{tr("Count logged rock with no alteration row as unaltered")}</label>}{/* #2380 */}
            {(altNumericFields.length > 0 || altVocabFields.length > 0) && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("Only the intervals whose field is at or above this value become altered samples; the rest count as unaltered, which is what closes the halo.")}>
                <span style={{ flexShrink: 0 }}>{tr("Only where")}</span>
                <select aria-label={tr("Intensity field")} value={altSource.field} onChange={(e) => { const f = e.target.value, v = altVocabFields.find((x) => x.field === f); setAltSource((s) => ({ ...s, field: f, vocab: !!v, min: v ? String(v.levels[Math.min(1, v.levels.length - 1)].rank) : s.min, minLabel: v ? v.levels[Math.min(1, v.levels.length - 1)].label : null })); }} style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }}>
                  <option value="">{tr("(no filter)")}</option>
                  {altNumericFields.map((f) => <option key={f} value={f}>{f}</option>)}
                  {altVocabFields.map((v) => <option key={v.field} value={v.field}>{`${v.field} (${v.levels.map((l) => l.label).join(" / ")})`}</option>)}{/* #2230 */}
                </select>
                <span>≥</span>
                {altVocab ? (
                  <select aria-label={tr("At least")} value={altSource.min} onChange={(e) => { const label = e.target.selectedOptions[0]?.text || null; setAltSource((s) => ({ ...s, min: e.target.value, minLabel: label })); }} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }}>
                    {[...new Map(altVocab.levels.map((l) => [l.rank, l])).values()].map((l) => <option key={l.rank} value={String(l.rank)}>{altVocab.levels.filter((x) => x.rank === l.rank).map((x) => x.label).join(" / ")}</option>)}
                  </select>
                ) :
                <NumberInput aria-label={tr("At least")} allowEmpty value={altSource.min === "" || altSource.min == null ? null : altSource.min} disabled={!altSource.field} onChange={(v) => setAltSource((s) => ({ ...s, min: v == null ? "" : String(v) }))} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }} />}
              </label>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Code")} value={alterationTarget} onChange={(e) => setAlterationTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>{/* "Code", not "Assemblage": #1574 — Lawyers' Alteration log holds oxidation forms */}
            <option value="">{tr("Choose a code…")}</option>
            {altSourceCodes.map((u) => (altLoggedM.get(u) > 0 ? <option key={u} value={u}>{altGroupOf.get(u) ? tr("{code} (in the group {group})", { code: u, group: altGroupOf.get(u) }) : u}</option> : <option key={u} value={u} disabled>{tr("{code} (no logged length)", { code: u })}</option>))}{/* #1421; #1740 — 'Unknown' is not an assemblage; #1574 — the chosen layer's codes */}
            {/* TASKS.csv #3876 (#3767) — from Lithology, a group is one unit ('mcode:<group>': its rows by their effective code, as the run reads a Modelling code) */}
            {altGroups.length > 0 && <optgroup label={tr("Groups")}>{altGroups.map((g) => <option key={g.name} value={`mcode:${g.name}`}>{g.name} [{g.codes.join("+")}]</option>)}</optgroup>}
          </select>
          <button
            onClick={() => runAlterationModel(alterationTarget, { unloggedZero: altSource.layer === "alt" && !!altSource.unloggedZero } /* #2380 */, altSource.layer === "alt" && !altSource.field ? null : { layer: altSource.layer, field: altSource.field || null, min: altSource.field ? Number(altSource.min) : null, vocab: !!(altSource.field && altSource.vocab), minLabel: altSource.minLabel || null /* #2230 */ })}
            disabled={!alterationTarget || alterationBusy}
            title={tr("Build a closed alteration-halo envelope from the logged intervals (runs in-app)")}
            aria-label={tr("Build a closed alteration-halo envelope from the logged intervals (runs in-app)")}
            className="gs-btn gs-btn--block" style={{ width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", gap: 5, opacity: alterationTarget && !alterationBusy ? 1 : 0.5, cursor: alterationTarget && !alterationBusy ? "pointer" : "default" }}
          >{alterationBusy ? <span style={{ fontSize: "var(--font-size-sm)" }}>…</span> : <><Layers3 size={14} />{tr("Build halo")}</>}</button>{/* #1421 — the only run control was an unlabelled icon */}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Grid cell size for the indicator interpolation. 0 = auto (about 1/8 of the search radius).")}>{tr("Cell size (m)")}<NumberInput min={0} value={alterationCellSize} onChange={(v) => setAlterationCellSize(v)} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("Search radius for the indicator interpolation, and how far past the outermost altered sample the envelope may close. 0 = auto (about 1.2x the median hole spacing).")}>{tr("Search (m)")}<NumberInput min={0} value={alterationSearchRadius} onChange={(v) => setAlterationSearchRadius(v)} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("0 = auto (from your hole spacing). The model domain and the structural trend chosen for alteration halos (Model settings → Structural trends) apply; the search ellipsoid's neighbour filter does not.")}</div>
        {alterationBusy && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)", marginTop: -4, marginBottom: 8 }}>{tr("Building the halo envelope…")}</div>}

        {/* TASKS.csv #144 — vein/dyke tool. The copy here deliberately states what the construction can
            and cannot do (paired by construction; thickness between holes is interpolated), because a
            vein drawn from a handful of intercepts looks far more certain on screen than it is. */}
        </>)}
  </>);
}
