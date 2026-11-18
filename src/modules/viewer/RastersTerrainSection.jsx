// TASKS.csv #3891 — 'Rasters & terrain' first in the 3D View's sidebar (above Geometry), moved out of ViewerModule.jsx unchanged (its #1084 size
// cap): the heading, the terrain card, each raster's row and legend. Shown only when the project has a raster or a terrain. The sidebar is shared
// by the 3D View, Geological Mapping, 3D Modelling, Targeting and Mine Design tabs, so it moves in all of them; the order is fixed, never saved.
// User request (the block's own history): rasters / terrain show up as toggleable layer rows here too, not just inside the Geophysics module's
// import panel, and only once something has been imported.
import React from "react";
import { Eye, EyeOff, Image, Maximize2, ArrowUpRight, Trash2 } from "../../components/icons.js";
import { t as tr } from "../../lib/i18n.js";
import { iconAction, activateOnKey } from "../../lib/a11y.js";
import { confirmDestructive } from "../../lib/confirmDestructive.js";
import { lazyPart } from "../../lib/lazyModal.jsx";
import TerrainCard from "./TerrainCard.jsx";
import DetailTilesToggle from "./DetailTilesToggle.jsx"; // #3252
import MiddleName from "../../components/MiddleName.jsx"; // #2852
const RasterLegend = lazyPart(() => import("../../components/RasterLegend.jsx")); // TASKS.csv #2011; startup size: only where a raster is listed

export default function RastersTerrainSection({ rasters, terrain, updateTerrain, updateRaster, removeRaster, openRowMenu, zoomToObject, terrainMeshRef, rasterMeshesRef, goToModule, lodTiles }) {
  if (!(rasters.length > 0 || terrain)) return null;
  return (
    <>
      <div className="ge-section-label">{tr("Rasters & terrain")}</div>{/* #3891: the first heading, no top margin (Geometry takes it) */}
      {terrain && <TerrainCard terrain={terrain} updateTerrain={updateTerrain} openRowMenu={openRowMenu} zoomTo={() => zoomToObject(terrainMeshRef.current)} goToModule={goToModule} lodTiles={lodTiles} />}{/* viewer/TerrainCard.jsx (moved out at the #1084 cap) */}
      {rasters.map((r) => (<React.Fragment key={r.id}>{/* fragment: #2011 — the legend under the row */}
        <div onContextMenu={(e) => openRowMenu(e, r.name, [
            { label: r.visible === false ? "Show" : "Hide", onClick: () => updateRaster(r.id, { visible: r.visible === false }) },
            { label: tr("Zoom to"), onClick: () => zoomToObject(rasterMeshesRef.current[r.id]) },
            "-", { label: tr("Drape and elevation — Maps tab"), onClick: () => goToModule("maps") },
            { label: tr("Remove…"), onClick: () => { if (confirmDestructive(tr("Remove raster \"{name}\"?", { name: r.name }))) removeRaster(r.id); } }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
          <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateRaster(r.id, { visible: r.visible === false })} style={{ cursor: "pointer", color: r.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
            {r.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
          </div>
          <Image size={14} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />
          <MiddleName name={r.name} style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)" }} />{/* #2852 */}
          <Maximize2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => zoomToObject(rasterMeshesRef.current[r.id]), tr("Zoom to \"{name}\"", { name: r.name }))} />{/* #2080 */}
          <input
            type="range" min={0.1} max={1} step={0.05} value={r.opacity ?? 0.85}
            onChange={(e) => updateRaster(r.id, { opacity: Number(e.target.value) })}
            style={{ width: 46, flexShrink: 0 }} title={tr("Opacity")}
          />
          {/* User request ("I wanna be able to edit them from there"): jump to the full raster
              editor (drape mode terrain/flat, fixed elevation) — the sidebar row only has room
              for the two quick controls every layer type gets (visibility + opacity), same as
              the Geophysics section's own ArrowUpRight pattern right below this one. */}
          <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("maps"), tr("Edit drape mode / elevation for this raster in the Raster tab"))} />
          <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (confirmDestructive(tr("Remove raster \"{name}\"?", { name: r.name }))) removeRaster(r.id); }, tr("Remove raster \"{name}\"", { name: r.name }))} />{/* #1088 — confirmed like its menu's Remove… (rasters are not undoable) */}
        </div>
        <RasterLegend raster={r} updateRaster={updateRaster} compact />
        {r.lod && r.drapeMode === "terrain" && <DetailTilesToggle kind="imagery" on={lodTiles.prefs.imagery} chosen onChange={(v) => lodTiles.setPref("imagery", v)} />}{/* #3252 */}
      </React.Fragment>))}
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 10 }}>{tr("Managed under Maps: colours, drape and elevation.")}</div>
    </>
  );
}
