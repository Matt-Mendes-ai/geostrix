// TASKS.csv #2546 (review #2486, WA lithium) — the default 50 m sphere carried a 15 m-deep drill pattern 50 m below the hole bottoms: half of the
// estimate's lithium sat below RL 160 and the tonnage was 4.7 times the polygonal figure. Which estimated blocks lie below the deepest sample
// of every hole within the search radius in plan (their grade carried down past the drilling), and their share of the metal. Pure.
// cells [{ x, y, z, dz, value, dx, dy }], points [{ x, y, z, hole_id }], radiusM the horizontal search radius.
// -> { blocks, of, metalShare } (metal = max(0, value) x block volume)
export function belowDrilling(cells, points, radiusM) {
  const R = Number(radiusM);
  if (!(R > 0) || !cells?.length || !points?.length) return { blocks: 0, of: cells?.length || 0, metalShare: 0 };
  // each hole's deepest sample, in a plan grid of R-sized bins
  const deepest = new Map();
  for (const p of points) { const k = p.hole_id ?? `${p.x},${p.y}`; const d = deepest.get(k); if (!d || p.z < d.z) deepest.set(k, { x: p.x, y: p.y, z: p.z }); }
  const bins = new Map(), key = (i, j) => `${i},${j}`;
  for (const b of deepest.values()) { const k = key(Math.floor(b.x / R), Math.floor(b.y / R)); if (!bins.has(k)) bins.set(k, []); bins.get(k).push(b); }
  let blocks = 0, all = 0, below = 0;
  for (const c of cells) {
    const m = Math.max(0, Number(c.value) || 0) * (c.dx || 1) * (c.dy || 1) * (c.dz || 1);
    all += m;
    const i0 = Math.floor(c.x / R), j0 = Math.floor(c.y / R);
    let low = Infinity;
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const b of bins.get(key(i, j)) || []) if (Math.hypot(b.x - c.x, b.y - c.y) <= R && b.z < low) low = b.z;
    if (Number.isFinite(low) && c.z + (c.dz || 0) / 2 < low) { blocks++; below += m; }
  }
  return { blocks, of: cells.length, metalShare: all > 0 ? below / all : 0 };
}
