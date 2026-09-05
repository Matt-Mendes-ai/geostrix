import React, { useMemo, useState } from "react";
import { X, Milestone, CheckSquare, Square, Download, Circle, Layers, Plus, Trash2 } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #84 — geological architecture layer 3 (drillhole -> geological-boundary intercepts as
// explicit control points). `intercepts` is computed fresh by ViewerModule's computeIntercepts() every
// time this modal opens (derived from layers.litho/layers.alt + the current desurveyed traces, not its
// own stored table — see interceptId's comment in ViewerModule.jsx). Excluding an intercept here doesn't
// touch the underlying imported interval data at all; it only keeps that one row's position from being
// sent to the implicit-modelling tools as a control point (gatherLithoSurfaceSpec / runAlterationModel
// both check excludedIntercepts before adding a point) — the same review-then-exclude workflow #52's
// own follow-up note asked for.
// TASKS.csv #88 — the "soft constraint" toggle: a point marked soft still feeds the run, but with a
// real GemPy nugget value instead of the default near-zero one, so the fitted surface is only
// APPROXIMATELY pulled toward it rather than forced exactly through it — useful for a pick you trust
// less (ambiguous logging, a suspect assay) without excluding it outright.
// TASKS.csv #52 (c) — NAMED INTERCEPT SETS. Exclusion (the first column) is a project-wide statement
// about a pick: "this log is wrong, never use it". A SET is a per-run statement: "these picks are the
// UPPER basalt, those are the lower one". The repeated-unit case #61 flagged needs the second, because
// one logged code appearing at several levels in the pile is one code and several surfaces, and without
// sets every pick of it anywhere on the property is forced onto a single surface.
// The set column only appears once a set has been created and selected for editing, so the table is
// unchanged for anyone not using the feature.
export default function BoundaryInterceptsModal({ intercepts, excludedIntercepts, softIntercepts, onToggle, onToggleSoft, onCancel,
  interceptSets = [], onAddSet, onRenameSet, onDeleteSet, onToggleInSet, onSetMembership }) {
  useEscapeKey(onCancel); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [layerFilter, setLayerFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [holeFilter, setHoleFilter] = useState("");
  const [editingSetId, setEditingSetId] = useState("");
  const [newSetName, setNewSetName] = useState("");
  const editingSet = interceptSets.find((x) => x.id === editingSetId) || null;
  const memberSet = useMemo(() => new Set(editingSet ? editingSet.ids || [] : []), [editingSet]);

  const units = useMemo(() => Array.from(new Set(intercepts.map((i) => i.unit))).sort(), [intercepts]);
  const excludedSet = useMemo(() => new Set(excludedIntercepts), [excludedIntercepts]);
  const softSet = useMemo(() => new Set(softIntercepts), [softIntercepts]);

  const shown = useMemo(() => intercepts.filter((i) =>
    (layerFilter === "all" || i.layerKey === layerFilter) &&
    (unitFilter === "all" || i.unit === unitFilter) &&
    (!holeFilter || i.hole_id.toLowerCase().includes(holeFilter.toLowerCase()))
  ), [intercepts, layerFilter, unitFilter, holeFilter]);

  const excludedCount = intercepts.filter((i) => excludedSet.has(i.id)).length;
  const softCount = intercepts.filter((i) => softSet.has(i.id)).length;

  const exportCsv = () => {
    const header = "layer,hole_id,unit,from_m,x,y,z,excluded,soft\n";
    const body = intercepts.map((i) => [i.layerLabel, i.hole_id, i.unit, i.from, i.x.toFixed(2), i.y.toFixed(2), i.z.toFixed(2), excludedSet.has(i.id) ? "yes" : "no", softSet.has(i.id) ? "yes" : "no"].join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "boundary_intercepts.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Milestone size={16} color="#55606e" />
            <div style={{ fontSize: 15, color: "var(--color-accent-dark)", fontWeight: 600 }}>Boundary intercepts</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onCancel} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.5 }}>
            Every lithology/alteration interval's top — the same control points the implicit-modelling
            tools already read on the Modeling tab — resolved to a real 3D position along each hole's
            desurveyed trace. Uncheck one to exclude it from feeding a surface without touching the
            imported data itself; re-check to bring it back. Click the circle to mark a point "soft" —
            it still feeds the run, but only approximately honoured (a real GemPy nugget tolerance, not
            just a label) rather than forced through exactly. {intercepts.length} total
            {excludedCount > 0 ? `, ${excludedCount} excluded` : ""}
            {softCount > 0 ? `, ${softCount} soft` : ""}.
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <select value={layerFilter} onChange={(e) => { setLayerFilter(e.target.value); setUnitFilter("all"); }} style={{ ...sel, flex: 1 }}>
              <option value="all">All layers</option>
              <option value="litho">Lithology</option>
              <option value="alt">Alteration</option>
              <option value="vein">Vein / dyke</option>
            </select>
            <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} style={{ ...sel, flex: 1 }}>
              <option value="all">All units</option>
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input value={holeFilter} onChange={(e) => setHoleFilter(e.target.value)} placeholder="Hole ID…" style={{ ...sel, flex: 1 }} />
          </div>

          {/* TASKS.csv #52 (c) — set editor. */}
          <div style={{ border: "1px solid var(--color-border-subtle)", borderRadius: 6, padding: 8, marginBottom: 10, background: "var(--color-bg-inset)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Layers size={13} color="#55606e" />
              <div style={{ fontSize: 11.5, color: "var(--color-text-strong)", fontWeight: 600 }}>Intercept sets</div>
            </div>
            <div style={{ fontSize: 10.5, color: "var(--color-text-secondary)", lineHeight: 1.45, marginBottom: 7 }}>
              A named subset of these picks, so a unit that repeats in the pile can be modelled as the
              separate surfaces it actually is instead of every pick of that code feeding one surface.
              Build a set here, then choose it on the Modeling tab to restrict a run to it. Sets are
              saved with the project, and they exclude nothing: a pick left out of the active set is
              simply not used by that run.
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <select value={editingSetId} onChange={(e) => setEditingSetId(e.target.value)} style={{ ...sel, flex: 1 }}>
                <option value="">— no set being edited —</option>
                {interceptSets.map((x) => <option key={x.id} value={x.id}>{x.name} ({(x.ids || []).length})</option>)}
              </select>
              {editingSet && (
                <button onClick={() => { const n = window.prompt("Rename set", editingSet.name); if (n && n.trim()) onRenameSet?.(editingSet.id, n.trim()); }} style={miniBtn} title="Rename this set">Rename</button>
              )}
              {editingSet && (
                <button onClick={() => { if (window.confirm(`Delete the set "${editingSet.name}"? The intercepts themselves are untouched.`)) { onDeleteSet?.(editingSet.id); setEditingSetId(""); } }} style={{ ...miniBtn, color: "var(--color-danger-icon)" }} title="Delete this set">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={newSetName} onChange={(e) => setNewSetName(e.target.value)} placeholder="New set name…"
                onKeyDown={(e) => { if (e.key === "Enter" && newSetName.trim() && onAddSet) { const id = onAddSet(newSetName.trim()); setNewSetName(""); if (id) setEditingSetId(id); } }}
                style={{ ...sel, flex: 1 }} />
              <button disabled={!newSetName.trim()} onClick={() => { if (newSetName.trim() && onAddSet) { const id = onAddSet(newSetName.trim()); setNewSetName(""); if (id) setEditingSetId(id); } }}
                style={{ ...miniBtn, opacity: newSetName.trim() ? 1 : 0.5 }}><Plus size={12} /> Create</button>
            </div>
            {editingSet && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={() => onSetMembership?.(editingSet.id, shown.map((i) => i.id), true)} style={miniBtn}>Add the {shown.length} shown</button>
                <button onClick={() => onSetMembership?.(editingSet.id, shown.map((i) => i.id), false)} style={miniBtn}>Remove the {shown.length} shown</button>
                <span style={{ fontSize: 10.5, color: "var(--color-text-secondary)" }}>{(editingSet.ids || []).length} intercept(s) in this set.</span>
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <div style={{ padding: "16px 10px", textAlign: "center", color: "var(--color-text-muted)", fontSize: 12 }}>
              {intercepts.length === 0 ? "No litho/alteration intervals loaded yet." : "No intercepts match the current filters."}
            </div>
          ) : (
            <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "var(--color-bg)" }}>
                    <th style={th}></th>
                    <th style={th} title="Soft constraint — feeds the model but only approximately honoured"></th>
                    {editingSet && <th style={th}>Set</th>}
                    <th style={th}>Layer</th>
                    <th style={th}>Hole</th>
                    <th style={th}>Unit</th>
                    <th style={th}>From (m)</th>
                    <th style={th}>X / Y / Z</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => {
                    const excluded = excludedSet.has(i.id);
                    const soft = softSet.has(i.id);
                    return (
                      <tr key={i.id} style={{ borderTop: "1px solid var(--color-border-subtle)", opacity: excluded ? 0.45 : 1 }}>
                        <td style={{ ...td, cursor: "pointer" }} onClick={() => onToggle(i.id)} title={excluded ? "Excluded — click to include" : "Included — click to exclude"}>
                          {excluded ? <Square size={13} color="#55606e" /> : <CheckSquare size={13} color="#7fd9c9" />}
                        </td>
                        <td style={{ ...td, cursor: excluded ? "default" : "pointer" }} onClick={() => !excluded && onToggleSoft(i.id)} title={soft ? "Soft (approximate) — click to make hard again" : "Hard (exact) — click to make soft"}>
                          {soft ? <Circle size={11} color="#e2a63c" fill="#e2a63c" /> : <Circle size={11} color="#c7ccd3" />}
                        </td>
                        {editingSet && (
                          <td style={{ ...td, cursor: "pointer" }} onClick={() => onToggleInSet?.(editingSet.id, i.id)} title={memberSet.has(i.id) ? "In the set being edited — click to remove" : "Not in the set being edited — click to add"}>
                            {memberSet.has(i.id) ? <CheckSquare size={13} color="#8a6a1f" /> : <Square size={13} color="#c7ccd3" />}
                          </td>
                        )}
                        <td style={td}>{i.layerLabel}</td>
                        <td style={td}>{i.hole_id}</td>
                        <td style={td}>{i.unit}</td>
                        <td style={td}>{i.from.toFixed(1)}</td>
                        <td style={{ ...td, color: "var(--color-text-secondary)" }}>{i.x.toFixed(0)}, {i.y.toFixed(0)}, {i.z.toFixed(0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={exportCsv} disabled={!intercepts.length} style={{ ...rerunBtn, opacity: intercepts.length ? 1 : 0.5 }}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(720px, 92vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const th = { textAlign: "left", padding: "6px 8px", color: "#94a1b0", fontWeight: 500, position: "sticky", top: 0, background: "var(--color-bg)" };
const td = { padding: "5px 8px", color: "#2a3340", whiteSpace: "nowrap" };
const miniBtn = { display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 9px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "#1a2028", fontSize: 11, cursor: "pointer", fontFamily: "inherit" };
const rerunBtn = { display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "#1a2028", fontSize: 12, cursor: "pointer" };
