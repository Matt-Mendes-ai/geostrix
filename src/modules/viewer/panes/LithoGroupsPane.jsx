// TASKS.csv #4070 — the Lithology groups pane of 3D Modelling, moved out of ModellingPanes.jsx VERBATIM by a script (Babel scope analysis): its props
// are exactly the identifiers of the moved JSX that ModellingPanes declares, module imports are re-imported, and what only it used moved with it.
// So the panes can be converted to steps (StepPane) in parallel without every change landing in one file. The `toolPane === "groups"` test inside
// is ModellingPanes' own, kept as it was.
import { ChevronDown, ChevronUp, Group, Trash2 } from "../../../components/icons.js";
import { activateOnKey, iconAction } from "../../../lib/a11y.js";
import { askConfirm } from "../../../lib/confirmDialog.js";
import { t as tr } from "../../../lib/i18n.js";
import { colorForLithology, groupMemberRole, groupNameHint } from "../../../lib/layers.js";
import { caseVariantGroups, groupOfCode, groupOverlaps, subdivisionGroups } from "../../../lib/lithoGroups.js";
import { pBtn } from "../../../lib/sidebarStyles.js";
import { lazy, Suspense } from "react";

const LithoSuggestBox = lazy(() => import("../../../components/LithoSuggestBox.jsx")); // TASKS.csv #2004

export default function LithoGroupsPane({ addLithoGroup, askPrompt, emptyPaneHint, expandedLithoGroupId, layers, lithoGroupCrossCuts, lithoGroupRole, lithoGroups, lithoUnitsAll, litho_units, paneHeader, removeLithoGroup, setExpandedLithoGroupId, toolPane, updateLithoGroup }) {
  return (<>
{toolPane === "groups" && (<>
        {paneHeader("Lithology groups", Group, "model")}
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the StrixViewer tab (Add layer › Lithology), or load the sample project."))}{/* TASKS.csv #3606 — said first, as Implicit surface does */}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{tr("Lithology groups")}</span>
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => askPrompt("New lithology group name:", "", (name) => { if (name && name.trim()) setExpandedLithoGroupId(addLithoGroup({ name: name.trim() })); })}
            style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", textTransform: "none", letterSpacing: 0 }} title={tr("New lithology group")}>{tr("+ New group")}</span>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Lump codes logged differently for the same real unit (e.g. andesite + basalt) into one modelled unit. Raw intervals keep their own colours in 3D.")}</div>
        {lithoGroups.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("No groups yet.")}</div>
        )}
        {(() => { // TASKS.csv #2386 — one unit logged in several spellings (case, spaces): offered as one group each, one click
          const sug = caseVariantGroups(layers.litho || [], lithoGroups);
          if (!sug.length) return null;
          const add = (s) => addLithoGroup({ name: s.name, codes: s.codes });
          return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.45, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr(sug.length === 1 ? "One code is logged in several spellings that differ only by case or spaces:" : "{n} codes are logged in several spellings that differ only by case or spaces:", { n: sug.length })}</div>
            {sug.slice(0, 8).map((s) => <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ flex: 1, minWidth: 0 }}>{tr("{codes} = {n} intervals", { codes: s.codes.map((c) => `${c} (${s.counts[c].toLocaleString()})`).join(" + "), n: s.total.toLocaleString() })}</span><button type="button" onClick={() => add(s)} className="gs-btn gs-btn--block" style={{ width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr("Group them")}</button></div>)}
            {sug.length > 1 && <button type="button" onClick={() => sug.forEach(add)} className="gs-btn gs-btn--block" style={{ width: "auto", marginBottom: 0, marginTop: 4, padding: "3px 8px" }}>{tr("Group all {n}", { n: sug.length })}</button>}
            {sug.length > 8 && <span style={{ marginLeft: 6 }}>{tr("({n} more not listed)", { n: sug.length - 8 })}</span>}
          </div>;
        })()}
        {(() => { // TASKS.csv #2928 (2) — sub-divided codes of one unit (DID_U / DID_M / DID_L beside DID): offered as one group each, one click
          const sug = subdivisionGroups(layers.litho || [], lithoGroups);
          if (!sug.length) return null;
          const add = (s) => addLithoGroup({ name: s.name, codes: s.codes });
          return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.45, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr(sug.length === 1 ? "One unit is logged in sub-divided parts (a part suffix such as _U, _M, _L):" : "{n} units are logged in sub-divided parts (a part suffix such as _U, _M, _L):", { n: sug.length })}</div>
            {sug.slice(0, 8).map((s) => <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ flex: 1, minWidth: 0 }}>{tr("{codes} = {n} intervals", { codes: s.codes.map((c) => `${c} (${s.counts[c].toLocaleString()})`).join(" + "), n: s.total.toLocaleString() })}</span>
              <button type="button" onClick={() => add(s)} title={tr("Model the parts as one unit, \"{name}\". Leave them apart when the parts are units of their own.", { name: s.name })} className="gs-btn gs-btn--block" style={{ width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr("Group as {name}", { name: s.name })}</button></div>)}
            {sug.length > 8 && <span>{tr("({n} more not listed)", { n: sug.length - 8 })}</span>}
          </div>;
        })()}
        <Suspense fallback={null}><LithoSuggestBox pBtn={pBtn} /></Suspense>{/* TASKS.csv #2004 — codes that name the same rock, proposed into groups from their meaning */}
        {groupOverlaps(lithoGroups).map((o) => ( // TASKS.csv #1685 — a saved project with a code in two groups: the tools would disagree
          <div key={o.code} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.4 }}>{tr("{code} is in {n} groups ({groups}): the tools would read different memberships. Click it in the group it belongs to, and it leaves the others.", { code: o.code, n: o.groups.length, groups: o.groups.join(", ") })}</div>
        ))}
        {lithoGroups.map((g) => {
          const open = expandedLithoGroupId === g.id;
          const codesInGroup = g.codes || [];
          const crossCuts = lithoGroupCrossCuts(g);
          const role = lithoGroupRole(g);
          return (
            <div key={g.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6, background: "var(--color-bg-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedLithoGroupId(open ? null : g.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0, display: "flex" }} title={open ? tr("Collapse") : tr("Choose which codes belong to this group")}>
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <input type="color" value={g.color || "#8a7fbf"} onChange={(e) => updateLithoGroup(g.id, { color: e.target.value })} title={tr("Surface / legend colour for this group")}
                  style={{ width: 20, height: 18, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                  onClick={() => askPrompt("Rename lithology group:", g.name, (name) => { if (name && name.trim()) updateLithoGroup(g.id, { name: name.trim() }); })} title={tr("Click to rename")}>
                  {g.name} <span style={{ color: "var(--color-text-muted)" }}>({codesInGroup.length})</span>
                </div>
                {crossCuts && <span title={tr("Contains a cross-cutting code (fault/dyke/breccia) — excluded from the Stratigraphic stack, same rail as a raw cross-cutting code")} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon)", background: "#f3e3e3", border: "1px solid #dcc2c2", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("X-cut")}</span>}
                {!crossCuts && role === "overburden" && <span title={tr("Every member is overburden — modelled as an overburden_base surface")} style={{ fontSize: "var(--font-size-xs)", color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("OB")}</span>}
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(async () => { if (await askConfirm(tr("Delete lithology group \"{name}\"? Its codes stay in the log — they just stop being modelled together.", { name: g.name }))) removeLithoGroup(g.id); }, tr("Delete lithology group \"{name}\" (its codes stay in the log, just ungrouped)", { name: g.name }))} />
              </div>
              {open && codesInGroup.length > 0 && ( /* TASKS.csv #2052 — one rule for the group's role, said here */
                <div style={{ padding: "0 8px 6px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                  {tr("Role: {role}, from its codes (Modelling codes, the implicit picker and the stack all read it).", { role: tr(groupMemberRole(g)) })}
                  {groupNameHint(g) && " " + tr("Its name suggests {role}: set that in Modelling codes if it is what you mean.", { role: tr(groupNameHint(g)) })}
                </div>
              )}
              {open && (
                <div style={{ padding: "0 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {lithoUnitsAll.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("No lithology codes loaded yet — import a litho CSV first.")}</div>}
                  {lithoUnitsAll.map((u) => {
                    const on = codesInGroup.includes(u);
                    const elsewhere = on ? null : groupOfCode(lithoGroups, u, g.id); // TASKS.csv #1685 — held by another group: a click moves it here
                    return (
                      <span role="button" tabIndex={0} onKeyDown={activateOnKey} key={u} onClick={() => updateLithoGroup(g.id, { codes: on ? codesInGroup.filter((c) => c !== u) : [...codesInGroup, u] })}
                        title={on ? tr("Remove {u} from this group", { u }) : elsewhere ? tr("In \"{group}\" — click to move it here", { group: elsewhere.name }) : tr("Add {u} to this group", { u })}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", padding: "2px 7px", borderRadius: 10, cursor: "pointer", userSelect: "none", opacity: elsewhere ? 0.55 : 1,
                          background: on ? "var(--color-success-bg)" : "var(--color-bg)", color: on ? "var(--color-success-text)" : "var(--color-text-secondary)", border: `1px ${elsewhere ? "dashed" : "solid"} ${on ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: colorForLithology(u), flexShrink: 0 }} />{u}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* TASKS.csv #139 — fence/panel diagram. Deliberately sits immediately ABOVE the implicit
            modelling tools because it is the lighter-weight companion to them: three holes on a line
            cannot support a GemPy surface but can absolutely support a hand correlation, and that is
            the stage of a project this answers. */}
        </>)}
  </>);
}
