// TASKS.csv #3580 (a) (Main's go-ahead after Matt's Macpass report) — a grade shell's grid was one box round every sample: Macpass drills
// clusters up to ~25 km apart, so the box was 533 x 356 x 26 nodes at 47.5 m with 0.12 % of them within the search of a sample, and the
// block budget (which counts every node: marching cubes needs them) forced 47.5 m cells. The grid is now one box per drilled cluster:
// clusters whose samples are more than linkM apart (twice the search, so no node can see samples of two of them) get boxes of their own,
// each its samples' box plus the pad (the rule the single box keeps at its edges); boxes that overlap are merged. Only worth it where the
// boxes hold well under the whole box (maxShare): otherwise the single box, as before. On Macpass: 18 boxes, 43,033 nodes at 47.5 m against
// 4,933,448, so 10 m cells fit 5 million blocks.
//
// drilledBoxes(points [{ x, y, z }] in the grid's frame, { bounds: the single box, padM, linkM, maxShare })
//   -> [{ bounds, idx: the indices of the points in it }] (one entry, the single box with every point, when splitting does not pay)
export function drilledBoxes(points, { bounds, padM, linkM, maxShare = 0.5 }) {
  const n = points?.length || 0, all = () => [{ bounds, idx: Array.from({ length: n }, (_, i) => i) }];
  const L = Number(linkM);
  if (n < 2 || !(L > 0) || !Number.isFinite(L)) return all();
  // single linkage on an L grid: points in the same or neighbouring cells join (so any two within L do; a few further apart may too, which
  // only merges more, never splits a cluster)
  const key = (i, j, k) => `${i},${j},${k}`, cell = new Map();
  points.forEach((p, i) => { const k = key(Math.floor(p.x / L), Math.floor(p.y / L), Math.floor(p.z / L)); (cell.get(k) || cell.set(k, []).get(k)).push(i); });
  const parent = new Map([...cell.keys()].map((k) => [k, k]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  for (const k of cell.keys()) {
    const [a, b, c] = k.split(",").map(Number);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) { const o = key(a + i, b + j, c + l); if (parent.has(o)) { const r1 = find(o), r2 = find(k); if (r1 !== r2) parent.set(r1, r2); } }
  }
  const groups = new Map();
  for (const [k, idx] of cell) { const r = find(k); (groups.get(r) || groups.set(r, []).get(r)).push(...idx); }
  if (groups.size < 2) return all();
  const pad = Math.max(0, Number(padM) || 0);
  const boxOf = (idx) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const i of idx) { const p = points[i]; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
    return { xmin: Math.max(bounds.xmin, x0 - pad), xmax: Math.min(bounds.xmax, x1 + pad), ymin: Math.max(bounds.ymin, y0 - pad), ymax: Math.min(bounds.ymax, y1 + pad), zmin: Math.max(bounds.zmin, z0 - pad), zmax: Math.min(bounds.zmax, z1 + pad) };
  };
  let boxes = [...groups.values()].map((idx) => ({ idx, bounds: boxOf(idx) }));
  // boxes that overlap (a cluster wrapped round another, or two within twice the pad) merge, until none do: a node in two boxes would
  // be drawn twice
  const overlap = (a, b) => a.xmin < b.xmax && b.xmin < a.xmax && a.ymin < b.ymax && b.ymin < a.ymax && a.zmin < b.zmax && b.zmin < a.zmax;
  for (let merged = true; merged && boxes.length > 1;) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (!overlap(boxes[i].bounds, boxes[j].bounds)) continue;
      const idx = boxes[i].idx.concat(boxes[j].idx);
      boxes = boxes.filter((_, k) => k !== i && k !== j).concat([{ idx, bounds: boxOf(idx) }]);
      merged = true; break outer;
    }
  }
  if (boxes.length < 2) return all();
  const vol = (b) => Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin) * Math.max(0, b.zmax - b.zmin);
  if (boxes.reduce((s, b) => s + vol(b.bounds), 0) > maxShare * vol(bounds)) return all();
  return boxes.sort((a, b) => b.idx.length - a.idx.length); // the largest first (its kriging variogram, when fitted, is the run's)
}

// TASKS.csv #3922 (Matt: settings read from the data, "box only around the grade") — a Tight shell's grid only round the composites at or above
// the cut-off: within each drilled cluster's box (drilledBoxes, so a box is never larger than before), one box per group of them (groups more
// than twice marginM apart get their own), each their extent plus marginM, kept inside the cluster's box. marginM is the search plus the pad (or
// a cell, if larger): a node further than the search from every composite at the cut-off is estimated from composites below it, so it is below
// the cut-off too (an inverse-distance mean cannot rise above its largest sample; the plane search's reach cut keeps the shell within the search
// as well), and the shell closes inside the box as it did inside the larger one. Ground with no composite at the cut-off gets no node at all.
// Not for an envelope (its indicators reach further) — the caller keeps drilledBoxes there. idx: the composites inside each box.
// drilled: drilledBoxes' result for the same points, when the caller has it.
// -> [{ bounds, idx, atCut }] (largest first), or drilledBoxes' own result when no composite reaches the cut-off
export function gradeBoxes(points, cutoff, { bounds, padM, linkM, marginM, maxShare = 0.5, drilled: given = null }) {
  const drilled = given || drilledBoxes(points, { bounds, padM, linkM, maxShare }); // given: the caller's drilledBoxes, already made
  const M = Number(marginM), cut = Number(cutoff);
  if (!(M > 0) || !Number.isFinite(M) || !Number.isFinite(cut)) return drilled;
  const out = [];
  for (const d of drilled) {
    const at = d.idx.filter((i) => points[i].value >= cut);
    if (!at.length) continue; // no composite at the cut-off in this cluster: no shell can form there
    let boxes = linkGroups(points, at, 2 * M).map((g) => ({ at: g, bounds: clip(extentOf(points, g, M), d.bounds) }));
    for (let merged = true; merged && boxes.length > 1;) {
      merged = false;
      outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        if (!overlaps(boxes[i].bounds, boxes[j].bounds)) continue;
        const g = boxes[i].at.concat(boxes[j].at);
        boxes = boxes.filter((_, k) => k !== i && k !== j).concat([{ at: g, bounds: clip(extentOf(points, g, M), d.bounds) }]);
        merged = true; break outer;
      }
    }
    for (const b of boxes) out.push({ bounds: b.bounds, idx: d.idx.filter((i) => inside(points[i], b.bounds)), atCut: b.at.length });
  }
  if (!out.length) return drilled;
  return out.sort((a, b) => b.idx.length - a.idx.length);
}

// the blocks a set of boxes holds at a cell { dx, dy, dz } (a number: cubic), counted as the run counts them (gridBlockCount per axis)
export function boxesBlocks(boxes, cell) {
  const g = typeof cell === "number" ? { dx: cell, dy: cell, dz: cell } : cell;
  const n = (a, z, d) => Math.max(1, Math.round((z - a) / Math.max(0.01, d)));
  return (boxes || []).reduce((s, { bounds: b }) => s + n(b.xmin, b.xmax, g.dx) * n(b.ymin, b.ymax, g.dy) * n(b.zmin, b.zmax, g.dz), 0);
}

const overlaps = (a, b) => a.xmin < b.xmax && b.xmin < a.xmax && a.ymin < b.ymax && b.ymin < a.ymax && a.zmin < b.zmax && b.zmin < a.zmax;
const inside = (p, b) => p.x >= b.xmin && p.x <= b.xmax && p.y >= b.ymin && p.y <= b.ymax && p.z >= b.zmin && p.z <= b.zmax;
const clip = (b, o) => ({ xmin: Math.max(o.xmin, b.xmin), xmax: Math.min(o.xmax, b.xmax), ymin: Math.max(o.ymin, b.ymin), ymax: Math.min(o.ymax, b.ymax), zmin: Math.max(o.zmin, b.zmin), zmax: Math.min(o.zmax, b.zmax) });
function extentOf(points, idx, m) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const i of idx) { const p = points[i]; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
  return { xmin: x0 - m, xmax: x1 + m, ymin: y0 - m, ymax: y1 + m, zmin: z0 - m, zmax: z1 + m };
}
// single linkage of the points idx on an L grid (as drilledBoxes): -> [[indices], ...]
function linkGroups(points, idx, L) {
  const key = (i, j, k) => `${i},${j},${k}`, cell = new Map();
  for (const i of idx) { const p = points[i], k = key(Math.floor(p.x / L), Math.floor(p.y / L), Math.floor(p.z / L)); (cell.get(k) || cell.set(k, []).get(k)).push(i); }
  const parent = new Map([...cell.keys()].map((k) => [k, k]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  for (const k of cell.keys()) {
    const [a, b, c] = k.split(",").map(Number);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) { const o = key(a + i, b + j, c + l); if (parent.has(o)) { const r1 = find(o), r2 = find(k); if (r1 !== r2) parent.set(r1, r2); } }
  }
  const groups = new Map();
  for (const [k, list] of cell) { const r = find(k); (groups.get(r) || groups.set(r, []).get(r)).push(...list); }
  return [...groups.values()];
}

// marching-cubes results of several grids as one mesh: vertices in order, faces offset, closing vertices summed; parts: each grid's vertex
// range, for the support colours (each vertex is looked up in its own grid)
export function mergeMeshes(mcs) {
  if (mcs.length === 1) return { ...mcs[0], parts: [{ start: 0, end: mcs[0].vertices.length, gi: 0 }] };
  const vertices = [], faces = [], parts = [];
  let closingVertices = 0, skippedCubes = 0;
  mcs.forEach((m, gi) => {
    const off = vertices.length;
    for (const v of m.vertices) vertices.push(v);
    for (const f of m.faces) faces.push([f[0] + off, f[1] + off, f[2] + off]);
    closingVertices += m.closingVertices || 0; skippedCubes += m.skippedCubes || 0;
    parts.push({ start: off, end: vertices.length, gi });
  });
  return { vertices, faces, closingVertices, skippedCubes, parts };
}
