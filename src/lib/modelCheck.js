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

// TASKS.csv #756 — a sample may carry the unit GemPy evaluated EXACTLY at its position (`modelled`: a name, or null
// above every modelled top); otherwise the block cell it falls in is read. Outside the model -> undefined.
export function unitOfSample(block, s) {
  return Object.prototype.hasOwnProperty.call(s, "modelled") ? s.modelled : unitAt(block, s.x, s.y, s.z);
}

export function unitAt(block, x, y, z) {
  const i = blockCellIndex(block, x, y, z);
  if (i < 0 || block.ids[i] === 0) return undefined; // outside the model (id 0: a resampled cell outside the solved box, #679)
  return block.labels[block.ids[i] - 1] ?? null; // null = above every modelled top
}

// TASKS.csv #1029 (review #1016, implicit modeller) — the model box reaches up to the highest control point plus padding,
// and GemPy fills it to the top, so wherever a unit's modelled top stands above the ground (every outcrop, every valley)
// the air between the ground and that top was coded as the unit: in the unit volumes, "Add as block model" and the
// closed unit volumes (and through them the estimation domains). The surfaces were already cut at the terrain (#358).
// Every cell whose centre is above the ground becomes id 0 ("outside the model"). groundAt(wx, wy) -> elevation or
// NaN (no terrain there: the cell is kept); toWorld(api point) -> its world position (through the unwarp for a block
// solved in a trend's stretched frame). -> { block (a copy; the same object when nothing was cut), cut (cells) }
export function capBlockAtGround(block, groundAt, toWorld) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = block.extent;
  const [nx, ny, nz] = block.resolution;
  const cx = (xmax - xmin) / nx, cy = (ymax - ymin) / ny, cz = (zmax - zmin) / nz;
  let ids = null, cut = 0;
  const p = { x: 0, y: 0, z: 0 };
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    const i = ix * ny * nz + iy * nz + iz;
    if (block.ids[i] === 0) continue;
    p.x = xmin + (ix + 0.5) * cx; p.y = ymin + (iy + 0.5) * cy; p.z = zmin + (iz + 0.5) * cz;
    const w = toWorld(p);
    const g = groundAt(w.x, w.y);
    if (!(Number.isFinite(g) && w.z > g)) continue;
    if (!ids) ids = Int32Array.from(block.ids);
    ids[i] = 0; cut++;
  }
  return { block: ids ? { ...block, ids, cutAtTerrain: cut } : block, cut };
}

// TASKS.csv #679 — a model solved with a geology trend lives in a stretched frame: its cells are tilted boxes in real
// space, which a block model (axis-aligned cells) and the modelled-unit layer can't hold. This resamples it onto an
// axis-aligned grid over `realExtent` (API frame, metres): each real cell centre goes through `warp` (real -> the
// frame the block was solved in) and takes the unit found there. A cell whose warped centre falls outside the
// solved box gets id 0 ("outside the model"). The cell is cubic, with the solved cell's volume, enlarged if
// needed so the grid stays within `maxCells`. Unit volumes are still best taken from the solved block itself.
export function resampleWarpedBlock(block, realExtent, warp, maxCells = 2_000_000) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = realExtent;
  const [bx0, bx1, by0, by1, bz0, bz1] = block.extent;
  const [bnx, bny, bnz] = block.resolution;
  const solvedCellVol = ((bx1 - bx0) / bnx) * ((by1 - by0) / bny) * ((bz1 - bz0) / bnz);
  let cell = Math.cbrt(solvedCellVol);
  const dims = () => [Math.max(1, Math.ceil((xmax - xmin) / cell)), Math.max(1, Math.ceil((ymax - ymin) / cell)), Math.max(1, Math.ceil((zmax - zmin) / cell))];
  let [nx, ny, nz] = dims();
  if (nx * ny * nz > maxCells) cell *= Math.cbrt((nx * ny * nz) / maxCells);
  for ([nx, ny, nz] = dims(); nx * ny * nz > maxCells; [nx, ny, nz] = dims()) cell *= 1.02; // rounding up can overshoot
  const ext = [xmin, xmin + nx * cell, ymin, ymin + ny * cell, zmin, zmin + nz * cell];
  const ids = new Int32Array(nx * ny * nz);
  const p = { x: 0, y: 0, z: 0 };
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    p.x = xmin + (ix + 0.5) * cell; p.y = ymin + (iy + 0.5) * cell; p.z = zmin + (iz + 0.5) * cell;
    const w = warp(p);
    const i = blockCellIndex(block, w.x, w.y, w.z);
    ids[ix * ny * nz + iy * nz + iz] = i < 0 ? 0 : block.ids[i];
  }
  return { extent: ext, resolution: [nx, ny, nz], ids, labels: block.labels, resampledFromTrend: true };
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
    const m = unitOfSample(block, s); // #756
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

// TASKS.csv #356 — the block as world-space voxel cells {x,y,z (centre), dx,dy,dz, value = unit id}. The
// volume above every modelled top (null label) is left out: it is "not modelled", not a unit, and it is
// usually the largest part of the box. `origin` converts the API frame back to world coordinates.
export function blockToCells(block, origin = { x: 0, y: 0, z: 0 }) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = block.extent;
  const [nx, ny, nz] = block.resolution;
  const dx = (xmax - xmin) / nx, dy = (ymax - ymin) / ny, dz = (zmax - zmin) / nz;
  const cells = [];
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    const id = block.ids[ix * ny * nz + iy * nz + iz];
    if ((block.labels[id - 1] ?? null) === null) continue;
    cells.push({ x: origin.x + xmin + (ix + 0.5) * dx, y: origin.y + ymin + (iy + 0.5) * dy, z: origin.z + zmin + (iz + 0.5) * dz, dx, dy, dz, value: id });
  }
  return cells;
}

// The unit the model puts at each logged interval's midpoint: rows for an interval layer. `samples` =
// [{hole_id, from, to, x, y, z (API frame), logged}]. Outside the model -> no row (nothing to say).
export const ABOVE_TOPS = "above tops"; // short: it has to fit a strip-log column
export function modelledIntervals(block, samples) {
  const out = [];
  samples.forEach((s) => {
    const m = unitOfSample(block, s); // #756
    if (m === undefined) return;
    out.push({ hole_id: s.hole_id, from: s.from, to: s.to, value: m ?? ABOVE_TOPS, logged: s.logged });
  });
  return out;
}
