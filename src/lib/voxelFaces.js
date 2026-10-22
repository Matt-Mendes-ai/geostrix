// TASKS.csv #793 — an opaque block model on a rectilinear grid drawn as ONE mesh of its exposed faces: the faces between
// a shown block and an empty / hidden neighbour. A solid block model is mostly interior: 100 x 100 x 100 shown blocks
// are 12 million triangles as instanced boxes but 120,000 here, because a face shared by two shown blocks can never be
// seen while the model is opaque. (Transparent models keep the instanced boxes: their insides show through.)
//
// rectilinearGrid(cells) -> { ex, ey, ez, I, J, K } | null
//   Each axis has its own sorted cell boundaries (a regular block model, or a UBC / OMF tensor mesh whose padding or
//   layer thickness varies - the Woodjam ZTEM has 75 m and 37.5 m layers); every block must span exactly one interval
//   per axis. I / J / K are each block's interval indices. null for octree / sub-blocked / rotated models.
// buildExposedFaces(cells, grid, origin, colorRGB) -> { positions, normals, colors, indices, faces } | null
//   cells: the blocks to show (a subset of the cells the grid was built from, same order not required);
//   origin: the scene origin {x, y, z}; colorRGB(value) -> [r, g, b] 0-255 sRGB. Scene axes as everywhere in the
//   viewer: X = east, Y = elevation, Z = -north. Colours are converted to linear (three.js's working space), so the
//   mesh matches the instanced boxes' setRGB(..., SRGBColorSpace). null when the grid's box would be unreasonably
//   large for an occupancy array; the caller then keeps instancing.

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const MM = (v) => Math.round(v * 1000); // boundaries compared to the millimetre

function axisEdges(cells, centre, size, maxEdges) {
  const set = new Set();
  for (const c of cells) {
    const h = c[size] / 2;
    set.add(MM(c[centre] - h)); set.add(MM(c[centre] + h));
    if (set.size > maxEdges) return null;
  }
  const edges = Float64Array.from(set).sort();
  const at = new Map();
  edges.forEach((e, i) => at.set(e, i));
  const idx = new Int32Array(cells.length);
  for (let t = 0; t < cells.length; t++) {
    const c = cells[t], h = c[size] / 2, lo = at.get(MM(c[centre] - h)), hi = at.get(MM(c[centre] + h));
    if (hi !== lo + 1) return null; // a block spanning several intervals: sub-blocks / octree
    idx[t] = lo;
  }
  return { edges: Float64Array.from(edges, (e) => e / 1000), idx };
}

export function rectilinearGrid(cells, { maxEdges = 4096 } = {}) {
  if (!cells?.length) return null;
  for (const c of cells) if (!(c.dx > 0 && c.dy > 0 && c.dz > 0)) return null;
  const x = axisEdges(cells, "x", "dx", maxEdges); if (!x) return null;
  const y = axisEdges(cells, "y", "dy", maxEdges); if (!y) return null;
  const z = axisEdges(cells, "z", "dz", maxEdges); if (!z) return null;
  return { ex: x.edges, ey: y.edges, ez: z.edges, I: x.idx, J: y.idx, K: z.idx, cells };
}

// The six faces in scene space: normal axis / sign, and the four corners (0 = low, 1 = high bound per axis) wound
// counter-clockwise seen from outside
function faceTemplates() {
  const out = [];
  for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const corner = (bu, bv) => { const p = [0, 0, 0]; p[a] = s > 0 ? 1 : 0; p[u] = bu; p[v] = bv; return p; };
    let quad = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]; // faces +a (e_u x e_v = e_a)
    if (s < 0) quad = quad.reverse();
    const n = [0, 0, 0]; n[a] = s;
    out.push({ a, s, quad, n });
  }
  return out;
}
const FACES = faceTemplates();

export function buildExposedFaces(cells, grid, origin, colorRGB, { maxGrid = 64e6 } = {}) {
  if (!cells.length || !grid) return null;
  const nx = grid.ex.length - 1, ny = grid.ey.length - 1, nz = grid.ez.length - 1;
  if (nx * ny * nz > maxGrid) return null;
  // interval indices of the shown cells (looked up from the grid's own cell list)
  const pos = new Map();
  grid.cells.forEach((c, t) => pos.set(c, t));
  const n = cells.length, I = new Int32Array(n), J = new Int32Array(n), K = new Int32Array(n);
  for (let t = 0; t < n; t++) {
    const g = pos.get(cells[t]);
    if (g === undefined) return null;
    I[t] = grid.I[g]; J[t] = grid.J[g]; K[t] = grid.K[g];
  }
  const occ = new Uint8Array(nx * ny * nz);
  for (let t = 0; t < n; t++) occ[(K[t] * ny + J[t]) * nx + I[t]] = 1;
  const shown = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && occ[(k * ny + j) * nx + i] === 1;
  // scene-axis neighbour step in grid indices: scene X = +i (east), scene Y = +k (elevation), scene Z = -j (north)
  const step = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
  let faces = 0;
  for (let t = 0; t < n; t++) for (const f of FACES) { const d = step[f.a]; if (!shown(I[t] + f.s * d[0], J[t] + f.s * d[1], K[t] + f.s * d[2])) faces++; }
  const positions = new Float32Array(faces * 12), normals = new Float32Array(faces * 12), colors = new Float32Array(faces * 12);
  const indices = new Uint32Array(faces * 6);
  const { ex, ey, ez } = grid;
  let q = 0;
  for (let t = 0; t < n; t++) {
    const i = I[t], j = J[t], k = K[t];
    // scene bounds [low, high] per scene axis (Z = -north, so north's high edge is scene Z's low bound)
    const B = [[ex[i] - origin.x, ex[i + 1] - origin.x], [ez[k] - origin.z, ez[k + 1] - origin.z], [-(ey[j + 1] - origin.y), -(ey[j] - origin.y)]];
    let rgb = null;
    for (const f of FACES) {
      const d = step[f.a];
      if (shown(i + f.s * d[0], j + f.s * d[1], k + f.s * d[2])) continue;
      if (!rgb) { const [r, g, b] = colorRGB(cells[t].value); rgb = [srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255)]; }
      for (let v = 0; v < 4; v++) {
        const p = f.quad[v], o = (q * 4 + v) * 3;
        positions[o] = B[0][p[0]]; positions[o + 1] = B[1][p[1]]; positions[o + 2] = B[2][p[2]];
        normals[o] = f.n[0]; normals[o + 1] = f.n[1]; normals[o + 2] = f.n[2];
        colors[o] = rgb[0]; colors[o + 1] = rgb[1]; colors[o + 2] = rgb[2];
      }
      const b4 = q * 4, b6 = q * 6;
      indices[b6] = b4; indices[b6 + 1] = b4 + 1; indices[b6 + 2] = b4 + 2;
      indices[b6 + 3] = b4; indices[b6 + 4] = b4 + 2; indices[b6 + 5] = b4 + 3;
      q++;
    }
  }
  return { positions, normals, colors, indices, faces };
}
