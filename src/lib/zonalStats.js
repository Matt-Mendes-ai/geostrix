// TASKS.csv #2002 — zonal statistics of a raster over a polygon: the values of a value raster's kept grid (a magnetics, gravity or geochemistry
// grid) at the cell centres inside a boundary or claim — count, mean, min, max, the 10th / 50th / 90th percentiles and the area they cover.
// Cell-centre sampling (a cell counts when its centre is inside), which is enough at exploration scale; the polygon's holes and islands are
// honoured as pointInBoundary does. Pure.
import { pointInBoundary } from "./pointInPolygon.js";
import { percentileSorted } from "./arrayStats.js";
import { b64ToF32 } from "./inversion.js";

// grid: { nx, ny, x0, yTop, dx, dy, values: Float32Array | base64 } (node centres at x0 + i dx, yTop - j dy, north first; NaN = no data)
// polylines: a boundary's parts [[{ x, y }]]. -> { count, cells, mean, min, max, p10, p50, p90, areaHa, coverage } or null with no cell inside
export function zonalStats(grid, polylines) {
  if (!grid || !polylines?.length) return null;
  const values = typeof grid.values === "string" ? b64ToF32(grid.values) : grid.values;
  const { nx, ny, x0, yTop, dx, dy } = grid;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const pl of polylines) for (const p of pl) { if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x; if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y; }
  if (!Number.isFinite(bx0)) return null;
  const i0 = Math.max(0, Math.floor((bx0 - x0) / dx)), i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / dx));
  const j0 = Math.max(0, Math.floor((yTop - by1) / dy)), j1 = Math.min(ny - 1, Math.ceil((yTop - by0) / dy));
  const vals = [];
  let cells = 0, sum = 0, min = Infinity, max = -Infinity;
  for (let j = j0; j <= j1; j++) {
    const y = yTop - j * dy;
    for (let i = i0; i <= i1; i++) {
      const x = x0 + i * dx;
      if (!pointInBoundary(x, y, polylines)) continue;
      cells++;
      const v = values[j * nx + i];
      if (!Number.isFinite(v)) continue;
      vals.push(v); sum += v;
      if (v < min) min = v; if (v > max) max = v;
    }
  }
  if (!cells) return null;
  const sorted = Float64Array.from(vals).sort();
  return { cells, count: vals.length, mean: vals.length ? sum / vals.length : NaN, min: vals.length ? min : NaN, max: vals.length ? max : NaN,
    p10: percentileSorted(sorted, 0.1), p50: percentileSorted(sorted, 0.5), p90: percentileSorted(sorted, 0.9), areaHa: (vals.length * Math.abs(dx * dy)) / 1e4, coverage: vals.length / cells };
}
