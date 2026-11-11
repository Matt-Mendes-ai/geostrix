// TASKS.csv #2438 (review #2325, WA uranium) — the ground Stope outlines checks its levels against: the terrain, else the surface between
// the collars (as the pit tools), never collars drilled from underground. Sampled on the block model's own column centres (padded so a
// stope leaning with a dip still finds the ground over it) and sent to the worker as a grid, read back with pitCeiling.js ceilingLookup.
// And the flat-body test: a level outline far wider in plan than the level is high is a slab of a flat body, not a stope. Pure.
import { collarGround, collarsLookUnderground } from "./pitShell.js";
import { terrainGroundAt } from "./viewer/geomath.js";

// -> { at(x, y) | null, source: "terrain" | "collars" | null, underground }
export function stopeGroundSource(terrain, collars) {
  if (terrain) return { at: (x, y) => terrainGroundAt(terrain, x, y), source: "terrain", underground: false };
  const ug = collarsLookUnderground(collars || []);
  if (ug.underground) return { at: null, source: null, underground: true };
  const at = collarGround(collars || []);
  return { at, source: at ? "collars" : null, underground: false };
}

// cells: the model's blocks; at(x, y) -> z. -> { values: Float64Array, frame: { x0, y0, dx, dy, nx, ny } } or null
export function groundGrid(cells, at, maxNodes = 4_000_000) {
  if (!at || !cells?.length) return null;
  const fin = Number.isFinite, ok = cells.filter((c) => fin(c.x) && fin(c.y) && fin(c.z) && c.dx > 0 && c.dy > 0 && c.dz > 0);
  if (!ok.length) return null;
  const med = (k) => ok.map((c) => c[k]).sort((a, b) => a - b)[ok.length >> 1];
  const dx = med("dx"), dy = med("dy");
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zLo = Infinity, zHi = -Infinity;
  for (const c of ok) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; if (c.z - c.dz / 2 < zLo) zLo = c.z - c.dz / 2; if (c.z + c.dz / 2 > zHi) zHi = c.z + c.dz / 2; }
  const reach = zHi - zLo; // a stope leaning at 45° or steeper moves at most this far in plan
  const pi = Math.ceil(reach / dx) + 1, pj = Math.ceil(reach / dy) + 1;
  let nx = Math.round((x1 - x0) / dx) + 1 + 2 * pi, ny = Math.round((y1 - y0) / dy) + 1 + 2 * pj;
  let gx0 = x0 - pi * dx, gy0 = y0 - pj * dy;
  if (nx * ny > maxNodes) { gx0 = x0; gy0 = y0; nx = Math.round((x1 - x0) / dx) + 1; ny = Math.round((y1 - y0) / dy) + 1; if (nx * ny > maxNodes) return null; }
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const g = at(gx0 + i * dx, gy0 + j * dy); values[j * nx + i] = fin(g) ? g : NaN; }
  return { values, frame: { x0: gx0, y0: gy0, dx, dy, nx, ny } };
}

// the largest outline (by tonnes) and its plan size; flat when its shorter side passes `ratio` times the level height
// levels: stopeOutlines().levels. -> null or { a, b, h, tonnes, rl, flat }
export function flatBodyCheck(levels, levelH, ratio = 10) {
  let best = null;
  for (const l of levels || []) for (const s of l.stopes || []) if (!best || s.tonnes > best.s.tonnes) best = { s, l };
  if (!best || !best.s.outline?.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of best.s.outline) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const a = Math.max(x1 - x0, y1 - y0), b = Math.min(x1 - x0, y1 - y0), h = best.l.top - best.l.rl || levelH;
  return { a, b, h, tonnes: best.s.tonnes, rl: best.l.rl, flat: h > 0 && b > ratio * h };
}
