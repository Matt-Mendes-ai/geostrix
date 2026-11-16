// TASKS.csv #3829 — Maps plan > Layers on the plan: the project's block models and surfaces, each with its footprint / outline as a boundary and a level
// slice (a model, in its own colours) or cut (a surface) at an RL, so the holes can be read against an IP model or an isosurface on the plan (lib/planModels.js).
import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { f32ToB64 } from "../lib/inversion.js";
import { ringArea } from "../lib/planSurveys.js";
import { modelExtent, modelFootprintBoundary, modelLevelSlice, sliceColours, propertyUnit, surfaceOutlineBoundary, surfaceCutBoundary } from "../lib/planModels.js";

const btn = { fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 };
const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString(undefined, { maximumSignificantDigits: 4 }) : "—");

export default function PlanModelsList() {
  const { voxelModels = [], generatedSurfaces = [], collars = [], addBoundary, addRaster } = useStore();
  const [rlText, setRlText] = useState("");
  const [note, setNote] = useState(null);
  const meanRl = useMemo(() => { const z = collars.map((c) => c.z).filter(Number.isFinite); return z.length ? Math.round(z.reduce((a, b) => a + b, 0) / z.length) : null; }, [collars]);
  const ha = (ring) => (ringArea(ring) / 1e4).toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (!voxelModels.length && !generatedSurfaces.length) return null;
  const rl = rlText === "" ? meanRl : Number(rlText);
  const say = (text) => setNote(text);
  const needRl = () => { if (Number.isFinite(rl)) return false; say(tr("Type a level (RL, m).")); return true; };
  const outlineModel = (m) => {
    const b = modelFootprintBoundary(m);
    if (!b) { say(tr("{name} has no cells.", { name: m.name })); return; }
    addBoundary(b); say(tr("Added \"{name}\" to Boundaries: the footprint of {n} cells, {ha} ha.", { name: b.name, n: (modelExtent(m)?.n || 0).toLocaleString(), ha: ha(b.polylines[0]) }));
  };
  const sliceModel = (m) => {
    if (needRl()) return;
    const s = modelLevelSlice(m, rl);
    if (s.error === "empty") { say(tr("{name} has no cells.", { name: m.name })); return; }
    if (s.error === "outside") { say(tr("{name} lies between RL {lo} m and {hi} m: there is no slice at {rl} m.", { name: m.name, lo: Math.round(s.zmin).toLocaleString(), hi: Math.round(s.zmax).toLocaleString(), rl })); return; }
    const col = sliceColours(m, s.values), c = document.createElement("canvas");
    c.width = s.nx; c.height = s.ny;
    const g = c.getContext("2d"), img = g.createImageData(s.nx, s.ny);
    img.data.set(col.rgba); g.putImageData(img, 0, 0);
    const unit = propertyUnit(m.property || m.params?.property);
    addRaster({
      name: `${m.name} at RL ${rl} m`, bbox: s.bbox, dataUrl: c.toDataURL("image/png"), elevation: rl, drapeMode: "flat", ...(unit ? { unit } : {}),
      colourRange: [col.lo, col.hi], colourStops: col.stops,
      grid: { nx: s.nx, ny: s.ny, x0: s.x0, yTop: s.yTop, dx: s.dx, dy: s.dy, values: f32ToB64(s.values), valid: s.valid },
      provenance: { tool: `Level slice of the block model "${m.name}" at RL ${rl} m (the cells that hold the level, ${s.dx} m x ${s.dy} m nodes, the model's own colours)` },
    });
    say(tr("Added \"{name} at RL {rl} m\" to the rasters: {n} cells, {cell} m nodes, {lo} to {hi}{unit}. The colours are the model's own.", { name: m.name, rl, n: s.cells.toLocaleString(), cell: Math.round(s.dx * 10) / 10, lo: fmt(col.lo), hi: fmt(col.hi), unit: unit ? ` ${unit}` : "" }) + (s.coarsened ? " " + tr("The grid was made coarser to keep it light.") : ""));
  };
  const outlineSurface = (sf) => {
    const b = surfaceOutlineBoundary(sf);
    if (!b) { say(tr("{name}: too few vertices for an outline.", { name: sf.name })); return; }
    addBoundary(b); say(tr("Added \"{name}\" to Boundaries: the convex hull of {n} vertices, {ha} ha.", { name: b.name, n: Math.floor((sf.vertices?.length || 0) / 3).toLocaleString(), ha: ha(b.polylines[0]) }));
  };
  const cutSurface = (sf) => {
    if (needRl()) return;
    const b = surfaceCutBoundary(sf, rl);
    if (!b) { say(tr("{name} does not reach RL {rl} m.", { name: sf.name, rl })); return; }
    addBoundary(b); say(tr("Added \"{name}\" to Boundaries: {n} line(s) from {m} cut segments.", { name: b.name, n: b.polylines.length.toLocaleString(), m: b.segments.toLocaleString() }));
  };
  return (
    <div style={{ marginTop: 5, borderTop: "1px solid var(--color-border)", paddingTop: 3, display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontWeight: 600 }}>{tr("Block models and surfaces")}</span>
      <label style={{ display: "flex", alignItems: "center", gap: 5 }}>{tr("Level (RL, m)")}<input type="number" value={rlText} placeholder={meanRl == null ? "" : String(meanRl)} onChange={(e) => setRlText(e.target.value)} aria-label={tr("Level of the slice or cut, as an RL in metres")} style={{ width: 70, fontSize: "var(--font-size-xs)" }} /></label>
      {voxelModels.map((m) => (
        <span key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.name}>{m.name}</span>
          <button type="button" style={btn} title={tr("Add the model's footprint (the rectangle round its cells) to Boundaries")} onClick={() => outlineModel(m)}>{tr("Outline as boundary")}</button>
          <button type="button" style={btn} title={tr("Add the cells that hold this level to the rasters, in the model's own colours")} onClick={() => sliceModel(m)}>{tr("Level slice to Maps")}</button>
        </span>
      ))}
      {generatedSurfaces.map((sf) => (
        <span key={sf.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ flex: "1 1 100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={sf.name}>{sf.name}</span>
          <button type="button" style={btn} title={tr("Add the surface's outline (the convex hull of its vertices) to Boundaries")} onClick={() => outlineSurface(sf)}>{tr("Outline as boundary")}</button>
          <button type="button" style={btn} title={tr("Add the lines where the surface crosses this level to Boundaries")} onClick={() => cutSurface(sf)}>{tr("Cut at the level")}</button>
        </span>
      ))}
      {note && <span role="status" style={{ color: "var(--color-text-muted)" }}>{note}</span>}
    </div>
  );
}
