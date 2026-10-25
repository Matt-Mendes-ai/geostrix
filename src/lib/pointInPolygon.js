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

// A boundary can have multiple parts (a non-contiguous claim, or a real multi-polygon .ply/.dxf
// export) — a point counts as "inside the boundary" if it's inside ANY one part, matching how
// boundaryAreaHectares above treats multi-part boundaries as one combined shape rather than requiring
// the caller to pick a single part.
export function pointInBoundary(x, y, polylines) {
  return (polylines || []).some((pts) => pts.length >= 3 && pointInPolygon(x, y, pts));
}
