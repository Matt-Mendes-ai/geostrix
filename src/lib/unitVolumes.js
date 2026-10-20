// TASKS.csv #517 — closed UNIT VOLUMES ("output volumes") from the implicit model's lithology block. The stack
// returned open contact sheets plus the block (a regular grid of unit ids, modelCheck.js); nothing turned a unit
// into a closed body, so a unit could not be exported as a solid, measured (volumetrics needs a watertight mesh) or
// used to restrict an estimate.
//
// The shell is the BOUNDARY OF THE UNIT'S CELLS: every face between a unit cell and a non-unit cell (or the model
// box) becomes two triangles, wound outward. It encloses exactly cells x cell volume — the model at its own cell
// size, blocky but true. A smooth marching-cubes shell was tried first and measured on the Harry VCL / DACT stack:
// within 0.2 % for the thick DACT, but 77 % too small for VCL, whose modelled cells form one-cell-thick patches that
// marching cubes on cell centres shrinks to small blobs — not acceptable for a number called "volume".
//
// Two cells that touch only along an edge or at a corner would share that edge / vertex between four faces (a
// non-manifold surface that volumetrics and isMeshClosed rightly call "not closed"). Vertices are therefore keyed by
// grid node AND by the face-connected group of unit cells around that node, so such cells get their own copies and
// every edge is shared by exactly two triangles.

// block: { extent: [xmin, xmax, ymin, ymax, zmin, zmax] (API frame), resolution: [nx, ny, nz], ids (x-major,
// z fastest), labels }. origin: API -> world. Returns { positions (world E, N, Z), indices, cells, cellVolume,
// blockVolume } or null when the unit has no cell.
export function unitShell(block, unitName, origin = { x: 0, y: 0, z: 0 }) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = block.extent;
  const [nx, ny, nz] = block.resolution;
  const dx = (xmax - xmin) / nx, dy = (ymax - ymin) / ny, dz = (zmax - zmin) / nz;
  const id = block.labels.indexOf(unitName) + 1;
  if (id < 1) return null;
  const isU = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && block.ids[i * ny * nz + j * nz + k] === id;

  // vertex at grid node (a, b, c) for the cell (i, j, k) touching it: one vertex per face-connected group of unit
  // cells around the node
  const groupCache = new Map();
  const groupOf = (a, b, c, i, j, k) => {
    const nodeKey = (a * (ny + 1) + b) * (nz + 1) + c;
    let g = groupCache.get(nodeKey);
    if (!g) {
      g = new Map(); // "di,dj,dk" -> group id
      const around = [];
      for (let di = 0; di < 2; di++) for (let dj = 0; dj < 2; dj++) for (let dk = 0; dk < 2; dk++) if (isU(a - 1 + di, b - 1 + dj, c - 1 + dk)) around.push([di, dj, dk]);
      let next = 0;
      for (const cell of around) {
        const ck = cell.join(",");
        if (g.has(ck)) continue;
        const q = [cell]; g.set(ck, next);
        while (q.length) {
          const [x, y, z] = q.pop();
          for (const o of around) {
            const ok = o.join(",");
            if (g.has(ok)) continue;
            if (Math.abs(o[0] - x) + Math.abs(o[1] - y) + Math.abs(o[2] - z) === 1) { g.set(ok, next); q.push(o); }
          }
        }
        next++;
      }
      groupCache.set(nodeKey, g);
    }
    return `${nodeKey}:${g.get(`${i - a + 1},${j - b + 1},${k - c + 1}`)}`;
  };

  const vIndex = new Map(), pos = [], idx = [];
  const vert = (a, b, c, i, j, k) => {
    const key = groupOf(a, b, c, i, j, k);
    let v = vIndex.get(key);
    if (v === undefined) {
      v = pos.length / 3; vIndex.set(key, v);
      pos.push(origin.x + xmin + a * dx, origin.y + ymin + b * dy, origin.z + zmin + c * dz);
    }
    return v;
  };
  const quad = (corners, i, j, k) => {
    const [p0, p1, p2, p3] = corners.map(([a, b, c]) => vert(a, b, c, i, j, k));
    idx.push(p0, p1, p2, p0, p2, p3);
  };
  let cells = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    if (!isU(i, j, k)) continue;
    cells++;
    // outward winding: +x face (y then z), +y face (z then x), +z face (x then y); minus faces reversed
    if (!isU(i + 1, j, k)) quad([[i + 1, j, k], [i + 1, j + 1, k], [i + 1, j + 1, k + 1], [i + 1, j, k + 1]], i, j, k);
    if (!isU(i - 1, j, k)) quad([[i, j, k], [i, j, k + 1], [i, j + 1, k + 1], [i, j + 1, k]], i, j, k);
    if (!isU(i, j + 1, k)) quad([[i, j + 1, k], [i, j + 1, k + 1], [i + 1, j + 1, k + 1], [i + 1, j + 1, k]], i, j, k);
    if (!isU(i, j - 1, k)) quad([[i, j, k], [i + 1, j, k], [i + 1, j, k + 1], [i, j, k + 1]], i, j, k);
    if (!isU(i, j, k + 1)) quad([[i, j, k + 1], [i + 1, j, k + 1], [i + 1, j + 1, k + 1], [i, j + 1, k + 1]], i, j, k);
    if (!isU(i, j, k - 1)) quad([[i, j, k], [i, j + 1, k], [i + 1, j + 1, k], [i + 1, j, k]], i, j, k);
  }
  if (!cells) return null;
  const cellVolume = dx * dy * dz;
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx), cells, cellVolume, blockVolume: cells * cellVolume };
}

// signed volume of a closed triangle mesh (divergence theorem), in the positions' units — for the tests and the notice
export function meshVolume(positions, indices) {
  let v6 = 0;
  // relative to the first vertex: UTM-sized coordinates (6,000,000 m) would otherwise eat the precision
  const rx = positions[0] || 0, ry = positions[1] || 0, rz = positions[2] || 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ax = positions[a] - rx, ay = positions[a + 1] - ry, az = positions[a + 2] - rz;
    const bx = positions[b] - rx, by = positions[b + 1] - ry, bz = positions[b + 2] - rz;
    const cx = positions[c] - rx, cy = positions[c + 1] - ry, cz = positions[c + 2] - rz;
    v6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v6 / 6;
}
