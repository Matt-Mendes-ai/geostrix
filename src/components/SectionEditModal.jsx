// TASKS.csv #240 follow-up — user request: "edit a single section but also bulk edit a bunch of
// sections." Single- and bulk-edit share this exact same modal (bulk is just a selection with more
// than one id) — there's only one "what does this section actually show" implementation to keep
// correct, and it maps directly onto buildSectionPayload's `scope` param in ViewerModule.jsx.
// Always writes an EXPLICIT, complete scope object (never a partial patch) so the result is
// deterministic regardless of what the selected section(s) had before, rather than trying to compute
// some intersection/union of possibly-differing existing scopes across a bulk selection — the modal
// always starts from "everything included" (matching the pre-#240-scope default behavior) and the
// user unchecks what they don't want.
import React, { useState } from "react";
import StepDialog from "./StepDialog.jsx"; // TASKS.csv #4073 — the shared step shell (Escape and the focus trap, #238)
import { LAYER_META } from "../lib/layers.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import NumberInput from "./NumberInput.jsx"; // TASKS.csv #3926 — '0,05' and '0.05' both read

const SECTION_LAYER_KEYS = ["litho", "alt", "vein", "breccia", "weath", "structzone", "geotech", "recovery", "sg", "litho_gc", "alt_gc", "mnlgy", "magsusc", "structure"];

export default function SectionEditModal({ sectionCount, initialCorridor, voxelModels, onSave, onClose }) {
  const [at, setAt] = useState(0); // TASKS.csv #4073 — the step on screen
  const [layerKeys, setLayerKeys] = useState(new Set(SECTION_LAYER_KEYS));
  const [voxelModelIds, setVoxelModelIds] = useState(new Set((voxelModels || []).map((m) => m.id)));
  const [showTerrain, setShowTerrain] = useState(true);
  const [showCustomLayers, setShowCustomLayers] = useState(true);
  const [showAssays, setShowAssays] = useState(true);
  // Corridor: undefined means "don't change it" — only relevant when the user actually edits the
  // field; single-section edit shows the section's real current value as a starting point, bulk edit
  // starts blank (touching it applies the SAME width to every selected section, leaving it blank
  // leaves each section's own existing width untouched).
  const [corridor, setCorridor] = useState(sectionCount === 1 ? initialCorridor : "");

  const toggleLayer = (key) => setLayerKeys((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleVoxel = (id) => setVoxelModelIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setAllLayers = (on) => setLayerKeys(on ? new Set(SECTION_LAYER_KEYS) : new Set());
  const setAllVoxels = (on) => setVoxelModelIds(on ? new Set((voxelModels || []).map((m) => m.id)) : new Set());

  const save = () => {
    const scope = {
      layerKeys: Array.from(layerKeys),
      voxelModelIds: Array.from(voxelModelIds),
      showTerrain, showCustomLayers, showAssays,
    };
    const corridorValue = corridor !== "" && !isNaN(Number(corridor)) ? Number(corridor) : undefined;
    onSave(scope, corridorValue);
  };

  // TASKS.csv #4073 (Matt: "similar for all pop up windows"; "GeoStrix is too wordy") — two steps, one question each: the corridor width, then what the
  // section(s) show, with Save the last step's gold primary. The state lives here, not in a step, so going Back keeps every tick and the width. What a
  // section shows by default (everything visible in the 3D view) is in the Help card; a bulk edit keeps its seen line that a blank width changes nothing.
  const one = sectionCount === 1;
  const heading = tr("Edit {v}", { v: one ? tr("section") : tr("{sectionCount} sections", { sectionCount }) });
  const help = (
    <details open>
      <summary style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: 4 }}>{heading}</summary>
      <div style={note}>{tr("Choose what {v} {v2} when reopened: by default a section shows everything visible in the 3D view, unrelated content included.", { v: one ? tr("this section") : tr("these sections"), v2: one ? tr("shows") : tr("show") })}</div>
    </details>
  );
  const check = { display: "flex", alignItems: "center", gap: 6, padding: "3px 5px", fontSize: "var(--font-size-base)", color: "var(--color-text)", cursor: "pointer" };
  const steps = [
    { key: "corridor", label: tr("Width"), primary: { label: tr("Next") }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="section-edit-corridor" style={field}>{tr("Corridor width (m)")}</label>
        <NumberInput id="section-edit-corridor" allowEmpty min={0} value={corridor === "" ? null : corridor} onChange={(v) => setCorridor(v == null ? "" : String(v))} placeholder={sectionCount > 1 ? tr("(unchanged)") : ""} style={inp} />
        {sectionCount > 1 && <div style={note}>{tr("Leave blank to keep each section's own width.")}</div>}
      </div>
    ) },
    { key: "content", label: tr("Content"), primary: { label: tr("Save"), onClick: save }, render: () => (
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={field}>{tr("Layers")}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAllLayers(true)} style={linkText}>{tr("All")}</span>
              <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAllLayers(false)} style={linkText}>{tr("None")}</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 180, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
            {SECTION_LAYER_KEYS.map((key) => (
              <label key={key} style={check}>
                <input type="checkbox" checked={layerKeys.has(key)} onChange={() => toggleLayer(key)} />
                {LAYER_META[key]?.label || key}
              </label>
            ))}
          </div>
        </div>

        {(voxelModels || []).length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={field}>{tr("Voxel / block models")}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAllVoxels(true)} style={linkText}>{tr("All")}</span>
                <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setAllVoxels(false)} style={linkText}>{tr("None")}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto", padding: 4, border: "1px solid var(--color-border)", borderRadius: 6 }}>
              {voxelModels.map((m) => (
                <label key={m.id} style={check}>
                  <input type="checkbox" checked={voxelModelIds.has(m.id)} onChange={() => toggleVoxel(m.id)} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={check}>
            <input type="checkbox" checked={showTerrain} onChange={(e) => setShowTerrain(e.target.checked)} />{" "}{tr("Terrain elevation profile")}</label>
          <label style={check}>
            <input type="checkbox" checked={showCustomLayers} onChange={(e) => setShowCustomLayers(e.target.checked)} />{" "}{tr("Custom CSV layers")}</label>
          <label style={check}>
            <input type="checkbox" checked={showAssays} onChange={(e) => setShowAssays(e.target.checked)} />{" "}{tr("Assays")}</label>
        </div>
      </div>
    ) },
  ];

  return <StepDialog title={heading} onClose={onClose} steps={steps} at={at} onAt={setAt} help={help} width="min(520px, 92vw)" />;
}

const field = { fontSize: "var(--font-size-sm)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" };
const linkText = { fontSize: "var(--font-size-sm)", color: "var(--color-info)", cursor: "pointer" };
const note = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 };
const inp = { width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "7px 9px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
