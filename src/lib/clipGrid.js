// TASKS.csv #3470 (Galore Creek review; Matt's pick: 'Clip to boundary' makes a NEW raster) — a value grid's cells inside a boundary or claim,
// cropped to the polygon's own box, the cells outside left as no-data (NaN), so the map of one tenement keeps its values (contours, filters and
// statistics work on it) and the original stays. Cell-centre sampling and holes as zonalStats.js. Pure.
import { pointInBoundary } from "./pointInPolygon.js";
import { b64ToF32 } from "./inversion.js";

// grid: { nx, ny, x0, yTop, dx, dy, values (Float32Array | base64) } -> { nx, ny, x0, yTop, dx, dy, values: Float32Array, kept, total } or null with no cell inside
export function clipGridToPolygon(grid, polylines) {
  if (!grid || !polylines?.length) return null;
  const values = typeof grid.values === "string" ? b64ToF32(grid.values) : grid.values;
  const { nx, ny, x0, yTop, dx, dy } = grid;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const pl of polylines) for (const p of pl) { if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x; if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y; }
  if (!Number.isFinite(bx0)) return null;
  const i0 = Math.max(0, Math.floor((bx0 - x0) / dx)), i1 = Math.min(nx - 1, Math.ceil((bx1 - x0) / dx));
  const j0 = Math.max(0, Math.floor((yTop - by1) / dy)), j1 = Math.min(ny - 1, Math.ceil((yTop - by0) / dy));
  if (i1 < i0 || j1 < j0) return null;
  // the cells inside, then the crop to the ones that are: the box of the polygon's cells, not of its vertices (a margin of outside cells is no use)
  const inside = [];
  let ci0 = Infinity, ci1 = -Infinity, cj0 = Infinity, cj1 = -Infinity;
  for (let j = j0; j <= j1; j++) {
    const y = yTop - j * dy;
    for (let i = i0; i <= i1; i++) {
      if (!pointInBoundary(x0 + i * dx, y, polylines)) continue;
      inside.push(j * nx + i);
      if (i < ci0) ci0 = i; if (i > ci1) ci1 = i; if (j < cj0) cj0 = j; if (j > cj1) cj1 = j;
    }
  }
  if (!inside.length) return null;
  const w = ci1 - ci0 + 1, h = cj1 - cj0 + 1, out = new Float32Array(w * h).fill(NaN);
  let kept = 0;
  for (const k of inside) {
    const v = values[k];
    if (Number.isFinite(v)) { out[(Math.floor(k / nx) - cj0) * w + (k % nx - ci0)] = v; kept++; }
  }
  const total = inside.length;
  return { nx: w, ny: h, x0: x0 + ci0 * dx, yTop: yTop - cj0 * dy, dx, dy, values: out, kept, total };
}
