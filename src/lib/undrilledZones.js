// TASKS.csv #1139 — "zones of area not covered by drilling in a modelled 3D unit", with the coverage as a threshold
// (Matt: "some drill holes are covering well an area, while we have gaps in other areas").
//
// The unit (a closed solid, world E, N, Z) is cut into blocks with the same vertical-ray coding the surface solids
// use (surfaceSolids.js surfacesToBlock). A block is COVERED when a drillhole trace passes within `coverM` of its
// centre: the true 3D distance to the trace's segments, not to sample points. What is left is the undrilled part of the
// unit, split into face-connected zones, each with its volume (cells x cell volume, the number the blocky shell from
// unitVolumes.js unitShell encloses exactly) and centre.
//
// Segments are bucketed on a grid of `coverM` cubes, so a block only tests the segments in the 27 buckets around it:
// every segment within coverM of the centre is in one of them. Pure: no three.js, no React.
import { surfacesToBlock, suggestCellSize } from "./surfaceSolids.js";
import { t as tr } from "./i18n.js";

// squared distance from (px, py, pz) to segment s (6 numbers from `o` in `seg`)
function segDist2(seg, o, px, py, pz) {
  const ax = seg[o], ay = seg[o + 1], az = seg[o + 2];
  const ux = seg[o + 3] - ax, uy = seg[o + 4] - ay, uz = seg[o + 5] - az;
  const wx = px - ax, wy = py - ay, wz = pz - az;
  const L = ux * ux + uy * uy + uz * uz;
  let t = L > 0 ? (wx * ux + wy * uy + wz * uz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = wx - t * ux, dy = wy - t * uy, dz = wz - t * uz;
  return dx * dx + dy * dy + dz * dz;
}

// The box of a mesh, grown by `pad` on every side
export function meshBox(positions, pad = 0) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return [x0 - pad, x1 + pad, y0 - pad, y1 + pad, z0 - pad, z1 + pad];
}

// A block size for the unit: about `target` blocks in its box, and no coarser than half the coverage distance when
// that stays under `maxCells` (a block bigger than the distance makes the gaps' edges coarse)
export function defaultCellSize(positions, coverM, target = 300_000, maxCells = 2_000_000) {
  const e = meshBox(positions);
  let c = suggestCellSize(e, target);
  const half = coverM > 0 ? coverM / 2 : c;
  if (c > half) {
    const n = Math.ceil((e[1] - e[0]) / half) * Math.ceil((e[3] - e[2]) / half) * Math.ceil((e[5] - e[4]) / half);
    if (n <= maxCells) c = +half.toPrecision(3);
  }
  return c;
}

// solid: { positions (world E, N, Z), indices } — closed. traces: [[{x, y, z}, ...], ...] world polylines (desurveyed
// holes). coverM: covered within this distance of a trace. cellM: block size. insideOnly: count only the parts of the
// traces inside the unit. minZoneM3: gaps smaller than this are left out of the zones (counted in `ignored`).
// Returns { block: { extent, resolution, ids (1 = not covered; x-major, z fastest), labels: ["not covered"] },
// cellVolume, unitCells, coveredCells, uncoveredCells, zones: [{ cells, volumeM3, centre: {x, y, z}, box }],
// ignored: { zones, cells }, segments, cellM }.
export function undrilledZones({ solid, traces, coverM, cellM, insideOnly = false, minZoneM3 = 0, maxCells = 2_000_000 }) {
  if (!(coverM > 0)) throw new Error(tr("Enter a coverage distance above zero."));
  const cell = cellM > 0 ? cellM : defaultCellSize(solid.positions, coverM, 300_000, maxCells);
  // the box snapped to whole blocks plus one: block faces on round coordinates, so a solid's flat faces fall on block
  // faces, not through block centres
  const e0 = meshBox(solid.positions);
  const extent = e0.map((v, i) => (i % 2 ? Math.ceil(v / cell) + 1 : Math.floor(v / cell) - 1) * cell);
  const coded = surfacesToBlock({ solids: [{ name: "unit", positions: solid.positions, indices: solid.indices }], extent, cell, maxCells, extend: false });
  const { ids, labels, resolution: [nx, ny, nz] } = coded.block;
  const [xmin, xmax, ymin, ymax, zmin, zmax] = coded.block.extent;
  const dx = (xmax - xmin) / nx, dy = (ymax - ymin) / ny, dz = (zmax - zmin) / nz;
  const unitId = labels.indexOf("unit") + 1; // ids are label index + 1 (0 = outside the box)
  const isUnit = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && ids[i * ny * nz + j * nz + k] === unitId;
  const cellOf = (x, y, z) => [Math.floor((x - xmin) / dx), Math.floor((y - ymin) / dy), Math.floor((z - zmin) / dz)];

  // trace segments; with insideOnly, pieces no longer than half a block, kept when their midpoint's block is the unit
  const segs = [];
  const step = Math.min(dx, dy, dz) / 2;
  for (const tr0 of traces || []) {
    for (let i = 1; i < (tr0?.length || 0); i++) {
      const a = tr0[i - 1], b = tr0[i];
      if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) continue;
      if (!insideOnly) { segs.push(a.x, a.y, a.z, b.x, b.y, b.z); continue; }
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), n = Math.max(1, Math.ceil(len / step));
      for (let s = 0; s < n; s++) {
        const f0 = s / n, f1 = (s + 1) / n, fm = (f0 + f1) / 2;
        if (!isUnit(...cellOf(a.x + (b.x - a.x) * fm, a.y + (b.y - a.y) * fm, a.z + (b.z - a.z) * fm))) continue;
        segs.push(a.x + (b.x - a.x) * f0, a.y + (b.y - a.y) * f0, a.z + (b.z - a.z) * f0, a.x + (b.x - a.x) * f1, a.y + (b.y - a.y) * f1, a.z + (b.z - a.z) * f1);
      }
    }
  }
  const nSeg = segs.length / 6;

  // buckets of coverM cubes over the unit's box (grown by coverM): each segment goes in every bucket its box touches
  const B = coverM, bx0 = xmin - B, by0 = ymin - B, bz0 = zmin - B;
  const bnx = Math.ceil((xmax - xmin + 2 * B) / B), bny = Math.ceil((ymax - ymin + 2 * B) / B), bnz = Math.ceil((zmax - zmin + 2 * B) / B);
  const buckets = new Map();
  const clampB = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  for (let s = 0; s < nSeg; s++) {
    const o = s * 6;
    const lo = [Math.min(segs[o], segs[o + 3]), Math.min(segs[o + 1], segs[o + 4]), Math.min(segs[o + 2], segs[o + 5])];
    const hi = [Math.max(segs[o], segs[o + 3]), Math.max(segs[o + 1], segs[o + 4]), Math.max(segs[o + 2], segs[o + 5])];
    // a segment wholly outside the grown box can cover nothing
    if (hi[0] < bx0 || lo[0] > bx0 + bnx * B || hi[1] < by0 || lo[1] > by0 + bny * B || hi[2] < bz0 || lo[2] > bz0 + bnz * B) continue;
    const i0 = clampB(Math.floor((lo[0] - bx0) / B), bnx), i1 = clampB(Math.floor((hi[0] - bx0) / B), bnx);
    const j0 = clampB(Math.floor((lo[1] - by0) / B), bny), j1 = clampB(Math.floor((hi[1] - by0) / B), bny);
    const k0 = clampB(Math.floor((lo[2] - bz0) / B), bnz), k1 = clampB(Math.floor((hi[2] - bz0) / B), bnz);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const key = (i * bny + j) * bnz + k;
      let l = buckets.get(key); if (!l) buckets.set(key, (l = [])); l.push(o);
    }
  }

  const c2 = coverM * coverM;
  const out = new Uint8Array(ids.length);
  let unitCells = 0, uncovered = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const at = i * ny * nz + j * nz + k;
    if (ids[at] !== unitId) continue;
    unitCells++;
    const px = xmin + (i + 0.5) * dx, py = ymin + (j + 0.5) * dy, pz = zmin + (k + 0.5) * dz;
    const bi = Math.floor((px - bx0) / B), bj = Math.floor((py - by0) / B), bk = Math.floor((pz - bz0) / B);
    let hit = false;
    for (let a = bi - 1; a <= bi + 1 && !hit; a++) for (let b = bj - 1; b <= bj + 1 && !hit; b++) for (let c = bk - 1; c <= bk + 1 && !hit; c++) {
      if (a < 0 || b < 0 || c < 0 || a >= bnx || b >= bny || c >= bnz) continue;
      const l = buckets.get((a * bny + b) * bnz + c);
      if (l) for (let q = 0; q < l.length; q++) if (segDist2(segs, l[q], px, py, pz) <= c2) { hit = true; break; }
    }
    if (!hit) { out[at] = 1; uncovered++; }
  }

  // face-connected zones of uncovered blocks, largest first; those under minZoneM3 are dropped from the block
  const cellVolume = dx * dy * dz;
  const seen = new Uint8Array(ids.length);
  const zones = [], ignored = { zones: 0, cells: 0 };
  const stack = [];
  for (let start = 0; start < out.length; start++) {
    if (!out[start] || seen[start]) continue;
    const members = [];
    seen[start] = 1; stack.push(start);
    while (stack.length) {
      const at = stack.pop(); members.push(at);
      const i = Math.floor(at / (ny * nz)), j = Math.floor(at / nz) % ny, k = at % nz;
      for (const [a, b, c] of [[i - 1, j, k], [i + 1, j, k], [i, j - 1, k], [i, j + 1, k], [i, j, k - 1], [i, j, k + 1]]) {
        if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
        const n = a * ny * nz + b * nz + c;
        if (out[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const volumeM3 = members.length * cellVolume;
    if (volumeM3 < minZoneM3) { ignored.zones++; ignored.cells += members.length; for (const at of members) out[at] = 0; continue; }
    let sx = 0, sy = 0, sz = 0;
    const box = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const at of members) {
      const i = Math.floor(at / (ny * nz)), j = Math.floor(at / nz) % ny, k = at % nz;
      const x = xmin + (i + 0.5) * dx, y = ymin + (j + 0.5) * dy, z = zmin + (k + 0.5) * dz;
      sx += x; sy += y; sz += z;
      box[0] = Math.min(box[0], x - dx / 2); box[1] = Math.max(box[1], x + dx / 2); box[2] = Math.min(box[2], y - dy / 2);
      box[3] = Math.max(box[3], y + dy / 2); box[4] = Math.min(box[4], z - dz / 2); box[5] = Math.max(box[5], z + dz / 2);
    }
    const m = members.length;
    zones.push({ cells: m, volumeM3, centre: { x: sx / m, y: sy / m, z: sz / m }, box });
  }
  zones.sort((a, b) => b.cells - a.cells);
  return {
    block: { extent: coded.block.extent, resolution: [nx, ny, nz], ids: out, labels: ["not covered"] },
    cellVolume, unitCells, coveredCells: unitCells - uncovered, uncoveredCells: uncovered, zones, ignored, segments: nSeg, cellM: cell,
  };
}
