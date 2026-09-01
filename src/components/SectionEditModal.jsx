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
import { X, Layers3 } from "lucide-react";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { LAYER_META } from "../lib/layers.js";

const SECTION_LAYER_KEYS = ["litho", "alt", "vein", "geotech", "recovery", "sg", "litho_gc", "alt_gc", "mnlgy", "magsusc", "structure"];

export default function SectionEditModal({ sectionCount, initialCorridor, voxelModels, onSave, onClose }) {
  useEscapeKey(onClose);
  useFocusTrap(); // TASKS.csv #238
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

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Layers3 size={16} style={{ color: "#55606e" }} />
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>
              Edit {sectionCount === 1 ? "section" : `${sectionCount} sections`}
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 11, color: "#55606e", lineHeight: 1.5 }}>
            Choose what {sectionCount === 1 ? "this section" : "these sections"} actually {sectionCount === 1 ? "shows" : "show"} when reopened — by default every section shows everything currently visible in the 3D view, which can pull in unrelated content (e.g. a large terrain profile behind a section meant to show one voxel model).
          </div>

          <div>
            <label style={{ ...field, marginBottom: 6 }}>
              Corridor width (m) {sectionCount > 1 && <span style={{ color: "#94a1b0", fontWeight: 400 }}>— leave blank to keep each section's own width</span>}
            </label>
            <input type="number" min="0" value={corridor} onChange={(e) => setCorridor(e.target.value)} placeholder={sectionCount > 1 ? "(unchanged)" : ""} style={inp} />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={field}>Layers</span>
              <div style={{ display: "flex", gap: 8 }}>
                <span onClick={() => setAllLayers(true)} style={linkText}>All</span>
                <span onClick={() => setAllLayers(false)} style={linkText}>None</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, maxHeight: 180, overflowY: "auto", padding: 4, border: "1px solid #d9dce1", borderRadius: 6 }}>
              {SECTION_LAYER_KEYS.map((key) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 5px", fontSize: 11.5, color: "#1a2028", cursor: "pointer" }}>
                  <input type="checkbox" checked={layerKeys.has(key)} onChange={() => toggleLayer(key)} />
                  {LAYER_META[key]?.label || key}
                </label>
              ))}
            </div>
          </div>

          {(voxelModels || []).length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={field}>Voxel / block models</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <span onClick={() => setAllVoxels(true)} style={linkText}>All</span>
                  <span onClick={() => setAllVoxels(false)} style={linkText}>None</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 120, overflowY: "auto", padding: 4, border: "1px solid #d9dce1", borderRadius: 6 }}>
                {voxelModels.map((m) => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 5px", fontSize: 11.5, color: "#1a2028", cursor: "pointer" }}>
                    <input type="checkbox" checked={voxelModelIds.has(m.id)} onChange={() => toggleVoxel(m.id)} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#1a2028", cursor: "pointer" }}>
              <input type="checkbox" checked={showTerrain} onChange={(e) => setShowTerrain(e.target.checked)} /> Terrain elevation profile
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#1a2028", cursor: "pointer" }}>
              <input type="checkbox" checked={showCustomLayers} onChange={(e) => setShowCustomLayers(e.target.checked)} /> Custom CSV layers
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#1a2028", cursor: "pointer" }}>
              <input type="checkbox" checked={showAssays} onChange={(e) => setShowAssays(e.target.checked)} /> Assays
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Cancel</button>
          <button onClick={save} style={{ ...btn(true), flex: 2 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(480px, 92vw)", maxHeight: "86vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const field = { fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0" };
const linkText = { fontSize: 10.5, color: "#4a9be0", cursor: "pointer" };
const inp = { width: "100%", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "7px 9px", color: "#1a2028", fontSize: 12, fontFamily: "inherit" };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
