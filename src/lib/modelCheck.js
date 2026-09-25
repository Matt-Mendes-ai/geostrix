// TASKS.csv #356 — "what does my model reproduce?" and "how big is each unit?", from GemPy's lithology
// block. The sidecar returns the block when asked (return_block): a regular grid of unit ids over the model
// extent, ordered z fastest, then y, then x (checked against GemPy's own cell centres), plus the unit name
// for each id. GeemPy labels the volume ABOVE a surface with that surface's name; GeoStrix's surfaces are
// unit TOPS, so the sidecar already converts that into "id k = the unit whose top is surface k-1" and
// id 1 = everything above the first modelled top (null label).
//
// Coordinates are the implicit-model API frame (east, north, up, origin-relative) — the same frame the
// points were sent in. Pure: no three.js, no React.

export function blockCellIndex(block, x, y, z) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = block.extent;
  const [nx, ny, nz] = block.resolution;
  const ix = Math.floor(((x - xmin) / (xmax - xmin)) * nx);
  const iy = Math.floor(((y - ymin) / (ymax - ymin)) * ny);
  const iz = Math.floor(((z - zmin) / (zmax - zmin)) * nz);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) return -1;
  return ix * ny * nz + iy * nz + iz;
}

export function unitAt(block, x, y, z) {
  const i = blockCellIndex(block, x, y, z);
  if (i < 0) return undefined; // outside the model
  return block.labels[block.ids[i] - 1] ?? null; // null = above every modelled top
}

// Volume of each modelled unit INSIDE the model extent (m^3): cell count x cell volume. The extent is a
// box around the data, so a unit that continues beyond it is cut off — the caller must say so.
export function unitVolumes(block) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = block.extent;
  const [nx, ny, nz] = block.resolution;
  const cellVol = ((xmax - xmin) / nx) * ((ymax - ymin) / ny) * ((zmax - zmin) / nz);
  const counts = new Map();
  for (let i = 0; i < block.ids.length; i++) {
    const name = block.labels[block.ids[i] - 1] ?? null;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()].map(([name, n]) => ({ name, cells: n, volume: n * cellVol }));
}

// samples: [{ hole_id, x, y, z, metres, logged }] — one per logged interval of a modelled unit (its
// midpoint), `logged` = the unit it was logged as. Returns metres logged vs metres the model puts in the
// same unit, per unit and per hole, plus how many metres fell outside the model.
export function checkAgainstLogs(block, samples) {
  const byUnit = new Map(), byHole = new Map();
  let total = 0, matched = 0, outside = 0;
  samples.forEach((s) => {
    const m = unitAt(block, s.x, s.y, s.z);
    if (m === undefined) { outside += s.metres; return; }
    const ok = m === s.logged;
    total += s.metres; if (ok) matched += s.metres;
    const u = byUnit.get(s.logged) || { unit: s.logged, logged: 0, matched: 0, modelledAs: new Map() };
    u.logged += s.metres; if (ok) u.matched += s.metres; else u.modelledAs.set(m, (u.modelledAs.get(m) || 0) + s.metres);
    byUnit.set(s.logged, u);
    const h = byHole.get(s.hole_id) || { hole_id: s.hole_id, logged: 0, matched: 0 };
    h.logged += s.metres; if (ok) h.matched += s.metres;
    byHole.set(s.hole_id, h);
  });
  return {
    total, matched, outside,
    units: [...byUnit.values()].map((u) => ({ unit: u.unit, logged: u.logged, matched: u.matched, mostOftenModelledAs: [...u.modelledAs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] })),
    holes: [...byHole.values()].sort((a, b) => a.matched / a.logged - b.matched / b.logged),
  };
}
