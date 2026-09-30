// TASKS.csv #324 (follow-up) — an adaptive (octree) model written as UBC-GIF OcTree mesh + model files, the
// format GIFtools, Geoscience ANALYST and the UBC-GIF codes read. Built from the model's cell list alone (the
// saved model keeps no tree), so it works for any GeoStrix model whose cells are cubes of the smallest size
// times a power of two, each aligned to its own size — which is what a discretize TreeMesh produces.
//
// Format (as discretize 0.12 reads and writes it, mixins/mesh_io.py):
//   line 1  nx ny nz        base-mesh size in SMALLEST cells (powers of two)
//   line 2  x0 y0 z0        TOP south-west corner
//   line 3  hx hy hz        smallest cell size
//   line 4  n               number of cells
//   then    i j k size      per cell: 1-based index of its top-south-west smallest cell (k counted DOWN from the
//                           top) and its size in smallest cells
// and the model file has one value per cell, in the same order. The cell list must TILE the whole base mesh,
// so GeoStrix's core cells are completed with no-data cells: the power-of-two cube is subdivided only where
// it overlaps model cells, and every part that holds none becomes one no-data cell as large as possible.
// Cells are listed in UBC order — by k (top first), then j, then i — checked against discretize's own
// _ubc_order on a refined TreeMesh.

const pow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

// cells: [{x, y, z, dx, dy, dz, value, support?}] (centres, sizes; z = elevation). Returns
// { meshText, modelText, supportText|null, nModel, nFiller, nTotal } or { error }.
export function ubcOctreeFromCells(cells, nodata = -99999) {
  if (!cells?.length) return { error: "The model has no cells." };
  const eps = 1e-6;
  const h = cells.reduce((m, c) => Math.min(m, c.dx), Infinity);
  if (!(h > 0)) return { error: "Cell sizes must be positive." };
  let S = 0;
  for (const c of cells) {
    if (Math.abs(c.dx - c.dy) > eps * h || Math.abs(c.dx - c.dz) > eps * h) return { error: "UBC OcTree needs cube cells; this model has cells with different x/y/z sizes." };
    const r = c.dx / h, k = Math.round(Math.log2(r));
    if (Math.abs(r - 2 ** k) > 1e-6 * r) return { error: `Cell size ${c.dx} m is not the smallest size (${h} m) times a power of two.` };
    S = Math.max(S, c.dx);
  }
  // origin: aligned to the largest cells (everything smaller must then be aligned to its own size too)
  const ref = cells.find((c) => c.dx === S);
  const minW = cells.reduce((m, c) => Math.min(m, c.x - c.dx / 2), Infinity);
  const minS = cells.reduce((m, c) => Math.min(m, c.y - c.dy / 2), Infinity);
  const maxTop = cells.reduce((m, c) => Math.max(m, c.z + c.dz / 2), -Infinity);
  const x0 = (ref.x - S / 2) - Math.ceil(((ref.x - S / 2) - minW) / S - eps) * S;
  const y0 = (ref.y - S / 2) - Math.ceil(((ref.y - S / 2) - minS) / S - eps) * S;
  const zTop = (ref.z + S / 2) + Math.ceil((maxTop - (ref.z + S / 2)) / S - eps) * S;
  // cells in base units: i, j from the west / south, k DOWN from the top; all 0-based here
  const units = [];
  let extent = 0;
  for (let n = 0; n < cells.length; n++) {
    const c = cells[n], s = Math.round(c.dx / h);
    const fi = (c.x - c.dx / 2 - x0) / h, fj = (c.y - c.dy / 2 - y0) / h, fk = (zTop - (c.z + c.dz / 2)) / h;
    const i = Math.round(fi), j = Math.round(fj), k = Math.round(fk);
    if (Math.abs(fi - i) > 1e-4 || Math.abs(fj - j) > 1e-4 || Math.abs(fk - k) > 1e-4 || i % s || j % s || k % s) {
      return { error: `Cell at (${c.x}, ${c.y}, ${c.z}) is not aligned to its own ${c.dx} m size — not an octree.` };
    }
    units.push({ i, j, k, s, n });
    extent = Math.max(extent, i + s, j + s, k + s);
  }
  const N = pow2(Math.max(extent, S / h));
  // explicit tree: node = { i, j, k, s, n (cell index | -1 no-data), kids: null | [8 nodes] }
  let overlap = null;
  const build = (i, j, k, s, list) => {
    if (overlap) return null;
    if (!list.length) return { i, j, k, s, n: -1, kids: null };
    if (list.length === 1 && list[0].s === s) {
      const u = list[0];
      if (u.i !== i || u.j !== j || u.k !== k) { overlap = "misplaced cell"; return null; }
      return { i, j, k, s, n: u.n, kids: null };
    }
    if (s === 1 || list.some((u) => u.s >= s)) { overlap = "overlapping cells"; return null; }
    const h2 = s / 2, parts = [[], [], [], [], [], [], [], []];
    for (const u of list) parts[(u.i >= i + h2 ? 1 : 0) + (u.j >= j + h2 ? 2 : 0) + (u.k >= k + h2 ? 4 : 0)].push(u);
    return { i, j, k, s, n: -1, kids: parts.map((p, q) => build(i + (q & 1 ? h2 : 0), j + (q & 2 ? h2 : 0), k + (q & 4 ? h2 : 0), h2, p)) };
  };
  const root = build(0, 0, 0, N, units);
  if (overlap) return { error: `The cells don't form one octree (${overlap}).` };
  // 2:1 BALANCE — UBC-GIF codes and discretize expect it (discretize's reader re-balances a file that isn't,
  // so its cell count would no longer match the model file: measured, 12,824 cells read vs 12,524 written).
  // A leaf with a neighbouring leaf (face, edge or corner) less than half its size is split into 8; a
  // no-data leaf into no-data children, a model cell into 8 children carrying its value (counted). Repeated
  // until nothing changes. A model from a balanced TreeMesh keeps all its own cells; only fillers split.
  const nodeAt = (i, j, k, s) => { // the node covering block (i,j,k,s): that node, or a leaf bigger than s
    if (i < 0 || j < 0 || k < 0 || i >= N || j >= N || k >= N) return null;
    let nd = root;
    while (nd.kids && nd.s > s) { const h2 = nd.s / 2; nd = nd.kids[(i >= nd.i + h2 ? 1 : 0) + (j >= nd.j + h2 ? 2 : 0) + (k >= nd.k + h2 ? 4 : 0)]; }
    return nd;
  };
  const minTouching = (nd, di, dj, dk) => { // smallest leaf in nd on the side facing the neighbour at -d
    if (!nd.kids) return nd.s;
    let m = Infinity;
    for (let q = 0; q < 8; q++) {
      const a = q & 1 ? 1 : 0, b = q & 2 ? 1 : 0, c = q & 4 ? 1 : 0;
      if ((di === 1 && a) || (di === -1 && !a) || (dj === 1 && b) || (dj === -1 && !b) || (dk === 1 && c) || (dk === -1 && !c)) continue;
      m = Math.min(m, minTouching(nd.kids[q], di, dj, dk));
    }
    return m;
  };
  const allLeaves = () => { const out = []; const w = (nd) => { if (nd.kids) nd.kids.forEach(w); else out.push(nd); }; w(root); return out; };
  let splitModel = 0;
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const lf of allLeaves()) {
      if (lf.s < 4) continue; // a leaf of size 1 or 2 can't have a neighbour less than half its size
      let need = false;
      for (let di = -1; di <= 1 && !need; di++) for (let dj = -1; dj <= 1 && !need; dj++) for (let dk = -1; dk <= 1 && !need; dk++) {
        if (!di && !dj && !dk) continue;
        const nb = nodeAt(lf.i + di * lf.s, lf.j + dj * lf.s, lf.k + dk * lf.s, lf.s);
        if (nb && nb.kids && minTouching(nb, di, dj, dk) < lf.s / 2) need = true;
      }
      if (!need) continue;
      const h2 = lf.s / 2;
      if (lf.n >= 0) splitModel++;
      lf.kids = Array.from({ length: 8 }, (_, q) => ({ i: lf.i + (q & 1 ? h2 : 0), j: lf.j + (q & 2 ? h2 : 0), k: lf.k + (q & 4 ? h2 : 0), s: h2, n: lf.n, kids: null }));
      changed = true;
    }
    if (!changed) break;
  }
  const leaves = allLeaves();
  leaves.sort((a, b) => a.k - b.k || a.j - b.j || a.i - b.i);
  const num = (v) => (Number.isFinite(v) ? String(+v.toPrecision(7)) : String(nodata));
  const meshText = [`${N} ${N} ${N}`, `${x0.toFixed(4)} ${y0.toFixed(4)} ${zTop.toFixed(4)}`, `${h} ${h} ${h}`, String(leaves.length),
    ...leaves.map((l) => `${l.i + 1} ${l.j + 1} ${l.k + 1} ${l.s}`)].join("\n") + "\n";
  const column = (field) => leaves.map((l) => (l.n < 0 ? String(nodata) : num(cells[l.n][field]))).join("\n") + "\n";
  const hasSupport = cells.some((c) => Number.isFinite(c.support));
  return {
    meshText, modelText: column("value"), supportText: hasSupport ? column("support") : null,
    nModel: cells.length, nFiller: leaves.filter((l) => l.n < 0).length, nTotal: leaves.length, modelCellsSplit: splitModel, base: N, smallest: h, origin: [x0, y0, zTop],
  };
}
