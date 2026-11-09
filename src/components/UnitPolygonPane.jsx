// TASKS.csv #1439 (review #1352, Silvertip) — geology drawn in GeoStrix: unit polygons clicked in the 3D view (Top view works
// best), kept as a polygon map layer with a `unit` field, so Surface Geology > Model it can read a map drawn here and not only
// an imported one. The pane picks the layer and the unit, lists the polygons; the 3D view (ViewerModule) collects the clicks
// with the same drawing state the Interpretation lines pane uses. Polygons are written with lib/interpretation.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { Shapes, Trash2 } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { NEW_LAYER, uniqueLayerName, isDrawnGeologyLayer, geologyPolygonLayer, addUnitPolygon, removeUnitPolygon } from "../lib/interpretation.js";
import { activateOnKey } from "../lib/a11y.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";
import { planElevation, planElevationText } from "../lib/drapeElevation.js"; // TASKS.csv #2269

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)" };

// drawing: the 3D view's state { on, points: [{ x, y, z }], finishSeq }; onStart / onUndo / onCancel / onDone drive it.
export default function UnitPolygonPane({ drawing, onStart, onUndo, onCancel, onDone, onClose }) {
  const { mapLayers, addMapLayer, updateMapLayer, terrain, collars, survey, voxelModels, surfaceSamples } = useStore();
  // TASKS.csv #2269 — with no terrain the clicks land on the scene's origin plane: the map goes at a stated plan elevation instead
  const plan = useMemo(() => (terrain ? null : planElevation({ collars, survey, voxelModels, surfaceSamples })), [terrain, collars, survey, voxelModels, surfaceSamples]);
  const mine = useMemo(() => mapLayers.filter(isDrawnGeologyLayer), [mapLayers]);
  const [layerPick, setLayerPick] = useState("");
  const layerId = layerPick || mine[0]?.id || NEW_LAYER;
  const layer = mine.find((l) => l.id === layerId) || null;
  const [newName, setNewName] = useState("");
  const [unit, setUnit] = useState("");
  const [noteText, setNoteText] = useState("");
  const [msg, setMsg] = useState(null);
  const pts = drawing.points, n = pts.length;
  // the units already on any map layer with a unit-like field, so a drawn map reuses the legend's names
  const knownUnits = useMemo(() => {
    const s = new Set();
    for (const l of mapLayers) { const f = l.styleField || "unit"; for (const ft of l.features || []) { const v = ft.attributes?.[f]; if (v != null && v !== "") s.add(String(v)); } }
    return [...s].sort();
  }, [mapLayers]);

  const finish = () => {
    if (n < 3) { setMsg(tr("A polygon needs at least three points.")); return; }
    if (!unit.trim()) { setMsg(tr("Name the unit before finishing the polygon.")); return; }
    let target = layer, id = layerId;
    if (!target) {
      const fresh = geologyPolygonLayer(newName.trim());
      target = { ...fresh, name: uniqueLayerName(fresh.name, mapLayers) };
      id = addMapLayer(target); setLayerPick(id); setNewName("");
    }
    const next = addUnitPolygon(target, pts, { unit: unit.trim(), note: noteText.trim() }, plan ? { elevation: plan.z } : {});
    updateMapLayer(id, () => ({ ...next, id }));
    const f = next.features[next.features.length - 1];
    setNoteText(""); setMsg(tr("Added a {unit} polygon of {ha} ha to \"{layer}\".", { unit: f.attributes.unit, ha: (f.attributes.area_m2 / 10000).toFixed(2), layer: next.name }) + (plan ? " " + tr("It lies flat at {z} m RL (no terrain).", { z: Math.round(next.elevation).toLocaleString() }) : ""));
    onDone();
  };
  // a double-click in the 3D view ends the polygon (ViewerModule bumps finishSeq)
  const seen = useRef(drawing.finishSeq);
  useEffect(() => { if (drawing.finishSeq !== seen.current) { seen.current = drawing.finishSeq; if (drawing.on) finish(); } });

  const remove = (i) => { if (!layer) return; updateMapLayer(layer.id, () => ({ ...removeUnitPolygon(layer, i), id: layer.id })); };

  return (
    <>
      <TaskPaneHeader title={tr("Unit polygons")} helpId="unit-polygons" icon={Shapes} tone="data" onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={note}>{tr("Draw the outline of a map unit by clicking its corners in the 3D view (Top view works best); the last click joins the first. The polygons are a geology map layer with a unit field: it drapes on the terrain, exports as Shapefile or GeoPackage, prints in the Layout legend, and Model it can build a 3D model from it.")}</div>
        {plan && <div role="note" style={{ ...note, color: "var(--color-warn-text)" }}>{planElevationText(plan)}</div>}{/* #2269 */}
        <label style={row}>{tr("Layer")}
          <select value={layerId} onChange={(e) => setLayerPick(e.target.value)} style={{ ...smallSel, maxWidth: 170 }} aria-label={tr("Drawn geology layer")}>
            {mine.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.features.length})</option>)}
            <option value={NEW_LAYER}>{tr("New layer…")}</option>
          </select></label>
        {layerId === NEW_LAYER && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tr("Geology (drawn)")} aria-label={tr("New layer name")} style={{ ...smallSel, width: "100%", boxSizing: "border-box" }} />}
        <input value={unit} onChange={(e) => setUnit(e.target.value)} list="ge-unit-polygon-units" placeholder={tr("Unit (for example Basalt, Rhyolite)")} aria-label={tr("Unit")} style={{ ...smallSel, width: "100%", boxSizing: "border-box" }} />
        <datalist id="ge-unit-polygon-units">{knownUnits.map((u) => <option key={u} value={u} />)}</datalist>
        <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={tr("Note (optional)")} aria-label={tr("Polygon note")} style={{ ...smallSel, width: "100%", boxSizing: "border-box" }} />
        {!drawing.on ? (
          <button type="button" onClick={onStart} style={{ ...pBtn, justifyContent: "center", marginBottom: 0 }}>{tr("Draw a polygon")}</button>
        ) : (
          <div style={{ border: "1px solid var(--color-accent)", borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>{n ? tr("{n} corner(s). Click to add a corner; double-click or Finish to close the polygon.", { n }) : tr("Click the first corner of the unit.")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={finish} disabled={n < 3} style={{ ...pBtn, flex: 1, justifyContent: "center", marginBottom: 0, opacity: n < 3 ? 0.5 : 1 }}>{tr("Finish")}</button>
              <button type="button" onClick={onUndo} disabled={!n} style={{ ...pBtn, width: "auto", marginBottom: 0, opacity: n ? 1 : 0.5 }}>{tr("Undo point")}</button>
              <button type="button" onClick={onCancel} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Cancel")}</button>
            </div>
          </div>
        )}
        {msg && <div role="status" style={note}>{msg}</div>}
        {layer && layer.features.length > 0 && (
          <div>
            <div className="ge-section-label" style={{ marginTop: 6 }}>{tr("Polygons in \"{layer}\"", { layer: layer.name })}</div>
            {layer.features.map((f, i) => (
              <div key={i} style={{ ...row, padding: "4px 6px", borderBottom: "1px solid var(--color-divider)" }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: layer.categories.find((c) => c.value === f.attributes.unit)?.color || "#888", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={f.attributes.note || f.attributes.unit}>{f.attributes.unit}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{(f.attributes.area_m2 / 10000).toFixed(2)} ha</span>
                <Trash2 size={13} role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Remove polygon {v}", { v: i + 1 })} onClick={() => remove(i)} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} />
              </div>
            ))}
            <div style={{ ...note, marginTop: 4 }}>{tr("Show, hide, export or remove the whole layer under Map layers; colours under Maps → Map layers.")}</div>
          </div>
        )}
      </div>
    </>
  );
}
