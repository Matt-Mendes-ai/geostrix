// TASKS.csv #1625 — the ground the Maps tab's plan (components/MapsPlanView.jsx) covers: every visible raster, the terrain, map layers,
// boundaries, collars and surface samples. null when there is nothing to draw (the tab keeps its card).
export function planDataExtent({ rasters = [], terrain, mapLayers = [], boundaries = [], collars = [], surfaceSamples = [] }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const box = (b) => { if (!b) return; if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; };
  const pt = (p) => { if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) box([p.x, p.y, p.x, p.y]); };
  rasters.forEach((r) => r.visible !== false && box(r.bbox));
  if (terrain) box(terrain.bbox);
  mapLayers.forEach((l) => l.visible !== false && box(l.bbox));
  boundaries.forEach((b) => b.visible !== false && (b.polylines || []).forEach((pl) => pl.forEach(pt)));
  collars.forEach(pt);
  surfaceSamples.forEach(pt);
  return Number.isFinite(x0) && x1 >= x0 ? [x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1)] : null;
}
