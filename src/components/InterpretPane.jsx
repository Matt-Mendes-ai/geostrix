// TASKS.csv #1152 — interpretation lines drawn over a geophysics survey in the 3D view, kept as a map layer per survey.
// The pane chooses the layer, the survey and the line's attributes and lists the lines; the 3D view (ViewerModule)
// collects the clicks and passes them here. Lines are written with lib/interpretation.js.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { PenTool, Trash2 } from "./icons.js";
import { useStore } from "../lib/store.jsx";
import { surveyKey } from "../lib/geophysSurveys.js";
import { INTERPRETATION_TYPES, CONFIDENCE, NEW_LAYER, chooseLayerId, uniqueLayerName, typeLabel, isInterpretationLayer, interpretationLayer, addInterpretationLine, removeInterpretationLine, lineLengthM } from "../lib/interpretation.js";
import { activateOnKey } from "../lib/a11y.js";
import { pBtn, smallSel } from "../lib/sidebarStyles.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const row = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between", fontSize: "var(--font-size-sm)" };

// drawing: the 3D view's state { on, points: [{ x, y, z }], finishSeq }; onStart / onUndo / onCancel / onDone drive it.
// presetSurvey: the survey a Geophysics-tab button named (TASKS.csv #1152), or null.
export default function InterpretPane({ drawing, onStart, onUndo, onCancel, onDone, presetSurvey, onClose }) {
  const { mapLayers, addMapLayer, updateMapLayer, layers, geophysSurveys, rasters } = useStore();
  const surveys = useMemo(() => {
    const keys = new Set(Object.keys(geophysSurveys || {}));
    (layers.geophys_pts || []).forEach((r) => keys.add(surveyKey(r)));
    return [...[...keys].sort(), ...(rasters || []).map((r) => r.name)];
  }, [geophysSurveys, layers.geophys_pts, rasters]);
  const mine = useMemo(() => mapLayers.filter(isInterpretationLayer), [mapLayers]);
  const [survey, setSurvey] = useState(presetSurvey || "");
  useEffect(() => { if (presetSurvey) setSurvey(presetSurvey); }, [presetSurvey]);
  const [layerPick, setLayerPick] = useState("");
  const layerId = chooseLayerId(layerPick, mine, survey);
  const layer = mine.find((l) => l.id === layerId) || null;
  const [newName, setNewName] = useState("");
  const [type, setType] = useState("fault");
  const [name, setName] = useState("");
  const [confidence, setConfidence] = useState("probable");
  const [noteText, setNoteText] = useState("");
  const [msg, setMsg] = useState(null);
  const pts = drawing.points, n = pts.length;

  const finish = () => {
    if (n < 2) { setMsg(tr("A line needs at least two points.")); return; }
    const attrs = { name: name.trim(), type, survey, confidence, note: noteText.trim() };
    let target = layer, id = layerId;
    if (!target) {
      const fresh = interpretationLayer(newName.trim(), survey);
      target = { ...fresh, name: uniqueLayerName(fresh.name, mine) }; // TASKS.csv #1157
      id = addMapLayer(target); setLayerPick(id); setNewName("");
    }
    const next = addInterpretationLine(target, pts, attrs);
    updateMapLayer(id, () => ({ ...next, id }));
    setName(""); setNoteText(""); setMsg(tr("Added \"{name}\" to \"{layer}\" ({m} m).", { name: next.features[next.features.length - 1].attributes.name, layer: next.name, m: Math.round(lineLengthM(pts)).toLocaleString() }));
    onDone();
  };
  // a double-click in the 3D view ends the line (ViewerModule bumps finishSeq)
  const seen = useRef(drawing.finishSeq);
  useEffect(() => { if (drawing.finishSeq !== seen.current) { seen.current = drawing.finishSeq; if (drawing.on) finish(); } });

  const remove = (i) => { if (!layer) return; updateMapLayer(layer.id, () => ({ ...removeInterpretationLine(layer, i), id: layer.id })); };

  return (
    <>
      <TaskPaneHeader title={tr("Interpretation lines")} icon={PenTool} tone="analyse" onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={note}>{tr("Draw faults, contacts and lineaments over a survey in the 3D view (Top view works best). Each set of lines is a map layer: it drapes on the terrain, exports as Shapefile, GeoPackage, KML or DXF, and prints in the Layout legend.")}</div>
        <label style={row}>{tr("Survey")}
          <select value={survey} onChange={(e) => { setSurvey(e.target.value); setLayerPick(""); }} style={{ ...smallSel, maxWidth: 170 }} aria-label={tr("Survey the lines are drawn on")}>
            <option value="">{tr("(none named)")}</option>
            {surveys.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
        <label style={row}>{tr("Layer")}
          <select value={layerId} onChange={(e) => setLayerPick(e.target.value)} style={{ ...smallSel, maxWidth: 170 }} aria-label={tr("Interpretation layer")}>
            {mine.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.features.length})</option>)}
            <option value={NEW_LAYER}>{tr("New layer…")}</option>
          </select></label>
        {layerId === NEW_LAYER && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={survey ? tr("Interpretation — {survey}", { survey }) : tr("Interpretation")} aria-label={tr("New layer name")} style={{ ...smallSel, width: "100%", boxSizing: "border-box" }} />}
        <label style={row}>{tr("Line type")}
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...smallSel, maxWidth: 170 }} aria-label={tr("Line type")}>
            {INTERPRETATION_TYPES.map((t) => <option key={t.value} value={t.value}>{tr(t.label)}</option>)}
          </select></label>
        <label style={row}>{tr("Confidence")}
          <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={{ ...smallSel, maxWidth: 170 }} aria-label={tr("Confidence")}>
            {CONFIDENCE.map((c) => <option key={c} value={c}>{tr(c)}</option>)}
          </select></label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Name (optional)")} aria-label={tr("Line name")} style={{ ...smallSel, width: "100%", boxSizing: "border-box" }} />
        <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={tr("Note (optional)")} aria-label={tr("Line note")} style={{ ...smallSel, width: "100%", boxSizing: "border-box" }} />
        {!drawing.on ? (
          <button type="button" onClick={onStart} style={{ ...pBtn, justifyContent: "center", marginBottom: 0 }}>{tr("Draw a line")}</button>
        ) : (
          <div style={{ border: "1px solid var(--color-accent)", borderRadius: 6, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)" }}>{n ? tr("{n} point(s), {m} m. Click to add a point; double-click or Finish to end the line.", { n, m: Math.round(lineLengthM(pts)).toLocaleString() }) : tr("Click the first point on the survey.")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={finish} disabled={n < 2} style={{ ...pBtn, flex: 1, justifyContent: "center", marginBottom: 0, opacity: n < 2 ? 0.5 : 1 }}>{tr("Finish")}</button>
              <button type="button" onClick={onUndo} disabled={!n} style={{ ...pBtn, width: "auto", marginBottom: 0, opacity: n ? 1 : 0.5 }}>{tr("Undo point")}</button>
              <button type="button" onClick={onCancel} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Cancel")}</button>
            </div>
          </div>
        )}
        {msg && <div role="status" style={note}>{msg}</div>}
        {layer && layer.features.length > 0 && (
          <div>
            <div className="ge-section-label" style={{ marginTop: 6 }}>{tr("Lines in \"{layer}\"", { layer: layer.name })}</div>
            {layer.features.map((f, i) => (
              <div key={i} style={{ ...row, padding: "4px 6px", borderBottom: "1px solid var(--color-divider)" }}>
                <span style={{ display: "inline-block", width: 10, height: 3, background: layer.categories.find((c) => c.value === f.attributes.type)?.color || "#888", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${f.attributes.name} · ${typeLabel(f.attributes.type)} · ${f.attributes.confidence}${f.attributes.survey ? ` · ${f.attributes.survey}` : ""}${f.attributes.note ? `\n${f.attributes.note}` : ""}`}>{f.attributes.name}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{f.attributes.length_m.toLocaleString()} m</span>
                <Trash2 size={13} role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Remove line \"{name}\"", { name: f.attributes.name })} onClick={() => remove(i)} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} />
              </div>
            ))}
            <div style={{ ...note, marginTop: 4 }}>{tr("Show, hide, export or remove the whole layer under Map layers; colours under Geophysics → Map layers.")}</div>
          </div>
        )}
      </div>
    </>
  );
}
