// TASKS.csv #1964 — STOPES BELOW A PIT: the open-pit-then-underground comparison. A pit shell (or a benched pit design) is a
// surface over the ground: its floor where columns are mined, the ground elsewhere. Read as a height field, it is the CEILING the
// stopes must stay under, column by column, not one RL: a stope under the pit's shallow edge may start higher than one under
// its bottom. Pure: no three.js, no React.
//
// pitCeiling(positions, indices, { x0, y0, dx, dy, nx, ny }) samples the mesh at the centres of a regular grid of columns (x0 / y0:
// the first centre) and keeps, for each column, the LOWEST point of the mesh above it (a bench face is near vertical: the lowest
// is the floor at its toe). Columns the mesh does not cover are NaN: nothing above them is mined. -> Float64Array (j * nx + i)
export function pitCeiling(positions, indices, { x0, y0, dx, dy, nx, ny }) {
  const out = new Float64Array(nx * ny).fill(NaN);
  if (!positions?.length || !indices?.length) return out;
  const eps = 1e-9;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = 3 * indices[t], b = 3 * indices[t + 1], c = 3 * indices[t + 2];
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue; // a vertical triangle (a bench face seen edge-on): its edges are on the neighbours
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / dx - eps)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) / dx + eps));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - y0) / dy - eps)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - y0) / dy + eps));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + i * dx, py = y0 + j * dy;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue; // a centre on a shared edge counts for both triangles: same height
      const z = l1 * az + l2 * bz + l3 * cz, q = j * nx + i;
      if (!(out[q] <= z)) out[q] = z;
    }
  }
  return out;
}

// the ceiling at any point: the nearest sampled column's (NaN outside the grid or where the mesh is absent)
export function ceilingLookup(ceil, { x0, y0, dx, dy, nx, ny }) {
  return (x, y) => {
    const i = Math.round((x - x0) / dx), j = Math.round((y - y0) / dy);
    return i >= 0 && i < nx && j >= 0 && j < ny ? ceil[j * nx + i] : NaN;
  };
}
