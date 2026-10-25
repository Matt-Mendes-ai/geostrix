// TASKS.csv #895 — an OFFSET copy of a surface: every vertex moved a distance d along the surface's normal there (true
// thickness: a hangingwall from a footwall plus a vein's width) or straight up / down (a vertical thickness). The #855
// review: "offset surfaces (hangingwall from footwall + thickness)" is a Leapfrog staple the explicit tool lacked.
// Normals are area-weighted vertex normals, all turned to agree with the surface's overall normal, which points up
// (or, for a vertical sheet, east / north): so +d is always the same side of the whole sheet - its upper side.
// Where the sheet is folded tighter than d the offset copy crosses itself on the folds' inner side: a limit of any offset.
// Pure: no three.js. positions: flat E, N, Z; indices: triangles.

export function offsetSurface(positions, indices, d, { mode = "normal" } = {}) {
  const n = positions.length / 3, N = new Float64Array(positions.length);
  let mx = 0, my = 0, mz = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3, P = positions;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // length = 2 x area: area-weighted
    if (![nx, ny, nz].every(Number.isFinite)) continue;
    // one orientation for the whole sheet: up, else east, else north
    const s = Math.abs(nz) > 1e-9 ? Math.sign(nz) : Math.abs(nx) > 1e-9 ? Math.sign(nx) : Math.sign(ny) || 1;
    nx *= s; ny *= s; nz *= s;
    mx += nx; my += ny; mz += nz;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  const out = new Float64Array(positions.length);
  let unmoved = 0;
  for (let i = 0; i < n; i++) {
    const k = i * 3;
    let dx = 0, dy = 0, dz = 0;
    if (mode === "vertical") dz = d;
    else {
      let nx = N[k], ny = N[k + 1], nz = N[k + 2];
      if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; } // agree with the sheet's overall normal
      const l = Math.hypot(nx, ny, nz);
      if (l > 0) { dx = (nx / l) * d; dy = (ny / l) * d; dz = (nz / l) * d; } else unmoved++;
    }
    out[k] = positions[k] + dx; out[k + 1] = positions[k + 1] + dy; out[k + 2] = positions[k + 2] + dz;
  }
  return { positions: out, indices: Uint32Array.from(indices), unmoved };
}
