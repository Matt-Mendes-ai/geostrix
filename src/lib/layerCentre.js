// TASKS.csv #3503 (from #3353 (2)) — where a layer is, for the message that says how far Maps > A layer moved it: the middle of its extent, read from the
// kinds of object that carry x / y (the others have none: no sentence). Pure.
const finite = Number.isFinite;

// the middle of [x0, y0, x1, y1] points / boxes
function middleOf(boxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { if (!b) continue; if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; }
  return x1 >= x0 && y1 >= y0 && finite(x0) && finite(y0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
}
const ptBox = (p) => (finite(p?.x) && finite(p?.y) ? [p.x, p.y, p.x, p.y] : null);
const okBox = (b) => (Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(finite) ? b : null);

// kind / id as the Maps layer pane lists them; state: the store's { collars, plannedHoles, layers, surfaceSamples, rasters, terrain, boundaries, mapLayers }
export function layerCentre(kind, id, state = {}) {
  switch (kind) {
    case "drillholes": return middleOf((state.collars || []).map(ptBox));
    case "plannedHoles": return middleOf((state.plannedHoles || []).map(ptBox));
    case "surfaceSamples": return middleOf((state.surfaceSamples || []).map(ptBox));
    case "survey": return middleOf(((state.layers || {}).geophys_pts || []).filter((r) => (r._src || "unnamed") === id).map(ptBox));
    case "rasters": return middleOf([okBox((state.rasters || []).find((r) => r.id === id)?.bbox)]);
    case "terrain": return middleOf([okBox(state.terrain?.bbox)]);
    case "mapLayers": return middleOf([okBox((state.mapLayers || []).find((l) => l.id === id)?.bbox)]);
    case "boundaries": return middleOf(((state.boundaries || []).find((b) => b.id === id)?.polylines || []).flatMap((pl) => (pl || []).map(ptBox)));
    default: return null;
  }
}

// metres between two points, and the sentence's pieces
export const distanceM = (a, b) => (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null);
const num = (v) => Math.round(v).toLocaleString("en-US");
// "E 500,000 N 6,000,000" (grid numbers: not translated)
export const eastNorth = (p) => `E ${num(p.x)} N ${num(p.y)}`;
export const distanceText = (m) => (m >= 10000 ? `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} km` : m >= 1000 ? `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} km` : `${Math.round(m).toLocaleString("en-US")} m`);
