// TASKS.csv #3113 (from #2921, review #2876 WA iron) — a thickness (isopach) grid between two explicit tops of one pile: from Top of X down
// to the next top under it, the vertical distance in every map cell both surfaces cover, as a map (a raster for Maps > GeoTIFF / GXF and
// the 3D View) and a volume. #896's thickness tool measures one unit between its own upper and lower contacts and gives figures only.
// Both tops are fitted surfaces that run past their picks; the volume is said over the whole overlap and inside both surfaces' inputs'
// hulls (#977's supportHull: where both are drawn from their inputs, not extrapolated). Pure.
import { meshHeightLookup } from "./pileTops.js";

const inPoly = (x, y, uv) => {
  let inside = false;
  const n = uv.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = uv[2 * i], yi = uv[2 * i + 1], xj = uv[2 * j], yj = uv[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// hull: { origin, e1, e2, uv } (the fit's frame), point in world E, N, Z -> inside the inputs' hull; null hull: unknown
const inHull = (hull, x, y, z) => {
  if (!hull?.uv?.length || hull.uv.length < 6 || !hull.origin || !hull.e1 || !hull.e2) return null;
  const c = hull.origin, e1 = hull.e1, e2 = hull.e2, dx = x - c[0], dy = y - c[1], dz = z - c[2];
  return inPoly(dx * e1[0] + dy * e1[1] + dz * e1[2], dx * e2[0] + dy * e2[1] + dz * e2[2], hull.uv);
};

// a mesh's plan box and typical vertex spacing (world positions E, N, Z flat)
function planOf(positions) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { x0, x1, y0, y1, spacing: Math.sqrt(Math.max(1e-6, (x1 - x0) * (y1 - y0)) / n) } : null;
}

export const ISOPACH_MAX_CELLS = 1_000_000;

// upper, lower: { positions (world E, N, Z flat), indices, hull? }. cellM: the grid cell (default: the coarser surface's vertex spacing).
// -> null (no overlap in plan) or { grid: { nx, ny, x0, yTop (cell centres), dx, dy, values: Float32Array row 0 north, NaN off either surface },
//    bbox: [x0, y0, x1, y1], cellM, cells, min, mean, max, negativeCells, volumeM3 (over the overlap, the crossing cells as 0),
//    supported: { cells, volumeM3 } | null (no hull known for one of them), coarsened (the cell was enlarged to stay under the cap) }
export function isopachBetween(upper, lower, { cellM = null, maxCells = ISOPACH_MAX_CELLS } = {}) {
  const pu = planOf(upper?.positions || []), pl = planOf(lower?.positions || []);
  if (!pu || !pl) return null;
  const x0 = Math.max(pu.x0, pl.x0), x1 = Math.min(pu.x1, pl.x1), y0 = Math.max(pu.y0, pl.y0), y1 = Math.min(pu.y1, pl.y1);
  if (!(x1 > x0 && y1 > y0)) return null;
  let cell = cellM > 0 ? cellM : Math.max(pu.spacing, pl.spacing);
  let coarsened = false;
  while (Math.ceil((x1 - x0) / cell) * Math.ceil((y1 - y0) / cell) > maxCells) { cell *= 1.25; coarsened = true; }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell));
  const upAt = meshHeightLookup(upper.positions, upper.indices), loAt = meshHeightLookup(lower.positions, lower.indices);
  const hullsKnown = inHull(upper.hull, x0, y0, 0) !== null && inHull(lower.hull, x0, y0, 0) !== null;
  const values = new Float32Array(nx * ny).fill(NaN), area = cell * cell;
  let cells = 0, sum = 0, min = Infinity, max = -Infinity, neg = 0, vol = 0, sCells = 0, sVol = 0;
  for (let j = 0; j < ny; j++) {
    const y = y1 - (j + 0.5) * cell; // row 0 north
    for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * cell;
      const zu = upAt(x, y), zl = loAt(x, y);
      if (!Number.isFinite(zu) || !Number.isFinite(zl)) continue;
      const t = zu - zl;
      values[j * nx + i] = t;
      cells++; sum += t; if (t < min) min = t; if (t > max) max = t;
      if (t < 0) neg++;
      const v = t > 0 ? t * area : 0;
      vol += v;
      if (hullsKnown && inHull(upper.hull, x, y, zu) && inHull(lower.hull, x, y, zl)) { sCells++; sVol += v; }
    }
  }
  if (!cells) return null;
  return {
    // the app's raster layout (lib/sampleGrid.js): x0 / yTop the first cell's centre, the bbox its outer edges
    grid: { nx, ny, x0: x0 + cell / 2, yTop: y1 - cell / 2, dx: cell, dy: cell, values }, bbox: [x0, y1 - ny * cell, x0 + nx * cell, y1], cellM: cell,
    cells, min, mean: sum / cells, max, negativeCells: neg, volumeM3: vol, supported: hullsKnown ? { cells: sCells, volumeM3: sVol } : null, coarsened,
  };
}
