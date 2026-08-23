// TASKS.csv #51 — vector geoprocessing: Delaunay triangulation / Voronoi tessellation of a 2D point
// set, plus the one classic geostatistics application of it that's directly useful in mineral
// exploration: polygonal (Voronoi-area) declustering. Clustered infill drilling or resampling
// over-represents whatever grade happened to be there, biasing a naive mean; weighting each sample
// by its Voronoi cell's area (a tightly-clustered sample gets a small cell = small weight, an
// isolated sample gets a large cell = large weight) is a standard, well-understood correction
// (Isaaks & Srivastava, "An Introduction to Applied Geostatistics", ch. 19) that needs nothing more
// than the tessellation itself — no separate "zone" polygons to import, which keeps this usable
// immediately on whatever points/collars are already loaded rather than gated behind shapefile
// import (#79/#80, still Planned).
import { Delaunay } from "d3-delaunay";

// Clips Voronoi cells to `bounds` ({xmin,ymin,xmax,ymax}); pass a padded bbox derived from the point
// set so edge points get a finite (if arbitrary) cell instead of an unbounded one — Voronoi cells on
// the convex hull are open regions, and d3-delaunay's clip requires an explicit bounding box.
export function voronoiTessellation(points, bounds) {
  if (!points.length) return { cells: [], delaunay: null, voronoi: null };
  const delaunay = Delaunay.from(points, (p) => p.x, (p) => p.y);
  const voronoi = delaunay.voronoi([bounds.xmin, bounds.ymin, bounds.xmax, bounds.ymax]);
  const cells = points.map((p, i) => {
    const poly = voronoi.cellPolygon(i);
    return { point: p, index: i, polygon: poly, area: poly ? polygonArea(poly) : 0 };
  });
  return { cells, delaunay, voronoi };
}

// Shoelace formula. `polygon` is d3's cellPolygon output: an array of [x,y] pairs, first === last.
export function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// TASKS.csv #126 — mineral claim/tenure area, in hectares. `polylines` is a boundary's own shape
// ({x,y}[][], one array per part — see geosoft.js's parsePLYBoundary), NOT pre-closed the way
// polygonArea's [x,y] input above assumes (real .ply files don't always repeat the first vertex, see
// ViewerModule's boundary-render effect comment), so each loop is explicitly closed here first. Sums
// every part's area rather than picking the largest — a real multi-part claim (a tenure with a
// non-contiguous parcel, or a donut-shaped exclusion) is genuinely the sum of its pieces; this doesn't
// attempt hole subtraction (no reliable "this ring is a hole in that one" signal in a flat .ply part
// list), so a claim boundary with a deliberately-excluded inner hole will over-report slightly — an
// acceptable simplification for a first pass, same spirit as this app's other geometry approximations
// (e.g. reprojectGrid's corner-bbox-only reprojection).
export function boundaryAreaHectares(polylines) {
  let m2 = 0;
  for (const pts of polylines || []) {
    if (pts.length < 3) continue;
    const closed = pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y ? pts : [...pts, pts[0]];
    m2 += polygonArea(closed.map((p) => [p.x, p.y]));
  }
  return m2 / 10000;
}

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

// Padded bounding box: geoprocessing.js's own helper rather than reusing a raster/section bbox
// helper, since those pad in pixel/SVG space — this pads in world units, sized relative to point
// spread rather than a fixed constant, so it behaves reasonably from drillhole-collar spacing (tens
// of metres) up to district-scale point sets (kilometres).
export function paddedBounds(points, padFrac = 0.15) {
  // Plain loop, not Math.min(...xs)/Math.max(...xs) — spreading a large point set (a real geophysics
  // survey or assay dataset run through this module's Voronoi declustering can have well over 100k
  // points) as individual call arguments can exceed the JS engine's argument-count limit and crash
  // with "Maximum call stack size exceeded" (found and fixed for the same reason in voxel.js during
  // the UBC-mesh-import coarsening work — see that file's cellValueRange comment for the full story).
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const p of points) {
    if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
  }
  const w = xmax - xmin || 1, h = ymax - ymin || 1;
  const padX = w * padFrac, padY = h * padFrac;
  return { xmin: xmin - padX, ymin: ymin - padY, xmax: xmax + padX, ymax: ymax + padY };
}

// Polygonal (Voronoi-area) declustering. `points` need {x, y, value}. Returns both the naive mean
// (what you'd get ignoring spatial clustering) and the area-weighted declustered mean, plus per-point
// weights so callers can render/inspect them. Points with a non-finite value are excluded from the
// statistics but still occupy space in the tessellation (their presence still affects neighbors'
// cell shapes, same as it would physically).
export function declusteredStats(points, bounds) {
  const { cells } = voronoiTessellation(points, bounds || paddedBounds(points));
  const valid = cells.filter((c) => Number.isFinite(c.point.value) && c.area > 0);
  const totalArea = valid.reduce((s, c) => s + c.area, 0);
  const weighted = valid.map((c) => ({ ...c, weight: totalArea > 0 ? c.area / totalArea : 0 }));
  const n = valid.length;
  const naiveMean = n ? valid.reduce((s, c) => s + c.point.value, 0) / n : null;
  const declusteredMean = totalArea > 0 ? weighted.reduce((s, c) => s + c.point.value * c.weight, 0) : null;
  // Weighted variance (reliability weights form): sum(w*(v-mean)^2) / (1 - sum(w^2)), the standard
  // bias-corrected estimator for unequal weights (naive sum(w*(v-mean)^2) understates variance when
  // weights aren't uniform).
  let declusteredStd = null;
  if (declusteredMean !== null && n > 1) {
    const sumW2 = weighted.reduce((s, c) => s + c.weight * c.weight, 0);
    const denom = 1 - sumW2;
    if (denom > 1e-9) {
      const num = weighted.reduce((s, c) => s + c.weight * (c.point.value - declusteredMean) ** 2, 0);
      declusteredStd = Math.sqrt(num / denom);
    }
  }
  return { cells: weighted, n, totalArea, naiveMean, declusteredMean, declusteredStd };
}
