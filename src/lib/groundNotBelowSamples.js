// TASKS.csv #3580 (Matt, 2026-11-15, Macpass: "where min is present the grade shell doesn't model it") — with no terrain, a grade shell or
// an alteration envelope is cut at the collar surface (#2634: the ground interpolated between the four nearest collars, past the bench
// check of #2584). In steep country that surface runs far below the rock the holes went through: 311 of Macpass's 1,595 Ag composites at or
// above 29.8 g/t lay above it (median 61 m, up to 189 m; under ridges between collars, and where the bench check left out a pad's higher
// collars), so the cut took them for air and the shell missed them. A drilled sample is underground by definition, so the collar surface,
// which is only an estimate of the ground, is raised over the samples: within `reachM` in plan of a sample the ground is at least `marginM`
// above it (one grid cell each: the cut acts within about a cell of the ground, lib/groundCap.js). A real terrain is not changed.
//
// groundAt: (x, y) -> elevation or NaN (no cut there); samples: [{ x, y, z }] in groundAt's frame (east, north, up).
// -> { at: (x, y) -> elevation or NaN, lifted: how many samples lay above the collar surface }
export function groundNotBelowSamples(groundAt, samples, { reachM, marginM }) {
  if (!groundAt) return { at: groundAt, lifted: 0 };
  const r = Math.max(0.5, Number(reachM) || 0), m = Math.max(0, Number(marginM) || 0);
  const top = new Map(), key = (i, j) => i * 67108864 + j;
  let lifted = 0;
  for (const p of samples || []) {
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y) || !Number.isFinite(p?.z)) continue;
    const g = groundAt(p.x, p.y);
    if (Number.isFinite(g) && p.z > g) lifted++;
    const k = key(Math.floor(p.x / r), Math.floor(p.y / r)), z = top.get(k);
    if (z === undefined || p.z > z) top.set(k, p.z);
  }
  if (!top.size) return { at: groundAt, lifted: 0 };
  const at = (x, y) => {
    const g = groundAt(x, y);
    if (!Number.isFinite(g)) return g; // outside the collars' footprint: still no cut
    const i = Math.floor(x / r), j = Math.floor(y / r);
    let hi = -Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const z = top.get(key(i + a, j + b)); if (z !== undefined && z > hi) hi = z; }
    return hi + m > g ? hi + m : g;
  };
  return { at, lifted };
}
