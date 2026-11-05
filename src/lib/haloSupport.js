// TASKS.csv #1740 — how much of an indicator envelope (alteration halo, unit body) is the search radius rather than the logs.
// Copley's ARG halo (9 holes 300-1,350 m apart, auto 486 m search) closed 1.9 km3 and enclosed every prospect, and nothing said
// that most of it lay hundreds of metres from any logged interval. Counted on the grid: the nodes inside the envelope (value >=
// iso) with no sample point within `dist`. Cells are equal, so the node share is the volume share.
// values: the grid, i + nx * (j + ny * k); origin / spacing: grid frame; samples: [{x, y, z}] in the real frame; toReal: grid
// frame -> real frame when the grid is anisotropy-warped. -> { inside, far, share, dist }
export function farFromSamples(values, nx, ny, nz, origin, spacing, iso, samples, dist, { toReal = null } = {}) {
  const dx = spacing.x ?? spacing.dx, dy = spacing.y ?? spacing.dy, dz = spacing.z ?? spacing.dz;
  const key = (a, b, c) => `${a},${b},${c}`, cellOf = (v) => Math.floor(v / dist);
  const buckets = new Map();
  for (const s of samples || []) {
    const k = key(cellOf(s.x), cellOf(s.y), cellOf(s.z));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const d2 = dist * dist, p = { x: 0, y: 0, z: 0 };
  const near = (r) => {
    const cx = cellOf(r.x), cy = cellOf(r.y), cz = cellOf(r.z);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const s of buckets.get(key(cx + a, cy + b, cz + c)) || []) if ((s.x - r.x) ** 2 + (s.y - r.y) ** 2 + (s.z - r.z) ** 2 <= d2) return true;
    }
    return false;
  };
  let inside = 0, far = 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = values[i + nx * (j + ny * k)];
    if (!(v >= iso)) continue;
    inside++;
    p.x = origin.x + i * dx; p.y = origin.y + j * dy; p.z = origin.z + k * dz;
    if (!near(toReal ? toReal(p) : p)) far++;
  }
  return { inside, far, share: inside ? far / inside : 0, dist };
}
