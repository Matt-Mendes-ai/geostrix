// TASKS.csv #3785 (Complete GeoStrix review, narrow-vein gold) — tight shells 13 to 24 m thick round intercepts of 2 m, and close to half their
// volume bodies hung on one hole's intercept (three composites in one hole made a body 36 × 153 × 37 m). The shell's notices gave the composites
// inside and outside, and its share 'beyond the drilling' measured from any sample, not from those at the cut-off. What the shell now says
// (worked out in the worker, on the final field: after the reach cut, the ground and the clean-up):
//  - along the holes: the runs of consecutive composites inside the shell against the runs of consecutive composites at or above the cut-off
//    (metres, medians), and the metres of core inside against the metres at the cut-off;
//  - the bodies (6-connected parts of the nodes at or above the iso-value): how much of the volume is in bodies whose composites at the cut-off
//    come from one hole only (or none), and the largest of them.
// Pure; no three.js.

const GAP_M = 0.05; // composites closer than this along a hole are one run

// points: [{ x, y, z, value, hole_id, from, to }] (the grid's frame); grid: { origin, cellSize: { dx, dy, dz }, nx, ny, nz }; field: the final
// values; iso: the surface's level; cutoff: the grade at the cut-off.
// -> { insideRuns: Float64Array (m), atRuns: Float64Array (m), insideM, atM } — the runs, for medians over every box
export function holeRuns(points, grid, field, iso, cutoff) {
  const { origin, cellSize: cs, nx, ny, nz } = grid;
  const at = (p) => {
    const i = Math.round((p.x - origin.x) / cs.dx), j = Math.round((p.y - origin.y) / cs.dy), k = Math.round((p.z - origin.z) / cs.dz);
    return i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && field[i + nx * (j + ny * k)] >= iso;
  };
  const by = new Map();
  for (const p of points || []) { if (p?.hole_id == null || !Number.isFinite(p.from) || !(p.to > p.from)) continue; (by.get(p.hole_id) || by.set(p.hole_id, []).get(p.hole_id)).push(p); }
  const ins = [], ats = []; let insideM = 0, atM = 0;
  for (const P of by.values()) {
    P.sort((a, b) => a.from - b.from);
    let ri = 0, ra = 0, endI = -Infinity, endA = -Infinity;
    for (const p of P) {
      const L = p.to - p.from, isIn = at(p), isAt = p.value >= cutoff;
      if (isIn) { if (ri > 0 && p.from - endI > GAP_M) { ins.push(ri); ri = 0; } ri += L; endI = p.to; insideM += L; } else if (ri > 0) { ins.push(ri); ri = 0; }
      if (isAt) { if (ra > 0 && p.from - endA > GAP_M) { ats.push(ra); ra = 0; } ra += L; endA = p.to; atM += L; } else if (ra > 0) { ats.push(ra); ra = 0; }
    }
    if (ri > 0) ins.push(ri);
    if (ra > 0) ats.push(ra);
  }
  return { insideRuns: Float64Array.from(ins), atRuns: Float64Array.from(ats), insideM, atM };
}

// The bodies: 6-connected parts of the nodes at or above iso; each takes the holes of the composites at the cut-off on its nodes.
// atPts: [{ x, y, z, hole_id }] (the grid's frame). -> { bodies, nodes, oneHole: { bodies, nodes }, largestOneHole: { nodes, hole } | null }
export function bodyHoles(field, grid, iso, atPts) {
  const { origin, cellSize: cs, nx, ny, nz } = grid, N = nx * ny * nz, NXY = nx * ny;
  const lab = new Int32Array(N).fill(-1), sizes = [];
  const stack = new Int32Array(N);
  let nb = 0, nodes = 0;
  for (let s = 0; s < N; s++) {
    if (lab[s] !== -1 || !(field[s] >= iso)) continue;
    let top = 0, size = 0; stack[top++] = s; lab[s] = nb;
    while (top) {
      const c = stack[--top]; size++;
      const i = c % nx, j = ((c - i) / nx) % ny, k = (c - i - nx * j) / NXY;
      if (i > 0) { const d = c - 1; if (lab[d] === -1 && field[d] >= iso) { lab[d] = nb; stack[top++] = d; } }
      if (i < nx - 1) { const d = c + 1; if (lab[d] === -1 && field[d] >= iso) { lab[d] = nb; stack[top++] = d; } }
      if (j > 0) { const d = c - nx; if (lab[d] === -1 && field[d] >= iso) { lab[d] = nb; stack[top++] = d; } }
      if (j < ny - 1) { const d = c + nx; if (lab[d] === -1 && field[d] >= iso) { lab[d] = nb; stack[top++] = d; } }
      if (k > 0) { const d = c - NXY; if (lab[d] === -1 && field[d] >= iso) { lab[d] = nb; stack[top++] = d; } }
      if (k < nz - 1) { const d = c + NXY; if (lab[d] === -1 && field[d] >= iso) { lab[d] = nb; stack[top++] = d; } }
    }
    sizes.push(size); nodes += size; nb++;
  }
  const holes = sizes.map(() => new Set());
  for (const p of atPts || []) {
    const i = Math.round((p.x - origin.x) / cs.dx), j = Math.round((p.y - origin.y) / cs.dy), k = Math.round((p.z - origin.z) / cs.dz);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
    const b = lab[i + nx * (j + ny * k)];
    if (b >= 0) holes[b].add(p.hole_id);
  }
  let oneB = 0, oneN = 0, largest = null;
  for (let b = 0; b < nb; b++) {
    if (holes[b].size > 1) continue;
    oneB++; oneN += sizes[b];
    if (!largest || sizes[b] > largest.nodes) largest = { nodes: sizes[b], hole: holes[b].size ? [...holes[b]][0] : null };
  }
  return { bodies: nb, nodes, oneHole: { bodies: oneB, nodes: oneN }, largestOneHole: largest };
}

export const medianOf = (arrs) => {
  let n = 0; for (const a of arrs) n += a?.length || 0;
  if (!n) return null;
  const all = new Float64Array(n); let o = 0;
  for (const a of arrs) if (a?.length) { all.set(a, o); o += a.length; }
  all.sort();
  return all[Math.floor((n - 1) / 2)];
};
