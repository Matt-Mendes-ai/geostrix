// TASKS.csv #1780 (review #1646, Kodiak) — a shell (closed solid) of a block model at a value range: the chargeability high, the
// resistivity low, a band. The model's cells are read onto a regular node lattice (a tensor mesh's padding and layers are
// resampled at the model's typical cell size), the field is turned into "inside = positive" for the chosen range, and
// marching cubes (lib/marchingCubes.js, the grade shell's) draws the zero surface. A shell that reaches the model's own
// edge is closed there, and says so (closingVertices, as the grade shell's artificial closure). Pure: no three.js.
import { rectilinearGrid } from "./voxelFaces.js";
import { marchingCubes } from "./marchingCubes.js";
import { median } from "./arrayStats.js"; // TASKS.csv #1114

// the interval of `edges` (sorted boundaries) that holds x, or -1
function intervalOf(edges, x) {
  let lo = 0, hi = edges.length - 1;
  if (!(x >= edges[0] && x <= edges[hi])) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (edges[m] <= x) lo = m; else hi = m; }
  return lo;
}

// lo / hi: the range (either may be -Infinity / Infinity / NaN for open); -> { positions (Float32Array, world E N Z),
// indices (Uint32Array), volumeM3, cellsInside, cellVolumeM3, closingVertices, nodes: [nx, ny, nz], spacing: [dx, dy, dz],
// coarsened } | null (not a rectilinear model, or nothing in the range)
export function voxelShell(model, { lo = -Infinity, hi = Infinity } = {}, { maxNodes = 1.5e6 } = {}) {
  const cells = model?.cells || [];
  const G = rectilinearGrid(cells);
  if (!G) return null;
  const L = Number.isFinite(lo) ? lo : -Infinity, H = Number.isFinite(hi) ? hi : Infinity;
  const inside = (v) => Number.isFinite(v) && v >= L && v <= H;
  let cellsInside = 0, cellVolumeM3 = 0;
  for (const c of cells) if (inside(c.value)) { cellsInside++; cellVolumeM3 += c.dx * c.dy * c.dz; }
  if (!cellsInside) return null;
  // the lattice: the typical cell size per axis, coarsened together until the node count fits
  const diffs = (e) => Array.from({ length: e.length - 1 }, (_, i) => e[i + 1] - e[i]);
  let dx = median(diffs(G.ex)), dy = median(diffs(G.ey)), dz = median(diffs(G.ez));
  const span = [G.ex[G.ex.length - 1] - G.ex[0], G.ey[G.ey.length - 1] - G.ey[0], G.ez[G.ez.length - 1] - G.ez[0]];
  const count = () => (Math.floor(span[0] / dx) + 1) * (Math.floor(span[1] / dy) + 1) * (Math.floor(span[2] / dz) + 1);
  let coarsened = false;
  while (count() > maxNodes) { dx *= 1.25; dy *= 1.25; dz *= 1.25; coarsened = true; }
  const nx = Math.floor(span[0] / dx) + 1, ny = Math.floor(span[1] / dy) + 1, nz = Math.floor(span[2] / dz) + 1;
  const ox = G.ex[0] + (span[0] - (nx - 1) * dx) / 2, oy = G.ey[0] + (span[1] - (ny - 1) * dy) / 2, oz = G.ez[0] + (span[2] - (nz - 1) * dz) / 2;
  // the cell at each (I, J, K) of the model's own intervals
  const nI = G.ex.length - 1, nJ = G.ey.length - 1;
  const at = new Map();
  cells.forEach((c, t) => at.set(G.I[t] + nI * (G.J[t] + nJ * G.K[t]), c.value));
  // "inside = positive" field: the signed distance in value to the nearer bound (a band), or past the one bound
  const field = new Float32Array(nx * ny * nz).fill(NaN);
  for (let k = 0; k < nz; k++) { const K = intervalOf(G.ez, oz + k * dz); if (K < 0) continue;
    for (let j = 0; j < ny; j++) { const J = intervalOf(G.ey, oy + j * dy); if (J < 0) continue;
      for (let i = 0; i < nx; i++) { const I = intervalOf(G.ex, ox + i * dx); if (I < 0) continue;
        const v = at.get(I + nI * (J + nJ * K));
        if (!Number.isFinite(v)) continue;
        const a = Number.isFinite(L) ? v - L : Infinity, b = Number.isFinite(H) ? H - v : Infinity;
        field[i + nx * (j + ny * k)] = Math.min(a, b);
      } } }
  const mc = marchingCubes(field, nx, ny, nz, 0, { origin: { x: ox, y: oy, z: oz }, spacing: { dx, dy, dz }, noData: "outside" });
  if (!mc.faces.length) return null;
  const positions = new Float32Array(mc.vertices.length * 3);
  mc.vertices.forEach(([x, y, z], i) => { positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z; });
  const indices = Uint32Array.from(mc.faces.flat());
  // the enclosed volume by the divergence theorem (the faces are wound consistently by marching cubes)
  let vol6 = 0;
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2], bx = positions[b], by = positions[b + 1], bz = positions[b + 2], cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return { positions, indices, volumeM3: Math.abs(vol6) / 6, cellsInside, cellVolumeM3, closingVertices: mc.closingVertices || 0, nodes: [nx, ny, nz], spacing: [dx, dy, dz], coarsened };
}
