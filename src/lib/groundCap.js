// TASKS.csv #803 — Matt: "I can't get my grade shell block model to end at surface, it's going above surface". The grade
// shell (and the alteration envelope) is marching cubes on an interpolated grid padded around the samples, so near the
// surface the padding reaches into the air and the shell closes up there. Cutting the finished mesh at the ground (what
// the GemPy contacts do, #358 / #568) would leave the shell OPEN at the cut, and its volume would no longer mean
// anything (volumetrics needs a watertight mesh).
//
// Instead the FIELD is intersected with the half-space below the ground before the iso-surface is taken - the
// standard implicit-modelling intersection, min(f, g):
//     v' = min(v, iso + s * (ground(x, y) - z))
// The second term is below the cutoff above the ground, equal to it AT the ground and above it below the ground, so
// the shell is everything above the cutoff AND below the ground, and it closes ON the ground surface (exactly where
// the cap term decides an edge, within the cell otherwise). s makes the cap term climb from the cutoff to the grid's
// highest value in one cell, so it only touches nodes within about a cell of the ground. Outside the terrain's
// footprint (ground NaN) nothing changes. No-data nodes above the ground take the cap value (outside).
//
// capFieldAtGround(values, nx, ny, nz, origin, spacing, iso, groundAt, { toReal }) -> { values: Float32Array, capped }
//   values x fastest (marchingCubes / estimateDenseGrid order); node (i, j, k) at origin + (i dx, j dy, k dz) in the
//   grid's frame; toReal(p) maps that point to real-world east / north / up when the grid lives in a warped frame
//   (anisotropy); groundAt(x, y) -> elevation or NaN.
export function capFieldAtGround(values, nx, ny, nz, origin, spacing, iso, groundAt, { toReal = null } = {}) {
  const dx = spacing.x ?? spacing.dx, dy = spacing.y ?? spacing.dy, dz = spacing.z ?? spacing.dz;
  let vmax = -Infinity;
  for (let i = 0; i < values.length; i++) if (values[i] > vmax) vmax = values[i];
  const s = Math.max(vmax - iso, Math.abs(iso) * 0.01, 1e-9) / Math.max(dx, dy, dz);
  const out = Float32Array.from(values);
  let capped = 0;
  const p = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    p.x = origin.x + i * dx; p.y = origin.y + j * dy; p.z = origin.z + k * dz;
    const r = toReal ? toReal(p) : p;
    const g = groundAt(r.x, r.y);
    if (!Number.isFinite(g)) continue;
    const at = i + nx * (j + ny * k), cap = iso + s * (g - r.z), v = out[at];
    if (Number.isFinite(v) ? v > cap : r.z > g) { out[at] = cap; capped++; }
  }
  return { values: out, capped };
}
