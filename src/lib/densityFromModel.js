// TASKS.csv #3012 (WA iron review) — a tonnage from the density estimated onto the same blocks: Estimation can put a density log's values on
// the grade model's lattice ('Match <model>'), but Grade-tonnage took one typed density or one per logged code. Pure.

// the densities a block may take from a model, t/m³ (a value outside is not a density: the block takes the typed default)
export const DENSITY_RANGE = [1, 6];

// two lattices ({ dx, dy, dz, ox, oy, oz } from blockModelLattice) the same: equal cells and origins one whole number of cells apart
export function sameLattice(a, b) {
  if (!a || !b) return false;
  const eq = (p, q) => Math.abs(p - q) <= 1e-6 * Math.max(1, Math.abs(p));
  const whole = (d, s) => { const k = d / s; return Math.abs(k - Math.round(k)) < 1e-3; };
  return eq(a.dx, b.dx) && eq(a.dy, b.dy) && eq(a.dz, b.dz) && whole(a.ox - b.ox, a.dx) && whole(a.oy - b.oy, a.dy) && whole(a.oz - b.oz, a.dz);
}

// densityCells: the density model's cells; lattice: the grade model's; fallback: the typed density (or null) ->
// { of(cell) -> t/m³ | fallback, stats() -> { taken (density blocks in range), outOfRange } }
export function densityFromModel(densityCells, lattice, fallback = null) {
  const { dx, dy, dz, ox, oy, oz } = lattice;
  const key = (c) => { const i = Math.round((c.x - ox) / dx - 0.5), j = Math.round((c.y - oy) / dy - 0.5), k = Math.round((c.z - oz) / dz - 0.5); return (i * 2000003 + j) * 2000003 + k; };
  const by = new Map();
  let taken = 0, outOfRange = 0;
  for (const c of densityCells || []) {
    const v = Number(c.value);
    if (!(v >= DENSITY_RANGE[0] && v <= DENSITY_RANGE[1])) { if (Number.isFinite(v)) outOfRange++; continue; }
    by.set(key(c), v); taken++;
  }
  const def = Number(fallback) > 0 ? Number(fallback) : null;
  return { of: (c) => { const v = by.get(key(c)); return v !== undefined ? v : def; }, has: (c) => by.has(key(c)), stats: () => ({ taken, outOfRange }) };
}
