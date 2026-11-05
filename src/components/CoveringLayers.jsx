// TASKS.csv #1823 (review #1646, Kodiak) — the Surface Geology tab had no layer list: the resistivity and chargeability models
// (and rasters) drawn over its map could only be hidden from the 3D View tab. A short list of what else is drawn, each with a
// show / hide tick, under Map layers. Same visible flag the 3D View's layer panel sets.
import React from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";

export default function CoveringLayers() {
  const { voxelModels = [], updateVoxelModel, rasters = [], updateRaster } = useStore();
  const items = [
    ...voxelModels.map((v) => ({ id: v.id, name: v.property ? `${v.name} — ${v.property}` : v.name, kind: tr("Block model"), visible: v.visible !== false, set: (on) => updateVoxelModel(v.id, { visible: on }) })),
    ...rasters.map((r) => ({ id: r.id, name: r.name, kind: tr("Raster"), visible: r.visible !== false, set: (on) => updateRaster(r.id, { visible: on }) })),
  ];
  if (!items.length) return null;
  const shown = items.filter((i) => i.visible).length;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="ge-section-label" style={{ marginBottom: 4 }}>{tr("Also drawn over the map")}</div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 4 }}>{tr("Block models and rasters can hide the map in the view. Untick one to see the map under it; the 3D View's layer list shows the same setting.")}</div>
      {items.map((i) => (
        <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text)", padding: "2px 0" }}>
          <input type="checkbox" checked={i.visible} onChange={(e) => i.set(e.target.checked)} aria-label={tr("Show {name}", { name: i.name })} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={i.name}>{i.name}</span>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{i.kind}</span>
        </label>
      ))}
      {items.length > 1 && <button type="button" onClick={() => items.forEach((i) => i.set(shown === 0))} style={{ marginTop: 4, fontSize: "var(--font-size-sm)", padding: "2px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg-subtle)", color: "var(--color-text)", cursor: "pointer" }}>{shown === 0 ? tr("Show all") : tr("Hide all")}</button>}
    </div>
  );
}
