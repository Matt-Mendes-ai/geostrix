// TASKS.csv #3580 (cause 2, Review on Macpass Tom West) — the grade shell's search was 2.5 times the spacing between COLLAR SITES (holeSpacing.js):
// 15 m at Tom West, whose holes fan out from pads and underground stations, so a 40 m search with Min holes 2 left 31 % of the composites at the
// cutoff on blocks that were never estimated. What a block's search has to reach is the samples: from a sample, the nearest sample of ANOTHER
// hole, in 3D: 24 m there (upper quartile 53 m); 30 m over the whole property, where the collar sites give 48 m. Measured on up to 1,200 of
// the samples (120 ms over Macpass's 31,433, 50 ms over Tom West's 4,214). samples: [{ hole_id, x, y, z }] (any one frame, metres).
// -> { medianM, q3M, samples: how many found another hole within maxM } or null (fewer than two holes, or none within maxM of another)
const MAX_QUERIES = 1200, NONE = []; // a median needs a sample of the samples, not all: kept quick for the pane (main thread)
export function sampleSpacing(samples, { maxM = 250, queryHoles = null } = {}) { // beyond maxM another hole is no neighbour a block search would bridge; queryHoles (#3820): only these holes' samples ask, against every hole's
  const pts = (samples || []).filter((p) => p && p.hole_id != null && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (pts.length < 2 || new Set(pts.map((p) => p.hole_id)).size < 2) return null;
  // a 20 m cell: about ten 2 m composites of a hole in one, and few rings to the neighbouring holes
  const cell = 20;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
  const grid = new Map(), key = (i, j, k) => (i * 4096 + j) * 4096 + k; // i, j, k are offsets from the box corner, well under 4096 at maxM / cell
  const ci = (v, v0) => Math.floor((v - v0) / cell);
  for (const p of pts) { const k = key(ci(p.x, x0), ci(p.y, y0), ci(p.z, z0)); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  const nx = ci(x1, x0), ny = ci(y1, y0), nz = ci(z1, z0), maxRing = Math.ceil(maxM / cell);
  // a coarse maxM grid of which hole is in each cell (MANY for two or more): a sample with no other hole in its coarse cell or the 26 round it has
  // none within maxM and asks no rings (scanning 25 empty rings per isolated sample was most of the time on the whole of Macpass)
  const MANY = {}, coarse = new Map(), cc = (v, v0) => Math.floor((v - v0) / maxM);
  for (const p of pts) { const k = key(cc(p.x, x0), cc(p.y, y0), cc(p.z, z0)), h = coarse.get(k); if (h === undefined) coarse.set(k, p.hole_id); else if (h !== MANY && h !== p.hole_id) coarse.set(k, MANY); }
  const lonely = (p) => {
    const a = cc(p.x, x0), b = cc(p.y, y0), c = cc(p.z, z0);
    for (let i = a - 1; i <= a + 1; i++) for (let j = b - 1; j <= b + 1; j++) for (let k = c - 1; k <= c + 1; k++) { if (i < 0 || j < 0 || k < 0) continue; const h = coarse.get(key(i, j, k)); if (h !== undefined && h !== p.hole_id) return false; }
    return true;
  };
  const step = Math.max(1, Math.ceil(pts.length / MAX_QUERIES)); // every step-th sample asks; all are candidates
  const d = [];
  for (let q = 0; q < pts.length; q += step) {
    const p = pts[q];
    if (queryHoles && !queryHoles.has(p.hole_id)) continue; // #3820 — a subset is measured against all the holes
    if (lonely(p)) continue;
    const i0 = ci(p.x, x0), j0 = ci(p.y, y0), k0 = ci(p.z, z0);
    let best = Infinity;
    for (let r = 0; r <= maxRing; r++) {
      if (best <= (r - 1) * cell) break; // nothing in this ring can be nearer
      const look = (i, j, k) => {
        for (const o of grid.get(key(i, j, k)) || NONE) {
          if (o.hole_id === p.hole_id) continue;
          const dd = (o.x - p.x) ** 2 + (o.y - p.y) ** 2 + (o.z - p.z) ** 2;
          if (dd < best * best) best = Math.sqrt(dd);
        }
      };
      // the ring's shell only (the cells at Chebyshev distance r), inside the samples' box
      for (let i = Math.max(0, i0 - r); i <= Math.min(nx, i0 + r); i++) for (let j = Math.max(0, j0 - r); j <= Math.min(ny, j0 + r); j++) {
        if (Math.abs(i - i0) === r || Math.abs(j - j0) === r) { for (let k = Math.max(0, k0 - r); k <= Math.min(nz, k0 + r); k++) look(i, j, k); }
        else { if (k0 - r >= 0) look(i, j, k0 - r); if (r > 0 && k0 + r <= nz) look(i, j, k0 + r); }
      }
    }
    if (best <= maxM) d.push(best);
  }
  if (!d.length) return null;
  d.sort((a, b) => a - b);
  return { medianM: d[d.length >> 1], q3M: d[Math.floor(0.75 * (d.length - 1))], samples: d.length };
}
