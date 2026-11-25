// TASKS.csv #4070 — the Stratigraphic stack pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "stack"` test inside
// is ModellingPanes' own, kept as it was.
import { ChevronDown, ChevronUp, Layers, Layers3, X } from "../../../components/icons.js";
import MoreFold from "../../../components/MoreFold.jsx";
import StepPane, { StepChoices, StepNumbers } from "../../../components/StepPane.jsx";
import { iconAction } from "../../../lib/a11y.js";
import { t as tr } from "../../../lib/i18n.js";
import { isCrossCuttingRole, roleForLithology } from "../../../lib/layers.js";
import { stackResult } from "../../../lib/paneSteps.js";
import { pBtn, smallSel } from "../../../lib/sidebarStyles.js";
import AddAllUnits from "../AddAllUnits.jsx";
import RemoveAllUnits from "../RemoveAllUnits.jsx";
import SortByHoles from "../SortByHoles.jsx";
import { Fragment } from "react";

export default function StackPane({ addAllC, addAllOpen, addAllStart, addStackUnit, clusterNote, collars, emptyPaneHint, faultCandidates, faultK, gempyTitle, holesPlan, implicitBusy, implicitSurfaces, includeSectionContacts, isLithoGroupKey, isMcodeKey, layers, leftOutNote, lithoGroupCrossCuts, lithoGroupKey, lithoGroupRole, lithoGroups, litho_units, mcodeNames, mcodeRole, modellingCodeList, moveStackUnit, paneHeader, rawRole, removeStackUnit, resolveLithoTarget, runStackModel, sections, setAddAllOpen, setIncludeSectionContacts, setStackAdd, setStackBreaks, setStackFaultOffsets, setStackFaults, setStackMethod, setStackRelation, setStackUnits, stackAdd, stackBreaks, stackCodesOf, stackFaultOffsets, stackFaults, stackHoles, stackMethod, stackRelation, stackUnits, toolPane, twinInStack, unitRank }) {
  return (<>
{toolPane === "stack" && (<>
        {paneHeader("Stratigraphic stack", Layers, "model", true /* #4070 */)}
        {(() => { /* TASKS.csv #4070 (Matt's layout C) — the stack as steps: 1 Units (youngest first), 2 Faults, 3 Method -> Run, 4 Result in numbers; the
             explanations moved to the choices' tooltips and Help */
          const sr = stackResult(implicitSurfaces), cake = stackMethod === "layercake", packages = stackBreaks.some((b) => stackUnits.slice(0, -1).includes(b));
          const m = (x) => (x == null ? "—" : `${x} m`);
          return (
            <StepPane id="stack" label={tr("Stratigraphic stack")}
              top={<>{clusterNote(true) /* #3268; one line (#4070) */}
                {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the StrixViewer tab (Add layer › Lithology), or load the sample project."))}</>}
              steps={[
                { key: "units", label: tr("Units"), question: tr("Which units, youngest first?"), body: (<>
        {leftOutNote}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{/* #4022: wraps rather than squeeze the list to "Add a" */}
          <select aria-label={tr("Add a unit to the stack")} value={stackAdd} onChange={(e) => { addStackUnit(e.target.value); setStackAdd(""); }} style={{ width: 0, flex: "1 1 120px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Add a unit…")}</option>
            {/* TASKS.csv #241 — cross-cutting units (fault/dyke/breccia) are hidden here, not just
                warned about in the paragraph above: they break the tool's own non-crossing guarantee,
                so they're unselectable rather than trusting the user to read the warning first. */}
            {/* TASKS.csv #1541 — a code whose group is already in the stack, or a group with a member already in it, is not offered: the
                same unit twice ('Intermediate volcanics' after two of its members) */}
            {(unitRank ? [...litho_units].sort((a, b) => (unitRank.get(a) ?? 1e9) - (unitRank.get(b) ?? 1e9)) : litho_units).filter((u) => !mcodeRole.has(u) && !stackUnits.includes(u) && !isCrossCuttingRole(rawRole(u)) && rawRole(u) !== "no recovery" && !lithoGroups.some((g) => stackUnits.includes(lithoGroupKey(g)) && (g.codes || []).includes(u))).map((u) => { // no recovery: #1369; #2532: the role set in Modelling codes, the code offered there once
              const role = rawRole(u);
              return <option key={u} value={u}>{u}{role === "overburden" ? tr(" (overburden)") : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups with ANY cross-cutting member are excluded here, same rail as
                a raw cross-cutting code just above. */}
            {lithoGroups.some((g) => !mcodeNames.has(g.name) && !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g) && !(g.codes || []).some((c) => stackUnits.includes(c))) && (
              <optgroup label={tr("Groups")}>
                {lithoGroups.filter((g) => !mcodeNames.has(g.name) /* #3876 (#3767): offered as its Modelling codes twin */ && !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g) && !(g.codes || []).some((c) => stackUnits.includes(c))).map((g) => {
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || tr("no codes yet")}]{lithoGroupRole(g) === "overburden" ? tr(" (overburden)") : ""}</option>;
                })}
              </optgroup>
            )}
            {/* TASKS.csv #599 — intrusion / cross-cutting / ignored codes break the stack's non-crossing rule: not offered */}
            {modellingCodeList.some((c) => !stackUnits.includes(`mcode:${c.name}`) && !twinInStack(c.name) && (c.role === "stratigraphic" || c.role === "overburden")) && (
              <optgroup label={tr("Modelling codes")}>
                {modellingCodeList.filter((c) => !stackUnits.includes(`mcode:${c.name}`) && !twinInStack(c.name) /* #3876 (#3767) */ && (c.role === "stratigraphic" || c.role === "overburden")).map((c) => <option key={c.name} value={`mcode:${c.name}`}>{c.name}{c.role === "overburden" ? tr(" (overburden)") : ""}</option>)}
              </optgroup>
            )}
          </select>
          <button type="button" aria-expanded={addAllOpen} onClick={() => setAddAllOpen((v) => !v)} className="gs-btn gs-btn--block" style={{ width: "auto", marginBottom: 0, flex: "0 0 auto" }} title={tr("Add every modelling code, every logged code or the codes with enough logged metres, already in the order the holes give. You see the order before anything changes.")}>{tr("Add all…")}</button>{/* #3999 */}
          <RemoveAllUnits stackUnits={stackUnits} setStackUnits={setStackUnits} setStackBreaks={setStackBreaks} pBtn={pBtn} />{/* #4022 */}
        </div>
        {stackUnits.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("No units added yet.")}</div>
        )}
        {addAllC && <AddAllUnits start={addAllStart} open={addAllOpen} setOpen={setAddAllOpen} stackUnits={stackUnits} setStackUnits={setStackUnits} rows={layers.litho || []} candidates={addAllC} codesOf={stackCodesOf} label={(u) => (isLithoGroupKey(u) ? resolveLithoTarget(u)?.name || u : isMcodeKey(u) ? u.slice(6) : u)} pBtn={pBtn} />}{/* #3999 */}
        {holesPlan && <SortByHoles stackUnits={stackUnits} plan={holesPlan} label={(u) => (isLithoGroupKey(u) ? resolveLithoTarget(u)?.name || u : isMcodeKey(u) ? u.slice(6) : u)} setStackUnits={setStackUnits} pBtn={pBtn} />}{/* #3994 */}
        {stackHoles && ( // TASKS.csv #2926 — checked as the units are added; the holes' order one click away
          <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>
            {tr("The holes give the order {order} (youngest first): {list}.", { order: (holesPlan?.order || stackHoles.order).map((u) => (isLithoGroupKey(u) ? resolveLithoTarget(u)?.name || u : isMcodeKey(u) ? u.slice(6) : u)).join(", "),
              list: stackHoles.conflicts.slice(0, 3).map((q) => tr("{older} is logged above {younger} in {against} of {of} holes that have both", { older: stackUnits[q.older].replace(/^mcode:/, ""), younger: stackUnits[q.younger].replace(/^mcode:/, ""), against: q.against, of: q.of })).join("; ") })}{" "}
            <button type="button" onClick={() => setStackUnits([...(holesPlan?.order || stackHoles.order)])} className="gs-btn gs-btn--block" style={{ width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 7px" }}>{tr("Use the order from the holes")}</button>
          </div>
        )}
        {stackUnits.map((u, i) => {
          // TASKS.csv #176 — a `group:` entry shows the group's name and gets a badge only when every
          // member shares the role (mixed => plain, no guessing); a since-deleted group is flagged.
          const grp = isLithoGroupKey(u) ? resolveLithoTarget(u) : null;
          const role = isLithoGroupKey(u) ? (grp ? lithoGroupRole(grp) : null) : isMcodeKey(u) ? (modellingCodeList.find((c) => c.name === u.slice(6))?.role ?? null) : roleForLithology(u);
          const display = isLithoGroupKey(u) ? (grp ? grp.name : "(deleted group)") : isMcodeKey(u) ? `${u.slice(6)} (code)` : u; // #599
          const hasBreak = stackBreaks.includes(u); // TASKS.csv #1309
          return (
          <Fragment key={u}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", width: 14, flexShrink: 0 }}>{i + 1}</span>
            {grp && <span style={{ width: 8, height: 8, borderRadius: 2, background: grp.color || "#8a7fbf", flexShrink: 0 }} title={tr("Group: {v}", { v: (grp.codes || []).join(" + ") })} />}
            <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: grp || !isLithoGroupKey(u) ? "var(--color-text)" : "var(--color-danger-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={grp ? tr("Group: {v}", { v: (grp.codes || []).join(" + ") }) : undefined}>{display}</div>
            {role === "overburden" && <span title={tr("Overburden — tagged as its own surface type (overburden_base) rather than an ordinary stratigraphic contact")} style={{ fontSize: "var(--font-size-xs)", color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("OB")}</span>}
            <ChevronUp size={14} style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, -1), tr("Move \"{u}\" up in the stratigraphic stack", { u: display }) /* #1378 */)} />
            <ChevronDown size={14} style={{ cursor: i === stackUnits.length - 1 ? "default" : "pointer", color: i === stackUnits.length - 1 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, 1), tr("Move \"{u}\" down in the stratigraphic stack", { u: display }))} />
            <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeStackUnit(u), tr("Remove \"{u}\" from the stratigraphic stack", { u: display }))} />
          </div>
          {/* TASKS.csv #2381 — no unconformity above the last unit: its top would follow the units above it, and no package starts below */}
          {i === stackUnits.length - 2 && !hasBreak && (
            <div style={{ textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-faint)", padding: "1px 0 3px", marginBottom: 4 }} title={tr("Model the last unit's top on its own (Implicit surface, or an Explicit surface from its logged tops): with nothing under it, no package starts there.")}>{tr("No unconformity above the last unit")}</div>
          )}
          {i < stackUnits.length - 1 && (i < stackUnits.length - 2 || hasBreak) && (
            <button data-btn-own="" type="button" aria-pressed={hasBreak} onClick={() => setStackBreaks((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]))}
              title={tr("Units above and below an unconformity are fitted as separate conformable packages. The top of the unit below it follows the upper package.")}
              style={{ display: "block", width: "100%", background: "none", border: "none", borderTop: hasBreak ? "2px dashed var(--color-accent)" : "none", padding: "1px 0 3px", marginBottom: 4, cursor: "pointer", textAlign: "center", fontSize: "var(--font-size-xs)", color: hasBreak ? "var(--color-accent-dark)" : "var(--color-text-muted)" }}>
              {hasBreak ? tr("Unconformity here (click to remove)") : tr("Mark an unconformity here")}
            </button>
          )}
          </Fragment>
          );
        })}
                </>) },
                { key: "faults", label: tr("Faults"), question: tr("Faults that offset it?"), hint: tr("Each fault is solved with the stack: contacts either side become offset blocks, not one surface ramped across it. Faults come from Structure planes, one per type and name.") /* #360 */, body: (<>
                  <div data-stack-faults="" />{/* #4033: the Guide's door lands here and focuses the list below */}
        <select value="" onChange={(e) => { const k = e.target.value; if (k && !stackFaults.includes(k) && stackFaults.length < 6) setStackFaults((p) => [...p, k]); }} style={{ ...smallSel, width: "100%", marginTop: 3 }} aria-label={tr("Add a fault that offsets the stack")}>
          <option value="">{faultCandidates.length ? tr("Add a fault…") : tr("No structure picks with dip / dip direction")}</option>
          {/* TASKS.csv #1225 — bedding and fractures are not faults: apart, for a geologist who knows a code the name does not show */}
          {[[true, tr("Named as faults")], [false, tr("Other structure types")]].map(([like, label]) => {
            const list = faultCandidates.filter((c) => !stackFaults.includes(c.key) && !!c.faultLike === like);
            return list.length ? <optgroup key={label} label={label}>{list.map((c) => <option key={c.key} value={c.key}>{c.built ? tr("{name} (from the Faults pane)", { name: c.label }) /* #4006 */ : c.id ? `${c.type} — ${c.id}` : tr("{type} (all picks)", { type: c.type })} · {c.built ? tr(c.n === 1 ? "{n} point" : "{n} points", { n: c.n }) : tr(c.n === 1 ? "{n} pick" : "{n} picks", { n: c.n })}{faultK[c.key] ? (faultK[c.key].random ? tr(" · k {k}, no preferred orientation", { k: Number(faultK[c.key].k).toFixed(1) }) : tr(" · k {k}", { k: Number.isFinite(faultK[c.key].k) ? Number(faultK[c.key].k).toFixed(0) : "∞" })) : ""}</option>)}</optgroup> : null;
          })}
        </select>
        {stackFaults.map((k, fi) => {
          // TASKS.csv #1054 — what this fault offsets: every unit (GemPy's default) or the units from one down (an erosional
          // stack: a cover laid down after the fault stays whole), and the faults listed after it that it also displaces
          const cfg = (stackFaultOffsets || {})[k] || {}, later = stackFaults.slice(fi + 1);
          const setCfg = (patch) => setStackFaultOffsets?.((p) => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }));
          const label = (x) => { const b = faultCandidates.find((c) => c.key === x && c.built); return b ? tr("{name} (from the Faults pane)", { name: b.label }) : x.startsWith("surf|") ? tr("Not in this project (left out)") : x.replace(/\|$/, " (all picks)").replace("|", " — "); }; // built: #4006 (a fault left over from another project, e.g. after #4030 per-tab faults, reads as not in this project)
          return (
          <div key={k} style={{ padding: "4px 8px", marginTop: 4, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(k)}</span>
              <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => setStackFaults((p) => p.filter((x) => x !== k)), tr("Remove fault \"{k}\" from the stack", { k }))} />
            </div>
            {(stackRelation === "erode" || stackBreaks.some((b) => stackUnits.includes(b))) && stackUnits.length > 1 && (
              <select value={cfg.from || ""} onChange={(e) => setCfg({ from: e.target.value })} style={{ ...smallSel, width: "100%", marginTop: 3 }} aria-label={tr("Units this fault offsets")} title={tr("Units younger than the chosen one were laid down after the fault and are not offset by it")}>
                <option value="">{tr("Offsets every unit")}</option>
                {stackUnits.slice(1).map((u) => <option key={u} value={u}>{tr("Offsets {unit} and the units below it", { unit: resolveLithoTarget(u)?.name || u })}</option>)}
              </select>
            )}
            {later.map((g) => (
              <label key={g} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={(cfg.faults || []).includes(g)} onChange={(e) => setCfg({ faults: e.target.checked ? [...(cfg.faults || []), g] : (cfg.faults || []).filter((x) => x !== g) })} />
                {tr("Also offsets the fault {fault}", { fault: label(g) })}
              </label>
            ))}
          </div>
          );
        })}
        {stackFaults.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3, lineHeight: 1.4 }}>{tr("Each fault runs through the whole model box (GemPy cannot end a fault where its picks stop). By default a fault offsets every unit and no other fault.")}</div>}
                </>) },
                { key: "method", label: tr("Method"), question: tr("How do the units lie?"), body: (<>{/* TASKS.csv #2905 — GemPy, or a layer-cake for a flat-lying pile (Matt's decision 2026-11-12) */}
                  <StepChoices label={tr("Stack method")} value={stackMethod} onChange={setStackMethod} columns={2} options={[
                    { value: "gempy", label: tr("Folded or steep"), title: tr("GemPy (implicit) — folded or steep ground") },
                    { value: "layercake", label: tr("Flat-lying"), title: `${tr("Layer-cake (flat-lying) — tops as elevation grids, kept in order")} ${tr("Layer-cake: the first top is an elevation grid through its picks, and each lower top is the one above minus the unit's thickness, so tops never cross. An unconformity starts a new layer-cake. A fault in the stack splits it into fault blocks, each a layer-cake of its own.")}` },
                  ]} />
                  {!cake && packages && <div style={{ fontSize: "var(--font-size-sm)", marginTop: 6 }} title={tr("Packages: units between unconformities stay parallel and each package truncates those below; a unit missing inside a package cannot pinch out. Surfaces flatten past their contacts: compare the predicted map with yours.")}>{tr("Packages between unconformities")}</div>}
                  {!cake && !packages && (<>
                    <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: "8px 0 4px" }} title={tr("Erode: each younger unit truncates everything below, and a unit missing in a hole pinches out there. Conformable: one shared field, so surfaces stay parallel and every unit keeps a thickness.")}>{tr("Unit relationship")}</div>
                    <StepChoices label={tr("Unit relationship")} value={stackRelation} onChange={setStackRelation} columns={2} options={[
                      { value: "erode", label: tr("Erode"), title: `${tr("Erode — younger units truncate older (unconformity)")} ${tr("Erosional: each unit truncates the ones beneath it. Right for an unconformity; wrong for a conformable volcanic pile, where it cuts contacts that should drape.")}` },
                      { value: "onlap", label: tr("Conformable"), title: `${tr("Conformable — one shared field (units keep a thickness everywhere, cannot pinch out)")} ${tr("Conformable: one shared field, so surfaces stay parallel and never cross. A unit missing in some holes cannot pinch out: use Erode for discontinuous units.")}}` },
                    ]} />
                  </>)}
                </>) },
              ]}
              action={{ label: implicitBusy ? tr("Building…") : tr(stackUnits.length === 1 ? "Build stack ({n} unit)" : "Build stack ({n} units)", { n: stackUnits.length }), onClick: () => runStackModel(stackUnits, { method: stackMethod }),
                disabled: stackUnits.length < 2 || implicitBusy, icon: <Layers3 size={14} />, title: gempyTitle(!collars.length ? tr("No holes with collars yet: import collars first.") : stackUnits.length < 2 ? tr("Choose at least two units for the stack first.") : null) }}
              result={{ key: sr?.runId ?? null, body: sr && <StepNumbers rows={[
                { label: tr("Surfaces"), value: sr.n.toLocaleString(), title: sr.names.join(", ") },
                { label: tr("Typical miss"), value: m(sr.typicalMissM), title: tr("How far the surfaces pass from the logged contacts, typically") },
                { label: tr("Worst miss"), value: m(sr.worstMissM) },
                sr.left ? { label: tr("Contacts left out"), value: `${sr.left.toLocaleString()} / ${sr.of.toLocaleString()}`, level: "some" } : null,
              ]} /> }}
              fineTune={<MoreFold summary={tr("Fine-tune…")} data-fine-tune="stack">
        {/* TASKS.csv #810 — the stack reads the same option; it had no checkbox, so drawn contacts were dropped unseen */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title={tr("Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points")}>
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />{tr("Include drawn cross-section contacts{v}", { v: sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : "" })}
        </label>
              </MoreFold>} />
          );
        })()}
        </>)}
  </>);
}
