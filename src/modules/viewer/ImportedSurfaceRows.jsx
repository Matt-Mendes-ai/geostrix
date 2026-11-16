// TASKS.csv #3762 (Scottie Gold review: four DXF isosurfaces dropped on the 3D View were drawn there but had no row, no legend entry and one shared
// grey; show / hide, zoom and remove lived only in the 3D Modelling tab) — the imported surfaces (generatedSurfaces of type 'imported') as rows of the
// 3D View sidebar's 'Boundaries and models': an eye, the colour it is drawn in, its name, zoom to it and remove. The same functions the Modelling
// tab's rows call. Colours come from the drawn meshes (implicitMeshesRef), as the legend's do.
import React from "react";
import { Eye, EyeOff, Maximize2, Trash2 } from "../../components/icons.js";
import { iconAction, activateOnKey } from "../../lib/a11y.js";
import { t as tr } from "../../lib/i18n.js";

export const isImportedSurface = (s) => s?.type === "imported";
export const surfaceHex = (mesh) => (mesh?.material?.color ? `#${mesh.material.color.getHexString()}` : null);

export default function ImportedSurfaceRows({ surfaces, meshesRef, labels, toggle, zoom, remove, confirmRemove }) {
  const list = (surfaces || []).filter(isImportedSurface);
  if (!list.length) return null;
  return list.map((s) => {
    const name = labels?.get?.(s.id) ?? s.name, hex = surfaceHex(meshesRef?.current?.[s.id]);
    return (
      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => toggle(s.id)} aria-label={tr("Show or hide {name}", { name })} aria-pressed={!!s.visible} style={{ cursor: "pointer", color: s.visible ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0, display: "flex" }}>
          {s.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </div>
        <span aria-hidden="true" title={hex || ""} style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: hex || "var(--color-text-muted)", border: "1px solid var(--color-border)" }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tr("{vertexCount} vertices, {faceCount} faces", { vertexCount: s.vertexCount, faceCount: s.faceCount })}>{name}</span>
        <span style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", flexShrink: 0 }}>{tr("imported surface")}</span>
        <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => zoom(s.id), tr("Zoom to surface \"{name}\"", { name: s.name }))} />
        <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (confirmRemove(s)) remove(s.id); }, tr("Remove surface \"{name}\"", { name: s.name }))} />
      </div>
    );
  });
}
