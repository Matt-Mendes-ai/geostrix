// TASKS.csv #640 — merge inverted 2D DC/IP lines into one 3D block model. Each line's shown cells (the
// depth-of-investigation envelope, #641) become sample points, the line playing the part a drillhole plays in
// grade estimation; the blocks are filled by inverse-distance weighting (estimation.js, run in its worker).
//
// Two choices make this an interpolation BETWEEN lines and not an invention around them:
//  - a block is kept only when its plan position is within the search radius of at least two lines
//    (betweenLines), and only where samples exist at its depth: nothing is extrapolated beyond the outer lines
//    or below where the lines see;
//  - TASKS.csv #664 — every block takes samples from at least two lines (the estimator's minHoles 2, a line
//    playing a hole). minHoles 1 was chosen when the hole rule counted the nearest 16 samples, which beside a
//    line all come from that line, and emptied a strip along every line; #642 replaced that with a per-hole cap
//    (8 + 8), so minHoles 2 now blends. With minHoles 1, 83 % of the Woodjam blocks were a copy of the nearest
//    line with a step halfway between lines (0 0 0 0 0 33 67 100 100 on two constant lines 300 m apart); with 2,
//    0 % and a smooth inverse-distance blend (1 4 9 18 29 43 57 71 82 91 96 99), measured on the corrected sections.
//  - the search is flat: as wide as the line spacing across the lines, but only a few cells deep, so a block
//    takes its value from the same depth on the neighbouring lines, not from shallower or deeper rock. The
//    estimator searches a sphere, so z is stretched by `stretch` (horizontal / vertical radius) going in and
//    shrunk back coming out.
// Resistivity spans decades, so it is interpolated as log10 and returned in ohm.m.
import { voxelCellSupported } from "./viewer/geomath.js";

// the p-th quantile (0..1) of a list of numbers
export function percentile(values, p) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
}

export const isSectionModel = (m) => m && (m.method === "ip" || m.method === "dc") && Array.isArray(m.cells) && m.cells.length > 0;

// The line models in a project, by property: { ip: [...], dc: [...] }
export function sectionModelsByMethod(voxelModels) {
  const out = { ip: [], dc: [] };
  (voxelModels || []).forEach((m) => { if (isSectionModel(m) && !m.merged) out[m.method].push(m); });
  return out;
}

export function sectionSamples(models) {
  const points = [];
  let dz = Infinity;
  models.forEach((m) => {
    const log = m.method === "dc";
    m.cells.forEach((c) => {
      if (!voxelCellSupported(m, c) || !Number.isFinite(c.value)) return;
      if (log && !(c.value > 0)) return;
      points.push({ x: c.x, y: c.y, z: c.z, value: log ? Math.log10(c.value) : c.value, hole_id: m.id });
      if (c.dz > 0 && c.dz < dz) dz = c.dz;
    });
  });
  return { points, dz: Number.isFinite(dz) ? dz : null };
}

// How far apart the lines are: for each line, the plan distance from its cells to the nearest OTHER line, at
// the 90th percentile of its cells (the far end of a fanning line counts; one end overhanging a shorter
// neighbour doesn't set the radius for the whole survey). The radius is the largest of those x1.1, so a block
// between two lines reaches both.
export function suggestMergeRadius(points) {
  const byLine = new Map();
  points.forEach((p) => { if (!byLine.has(p.hole_id)) byLine.set(p.hole_id, []); byLine.get(p.hole_id).push(p); });
  if (byLine.size < 2) return null;
  const thin = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor((i * arr.length) / n)]));
  const lines = [...byLine.entries()].map(([id, arr]) => [id, thin(arr, 150)]);
  let worst = 0;
  for (const [id, mine] of lines) {
    const others = lines.filter(([o]) => o !== id).flatMap(([, arr]) => arr);
    const gaps = mine.map((p) => {
      let best = Infinity;
      for (const q of others) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < best) best = d; }
      return Math.sqrt(best);
    }).sort((a, b) => a - b);
    worst = Math.max(worst, gaps[Math.floor(gaps.length * 0.9)] ?? 0);
  }
  return worst > 0 ? Math.ceil((worst * 1.1) / 5) * 5 : null;
}

// The estimation request: stretched points and grid. `cell` is the block size in plan (m), `vertical` the
// search's vertical half-depth (m, default three section cells). Grows the plan cell until the grid fits
// `maxBlocks`, reporting the cell it used.
export function mergeRequest(points, { radius, cell, dz, vertical, maxBlocks = 200000 }) {
  const vz = vertical > 0 ? vertical : 3 * dz;
  const stretch = Math.max(1, radius / vz);
  let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
  points.forEach((p) => {
    if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
    if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z;
  });
  zmin -= dz / 2; zmax += dz / 2;
  let c = cell;
  const count = (cc) => Math.max(1, Math.round((xmax - xmin) / cc)) * Math.max(1, Math.round((ymax - ymin) / cc)) * Math.max(1, Math.round((zmax - zmin) / dz));
  while (count(c) > maxBlocks) c *= 1.25;
  c = Math.round(c * 10) / 10;
  return {
    stretch, cell: c,
    points: points.map((p) => ({ ...p, z: p.z * stretch })),
    opts: {
      bounds: { xmin, xmax, ymin, ymax, zmin: zmin * stretch, zmax: zmax * stretch },
      cellSize: { dx: c, dy: c, dz: dz * stretch },
      method: "idw2", searchRadius: radius, minSamples: 2, maxSamples: 16, minHoles: 2, lengthWeight: false, maxBlocks, // #664
    },
  };
}

// estimateBlockModel's cells back to real elevations / units.
export function unstretchCells(cells, stretch, method) {
  const log = method === "dc";
  return cells.map((c) => ({ x: c.x, y: c.y, z: c.z / stretch, dx: c.dx, dy: c.dy, dz: c.dz / stretch, value: log ? 10 ** c.value : c.value, nSamples: c.nSamples, nLines: c.nHoles }));
}

// Keep the blocks whose plan position is within `radius` of at least two lines (see the header). Checked once
// per plan column against each line's cells in plan, which is cheap next to the estimate itself.
export function betweenLines(cells, points, radius) {
  const lines = new Map();
  points.forEach((p) => {
    if (!lines.has(p.hole_id)) lines.set(p.hole_id, new Map());
    lines.get(p.hole_id).set(`${Math.round(p.x)}|${Math.round(p.y)}`, [p.x, p.y]);
  });
  const plans = [...lines.values()].map((m) => [...m.values()]);
  const r2 = radius * radius;
  const verdict = new Map();
  return cells.filter((c) => {
    const k = `${c.x}|${c.y}`;
    let ok = verdict.get(k);
    if (ok === undefined) {
      let near = 0;
      for (const pl of plans) {
        if (pl.some(([x, y]) => (x - c.x) ** 2 + (y - c.y) ** 2 <= r2)) near++;
        if (near >= 2) break;
      }
      ok = near >= 2;
      verdict.set(k, ok);
    }
    return ok;
  });
}
