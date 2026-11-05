// Point in polygon tests, split out of geoprocessing.js (TASKS.csv #903) so the 3D View can use them without loading
// d3-delaunay at startup. Pure, no dependencies.

// TASKS.csv #124 — QGIS-specialist audit finding: "No way to select all collars within a polygon...
// A generic spatial 'select by location' against boundaries/rasters ... is missing." Standard
// ray-casting point-in-polygon test (even-odd rule) — doesn't need the loop pre-closed (an edge from
// the last vertex back to the first is implicit in the loop below regardless of whether the source
// data repeats it), same "don't require callers to pre-close a real .ply/.dxf boundary" tolerance
// boundaryAreaHectares above already has.
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// A boundary can have multiple parts (a non-contiguous claim, or a real multi-polygon .ply/.dxf export). TASKS.csv #1976 — a part
// lying inside another part is a hole (and a part inside a hole an island), as boundaryAreaHectares counts them since #1970: a
// point is inside when the most deeply nested part holding it sits at an even depth. Parts that overlap without nesting both
// stay depth 0, so their overlap is inside. Each part's depth and bounding box are worked out once per shape and kept.
const ringCache = new WeakMap();
function ringsOf(polylines) {
  let rings = ringCache.get(polylines);
  if (rings) return rings;
  rings = [];
  for (const pts of polylines) {
    if (!pts || pts.length < 3) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const p = pts[i];
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      a += (pts[j].x - p.x) * (pts[j].y + p.y);
    }
    rings.push({ pts, x0, y0, x1, y1, area: Math.abs(a / 2), depth: 0 });
  }
  const box = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  rings.forEach((r) => { const { x, y } = r.pts[0]; r.depth = rings.filter((o) => o !== r && o.area > r.area && box(o, x, y) && pointInPolygon(x, y, o.pts)).length; });
  ringCache.set(polylines, rings);
  return rings;
}
export function pointInBoundary(x, y, polylines) {
  if (!polylines?.length) return false;
  let deepest = -1;
  for (const r of ringsOf(polylines)) if (r.depth > deepest && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1 && pointInPolygon(x, y, r.pts)) deepest = r.depth;
  return deepest >= 0 && deepest % 2 === 0;
}
