// TASKS.csv #1535 (review #1497, Lawyers) — a 3D View theme keeps the visibility (and opacity) of rasters, block models and map
// layers. A theme saved with the three rasters and the MVI voxel model hidden put nothing back when applied: applyTheme never
// touched them, and a Layout viewport bound to the theme showed whatever rasters happened to be on.
//
// Only ids the theme lists are touched (an object imported after the theme is left as it is, as #52 does for generated surfaces);
// listed ids no longer in the project are returned by name for one notice.

const NAME_CAP = 200;

export function objectVisibilityBundle({ rasters = [], voxelModels = [], mapLayers = [] } = {}) {
  const objectNames = {};
  const map = (list, withOpacity) => Object.fromEntries((list || []).filter((o) => o?.id != null).map((o) => {
    objectNames[o.id] = String(o.name || o.id).slice(0, NAME_CAP);
    return [o.id, withOpacity && Number.isFinite(o.opacity) ? { visible: o.visible !== false, opacity: o.opacity } : { visible: o.visible !== false }];
  }));
  return { rasterVisible: map(rasters, true), voxelVisible: map(voxelModels, false), mapLayerVisible: map(mapLayers, true), objectNames };
}

export function applyObjectVisibility(theme, { rasters = [], voxelModels = [], mapLayers = [], updateRaster, updateVoxelModel, updateMapLayer } = {}) {
  const missing = [];
  const run = (saved, list, update) => {
    if (!saved || typeof saved !== "object" || !update) return;
    const byId = new Map((list || []).map((o) => [o.id, o]));
    for (const [id, s] of Object.entries(saved)) {
      const o = byId.get(id);
      if (!o) { missing.push(theme.objectNames?.[id] || id); continue; }
      const patch = {};
      if ((o.visible !== false) !== !!s.visible) patch.visible = !!s.visible;
      if (Number.isFinite(s.opacity) && s.opacity !== o.opacity) patch.opacity = s.opacity;
      if (Object.keys(patch).length) update(id, patch);
    }
  };
  run(theme?.rasterVisible, rasters, updateRaster);
  run(theme?.voxelVisible, voxelModels, updateVoxelModel);
  run(theme?.mapLayerVisible, mapLayers, updateMapLayer);
  return missing;
}
