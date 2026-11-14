// TASKS.csv #793 — an opaque block model on a rectilinear grid drawn as ONE mesh of its exposed faces: the faces between
// a shown block and an empty / hidden neighbour. A solid block model is mostly interior: 100 x 100 x 100 shown blocks
// are 12 million triangles as instanced boxes but 120,000 here, because a face shared by two shown blocks can never be
// seen while the model is opaque. (Transparent models keep the instanced boxes: their insides show through.)
//
// rectilinearGrid(cells) -> { ex, ey, ez, I, J, K } | null
//   Each axis has its own sorted cell boundaries (a regular block model, or a UBC / OMF tensor mesh whose padding or
//   layer thickness varies - the Woodjam ZTEM has 75 m and 37.5 m layers); every block must span exactly one interval
//   per axis. I / J / K are each block's interval indices. null for octree / sub-blocked / rotated models.
// buildExposedFaces(cells, grid, origin, colorRGB, { boundaries }) -> { positions, normals, colors, indices, faces } | null
//   TASKS.csv #904 — boundaries: also the faces between two shown blocks of DIFFERENT value (a unit model's internal
//   contacts), for a large transparent model: its insides cannot be drawn as millions of sorted boxes, but its skin
//   and its contacts can be, as one mesh.
//   cells: the blocks to show (a subset of the cells the grid was built from, same order not required);
//   origin: the scene origin {x, y, z}; colorRGB(value) -> [r, g, b] 0-255 sRGB. Scene axes as everywhere in the
//   viewer: X = east, Y = elevation, Z = -north. Colours are converted to linear (three.js's working space), so the
//   mesh matches the instanced boxes' setRGB(..., SRGBColorSpace). null when the grid's box would be unreasonably
//   large for an occupancy array; the caller then keeps instancing.

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
// boundaries are compared to the millimetre (axisEdges)

// TASKS.csv #1784 — the boundaries are counted in millimetres from the axis's first whole metre, so the keys stay small
// integers (a UTM northing in millimetres, ~5.5e9, is not one, and every Set / Map operation on it was slow); a block that
// repeats the previous one's centre and size (the y and z axes, most of the time) is not looked up again. Same grid as
// before: 280k cells 140-230 ms -> see the row's notes.
function axisEdges(cells, centre, size, maxEdges) {
  const n = cells.length, base = Math.floor(cells[0][centre]);
  const lo = new Float64Array(n), hi = new Float64Array(n), set = new Set();
  let pc = NaN, ps = NaN, pl = 0, ph = 0;
  for (let t = 0; t < n; t++) {
    const c = cells[t], cc = c[centre], sz = c[size];
    if (cc !== pc || sz !== ps) {
      const h = sz / 2;
      pl = Math.round((cc - h - base) * 1000); ph = Math.round((cc + h - base) * 1000);
      set.add(pl); set.add(ph);
      if (set.size > maxEdges) return null;
      pc = cc; ps = sz;
    }
    lo[t] = pl; hi[t] = ph;
  }
  const edges = Float64Array.from(set).sort();
  const at = new Map();
  for (let i = 0; i < edges.length; i++) at.set(edges[i], i);
  const idx = new Int32Array(n);
  let pk = NaN, pi = 0;
  for (let t = 0; t < n; t++) {
    if (lo[t] !== pk) {
      const l = at.get(lo[t]);
      pk = lo[t]; pi = l;
    }
    if (at.get(hi[t]) !== pi + 1) return null; // a block spanning several intervals: sub-blocks / octree
    idx[t] = pi;
  }
  return { edges: Float64Array.from(edges, (e) => base + e / 1000), idx };
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

// TASKS.csv #1784 — the occupancy box is padded by one cell on every side (no bounds test per neighbour), the six neighbour
// offsets are plain numbers, and the grid keeps its cell -> index map, so a cutoff change on the same model does not rebuild it.
// Output identical to before.
// TASKS.csv #3354 (Matt: 'when I make the resistivity voxel more opaque it slow down considerably, freezing the view. Also the voxel
// becomes empty displaying just an outside shell depending on the angle of view'; a classified resistivity model, 60 classes) — the
// contacts compared the cells' raw values, so on a continuous field every inner face was a 'contact' (a 100 x 100 x 40 model: 2.4M faces,
// 4.8M blended triangles, 4-6 fps), and each contact was drawn twice, coplanar. classOf(value) -> the class (or band) a contact is between;
// each contact once (from its lower-index cell), double-sided as before.
export function voxelBands(model, maxBands = 12) {
  const sv = (model?.stops || []).map((s) => Number(s.value)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sv.length) return null;
  const per = Math.max(1, Math.ceil(sv.length / maxBands));
  return (v) => { let lo = 0, hi = sv.length - 1, k = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (v >= sv[m]) { k = m; lo = m + 1; } else hi = m - 1; } return Math.floor(k / per); }; // the discrete rule: the last stop at or below
}

export function buildExposedFaces(cells, grid, origin, colorRGB, { maxGrid = 64e6, boundaries = false, classOf = null } = {}) {
  if (!cells.length || !grid) return null;
  const nx = grid.ex.length - 1, ny = grid.ey.length - 1, nz = grid.ez.length - 1;
  if (nx * ny * nz > maxGrid) return null;
  // interval indices of the shown cells (looked up from the grid's own cell list)
  const n = cells.length, I = new Int32Array(n), J = new Int32Array(n), K = new Int32Array(n), gc = grid.cells;
  // TASKS.csv #3365 — a cutoff's cells are the grid's own, in order (a filter of them): matched walking both lists, where a Map lookup per
  // cell (an object key) was most of a cutoff change's face build. Any other list: the map, as before.
  let gi = 0;
  for (let t = 0; t < n; t++) {
    const c = cells[t];
    while (gi < gc.length && gc[gi] !== c) gi++;
    if (gi === gc.length) { gi = -1; break; }
    I[t] = grid.I[gi]; J[t] = grid.J[gi]; K[t] = grid.K[gi]; gi++;
  }
  if (gi < 0) {
    let pos = grid.posMap;
    if (!pos) { pos = new Map(); for (let t = 0; t < gc.length; t++) pos.set(gc[t], t); grid.posMap = pos; }
    for (let t = 0; t < n; t++) {
      const q = pos.get(cells[t]);
      if (q === undefined) return null;
      I[t] = grid.I[q]; J[t] = grid.J[q]; K[t] = grid.K[q];
    }
  }
  const px = nx + 2, py = ny + 2, pz = nz + 2, at = (i, j, k) => ((k + 1) * py + (j + 1)) * px + (i + 1);
  const occ = new Uint8Array(px * py * pz), Q = new Int32Array(n); // Q: each cell's index in the padded box (#3365)
  for (let t = 0; t < n; t++) occ[(Q[t] = at(I[t], J[t], K[t]))] = 1;
  // #904 — with boundaries, a neighbour of a different value counts as not shown (its face is drawn, from both sides)
  let val = null;
  if (boundaries) { val = classOf ? new Int32Array(px * py * pz) : new Float64Array(px * py * pz); for (let t = 0; t < n; t++) val[Q[t]] = classOf ? classOf(cells[t].value) : cells[t].value; } // #3354 — the class
  // scene-axis neighbour step in grid indices: scene X = +i (east), scene Y = +k (elevation), scene Z = -j (north), as an
  // offset in the padded box, one per face of FACES
  const step = [[1, 0, 0], [0, 0, 1], [0, -1, 0]];
  const off = FACES.map((f) => { const d = step[f.a]; return f.s * (d[0] + d[1] * px + d[2] * px * py); });
  // the neighbour shown (and the same class, with boundaries); #3354 — a contact between two shown cells is drawn once, by the cell
  // whose face points the negative way along its axis
  const POS = Uint8Array.from(FACES, (f) => (f.s > 0 ? 1 : 0));
  const hidden = (nb, v, f) => occ[nb] === 1 && (!val || val[nb] === v || POS[f] === 1);
  // #3365 — each cell's drawn faces (a bit per face) from this one pass; the fill below reads them
  const M = new Uint8Array(n);
  let faces = 0;
  for (let t = 0; t < n; t++) {
    const q = Q[t], v = val ? val[q] : cells[t].value;
    let m = 0;
    for (let f = 0; f < 6; f++) if (!hidden(q + off[f], v, f)) { m |= 1 << f; faces++; }
    M[t] = m;
  }
  const positions = new Float32Array(faces * 12), normals = new Float32Array(faces * 12), colors = new Float32Array(faces * 12);
  const indices = new Uint32Array(faces * 6);
  const { ex, ey, ez } = grid;
  const B = [[0, 0], [0, 0], [0, 0]];
  const lin = new Map(); // #3365 — each colour's linear RGB once (a discrete model has one per class), keyed 0xRRGGBB
  const linear = (c) => {
    const whole = (c[0] | 0) === c[0] && (c[1] | 0) === c[1] && (c[2] | 0) === c[2], key = whole ? c[0] * 65536 + c[1] * 256 + c[2] : -1;
    let L = whole ? lin.get(key) : undefined;
    if (!L) { L = [srgbToLinear(c[0] / 255), srgbToLinear(c[1] / 255), srgbToLinear(c[2] / 255)]; if (whole) lin.set(key, L); }
    return L;
  };
  let q4 = 0;
  for (let t = 0; t < n; t++) {
    const m = M[t];
    if (!m) continue;
    const i = I[t], j = J[t], k = K[t], cv = cells[t].value;
    // scene bounds [low, high] per scene axis (Z = -north, so north's high edge is scene Z's low bound)
    B[0][0] = ex[i] - origin.x; B[0][1] = ex[i + 1] - origin.x; B[1][0] = ez[k] - origin.z; B[1][1] = ez[k + 1] - origin.z; B[2][0] = -(ey[j + 1] - origin.y); B[2][1] = -(ey[j] - origin.y);
    let r = -1, g = 0, b = 0;
    for (let fi = 0; fi < 6; fi++) {
      if (!((m >> fi) & 1)) continue;
      const f = FACES[fi];
      if (r < 0) { const L = linear(colorRGB(cv)); r = L[0]; g = L[1]; b = L[2]; }
      for (let vv = 0; vv < 4; vv++) {
        const p = f.quad[vv], o = (q4 * 4 + vv) * 3;
        positions[o] = B[0][p[0]]; positions[o + 1] = B[1][p[1]]; positions[o + 2] = B[2][p[2]];
        normals[o] = f.n[0]; normals[o + 1] = f.n[1]; normals[o + 2] = f.n[2];
        colors[o] = r; colors[o + 1] = g; colors[o + 2] = b;
      }
      const b4 = q4 * 4, b6 = q4 * 6;
      indices[b6] = b4; indices[b6 + 1] = b4 + 1; indices[b6 + 2] = b4 + 2;
      indices[b6 + 3] = b4; indices[b6 + 4] = b4 + 2; indices[b6 + 5] = b4 + 3;
      q4++;
    }
  }
  return { positions, normals, colors, indices, faces };
}
