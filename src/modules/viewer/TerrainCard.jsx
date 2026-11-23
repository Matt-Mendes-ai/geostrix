// The terrain's row under 'Rasters & terrain' in the 3D View's sidebar, moved out of ViewerModule.jsx unchanged (its #1084 size cap) when the
// detail-tile switch (#3252) came to sit under it.
import React from "react";
import { Eye, EyeOff, Mountain, ArrowUpRight } from "../../components/icons.js";
import { t as tr } from "../../lib/i18n.js";
import { requestModuleAction } from "../../lib/menuRequests.js"; // TASKS.csv #4042
import { iconAction, activateOnKey } from "../../lib/a11y.js";
import DetailTilesToggle from "./DetailTilesToggle.jsx"; // TASKS.csv #3252
import { tiledTerrain } from "./useLodTiles.js";
import { terrainColour, TERRAIN_GREY } from "../../lib/terrainColour.js"; // TASKS.csv #3947

export default function TerrainCard({ terrain, updateTerrain, openRowMenu, zoomTo, goToModule, lodTiles = null }) { // lodTiles: #3252 (the 'Detail tiles' switch)
  return (<>
    <div onContextMenu={(e) => openRowMenu(e, terrain.name, [
        { label: terrain.visible === false ? "Show" : "Hide", onClick: () => updateTerrain?.({ visible: terrain.visible === false }) },
        { label: tr("Zoom to"), onClick: () => zoomTo() },
        { label: tr("Plan stream sites…"), onClick: () => { goToModule("geochem"); requestModuleAction("plan-stream-sites", { tab: "streams" }); } }, // TASKS.csv #4042
        "-", { label: tr("Colour, drape and remove — Maps tab"), onClick: () => goToModule("maps") }])} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
      <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => updateTerrain?.({ visible: terrain.visible === false })} style={{ cursor: "pointer", color: terrain.visible !== false ? "var(--color-accent)" : "var(--color-text-disabled)", flexShrink: 0 }}>
        {terrain.visible !== false ? <Eye size={14} /> : <EyeOff size={14} />}
      </div>
      {/* TASKS.csv #3947 — the colour picked; the default grey as its darker line, which reads on the panel (the grey itself is 2:1 on white) */}
      <Mountain size={14} style={{ color: terrainColour(terrain) === TERRAIN_GREY ? "var(--color-terrain-line)" : terrainColour(terrain), flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{terrain.name}</span>
      <input
        type="range" min={0.1} max={1} step={0.05} value={terrain.opacity ?? 1}
        onChange={(e) => updateTerrain?.({ opacity: Number(e.target.value) })}
        style={{ width: 46, flexShrink: 0 }} title={tr("Opacity")}
      />
      {/* Color/opacity are also editable right here inline (terrain has no other exotic
          settings the way rasters' drape-mode/elevation do), but the jump still goes to
          Geophysics — that's where SRTM/DEM was imported from and where "Remove terrain"
          lives — for consistency with every other row's edit-jump icon. */}
      <ArrowUpRight size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => goToModule("maps"), tr("Edit or remove the terrain in the Maps tab"))} />
    </div>
    {lodTiles && tiledTerrain(terrain) && <DetailTilesToggle kind="terrain" on={lodTiles.prefs.terrain} chosen={lodTiles.prefs.terrainChosen} offReason={lodTiles.offReason} onChange={(v) => lodTiles.setPref("terrain", v)} />}
  </>);
}
