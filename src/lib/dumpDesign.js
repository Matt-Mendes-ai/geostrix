// TASKS.csv #1880 — a WASTE DUMP or STOCKPILE from a footprint: the footprint (a closed design string) is a flat platform at the
// crest elevation; outward of it the surface falls at the angle of repose until it meets the ground, so the toe follows the
// terrain. Grid-based like the pit design: the dump is every cell where that surface stands above the ground; its solid is the
// surface over the ground, closed where the two meet. Capacity is the volume between them (loose, as placed) and the tonnes at
// the in-situ density over the swell factor. Pure: no three.js, no React.
import { ringContains } from "./polygonRings.js";
import { meshVolume } from "./unitVolumes.js";

const RAD = Math.PI / 180;
export const MAX_DUMP_CELLS = 250000;

// footprint: [[x, y, z], ...] closed in plan; crestZ: the platform's elevation; reposeDeg: the slope of the sides; groundAt(x, y) ->
// elevation (NaN unknown); flatZ: the ground where groundAt knows none. -> { positions, indices, volume, footprintArea, dumpArea,
// maxHeight, toeReach, aboveCrestShare, cell, nCells, coarsened } or null
export function dumpFromFootprint(footprint, { crestZ, reposeDeg, groundAt = null, flatZ = null, maxCells = MAX_DUMP_CELLS } = {}) {
  const ring = (footprint || []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [p[0], p[1]]);
  if (ring.length < 3 || !Number.isFinite(crestZ) || !(reposeDeg > 0 && reposeDeg < 90)) return null;
  const tanR = Math.tan(reposeDeg * RAD);
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fy0 = Math.min(...ys), fy1 = Math.max(...ys);
  const ground = (x, y) => { const g = groundAt ? groundAt(x, y) : NaN; return Number.isFinite(g) ? g : (Number.isFinite(flatZ) ? flatZ : NaN); };
  // the lowest ground near the footprint decides how far the slope can reach
  let gMin = Infinity, gMax = -Infinity;
  const probe = Math.max(fx1 - fx0, fy1 - fy0) / 20 || 1;
  for (let y = fy0 - probe; y <= fy1 + probe; y += probe) for (let x = fx0 - probe; x <= fx1 + probe; x += probe) { const g = ground(x, y); if (Number.isFinite(g)) { if (g < gMin) gMin = g; if (g > gMax) gMax = g; } }
  if (!Number.isFinite(gMin)) return null;
  const reach = Math.max(0, crestZ - gMin) / tanR;
  let cell = Math.max(0.5, Math.max((Math.max(fx1 - fx0, fy1 - fy0) + 2 * reach) / 200, reach / 40)), coarsened = false;
  const bx0 = fx0 - reach - cell, bx1 = fx1 + reach + cell, by0 = fy0 - reach - cell, by1 = fy1 + reach + cell;
  const dims = () => [Math.max(2, Math.ceil((bx1 - bx0) / cell) + 1), Math.max(2, Math.ceil((by1 - by0) / cell) + 1)];
  let [nx, ny] = dims();
  while (nx * ny > maxCells) { cell *= 1.25; coarsened = true; [nx, ny] = dims(); }
  const N = nx * ny, X = (i) => bx0 + i * cell, Y = (j) => by0 + j * cell;
  const inFoot = new Uint8Array(N), g = new Float64Array(N);
  let footCells = 0, aboveCrest = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, x = X(i), y = Y(j);
    g[c] = ground(x, y);
    if (ringContains(ring, [x, y])) { inFoot[c] = 1; footCells++; if (g[c] >= crestZ) aboveCrest++; }
  }
  if (!footCells) return null;
  // the plan distance of every cell from the footprint, out to the reach (from its boundary cells)
  const dist = new Float64Array(N).fill(Infinity);
  const R = Math.ceil(reach / cell);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i;
    if (!inFoot[c]) continue;
    dist[c] = 0;
    const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 || !inFoot[c - 1] || !inFoot[c + 1] || !inFoot[c - nx] || !inFoot[c + nx];
    if (!edge) continue;
    for (let dj = -R; dj <= R; dj++) { const jj = j + dj; if (jj < 0 || jj >= ny) continue; for (let di = -R; di <= R; di++) { const ii = i + di; if (ii < 0 || ii >= nx) continue; const q = jj * nx + ii; if (inFoot[q]) continue; const d = Math.hypot(di, dj) * cell; if (d < dist[q]) dist[q] = d; } }
  }
  // the surface and the dump
  const z = new Float64Array(N), inDump = new Uint8Array(N);
  let volume = 0, dumpCells = 0, maxHeight = 0;
  for (let c = 0; c < N; c++) {
    z[c] = inFoot[c] ? crestZ : crestZ - dist[c] * tanR;
    if (Number.isFinite(g[c]) && z[c] > g[c] + 1e-6) { inDump[c] = 1; dumpCells++; volume += (z[c] - g[c]) * cell * cell; if (z[c] - g[c] > maxHeight) maxHeight = z[c] - g[c]; }
  }
  if (!dumpCells) return { positions: new Float64Array(0), indices: new Uint32Array(0), volume: 0, footprintArea: footCells * cell * cell, dumpArea: 0, maxHeight: 0, toeReach: reach, aboveCrestShare: aboveCrest / footCells, cell, nCells: 0, coarsened };
  // a closed solid: the top over the dump cells, the ground under them, meeting on a one-cell ring at the ground
  const used = new Uint8Array(N);
  const onRing = (c) => { const j = Math.floor(c / nx), i = c - j * nx; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && ii < nx && jj >= 0 && jj < ny && inDump[jj * nx + ii]) return true; } return false; };
  for (let c = 0; c < N; c++) if (Number.isFinite(g[c]) && (inDump[c] || onRing(c))) used[c] = 1;
  const topOf = new Int32Array(N).fill(-1), botOf = new Int32Array(N).fill(-1), pos = [], idx = [];
  const node = (c, top) => {
    const j = Math.floor(c / nx), i = c - j * nx;
    if (!inDump[c]) { if (topOf[c] < 0) { topOf[c] = pos.length / 3; pos.push(X(i), Y(j), g[c]); } return topOf[c]; } // the ring: one node, on the ground
    const arr = top ? topOf : botOf;
    if (arr[c] < 0) { arr[c] = pos.length / 3; pos.push(X(i), Y(j), top ? z[c] : g[c]); }
    return arr[c];
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (!(used[a] && used[b] && used[c] && used[d])) continue;
    if (!(inDump[a] || inDump[b] || inDump[c] || inDump[d])) continue;
    // split the quad along a diagonal that touches the dump: a diagonal between two ring nodes would be shared by all four
    // triangles (the top and bottom sheets pinched together along it), which is not a manifold edge
    if (!inDump[a] && !inDump[d]) {
      idx.push(node(b, true), node(d, true), node(c, true), node(b, true), node(c, true), node(a, true)); // top, facing up
      idx.push(node(b, false), node(c, false), node(d, false), node(b, false), node(a, false), node(c, false)); // bottom, facing down
    } else {
      idx.push(node(a, true), node(b, true), node(d, true), node(a, true), node(d, true), node(c, true)); // top, facing up
      idx.push(node(a, false), node(d, false), node(b, false), node(a, false), node(c, false), node(d, false)); // bottom, facing down
    }
  }
  const positions = Float64Array.from(pos), indices = Uint32Array.from(idx);
  const meshVol = meshVolume(positions, indices);
  if (meshVol < 0) for (let t = 0; t < indices.length; t += 3) { const k = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = k; }
  return { positions, indices, volume, meshVolume: Math.abs(meshVol), footprintArea: footCells * cell * cell, dumpArea: dumpCells * cell * cell, maxHeight, toeReach: reach, aboveCrestShare: aboveCrest / footCells, cell, nCells: dumpCells, coarsened };
}

// loose tonnes: the in-situ density over the swell factor (broken rock takes more room than it did in place)
export const looseTonnes = (volume, density, swell = 1) => (density > 0 ? (volume * density) / Math.max(1, swell) : null);
