// TASKS.csv #2650 (follow-up of #2438, with #2419; review #2325 WA uranium) — a flat-lying body is taken in panels (an open-cut strip, an
// in-situ recovery pattern), each judged by its grade-thickness (GT). #2419 (lib/accumulation.js) already estimates GT and thickness on a
// plan grid from the drillholes' intercepts; this cuts such a grid into square panels of the side given and keeps the panels whose mean GT
// reaches the GT cut-off. A block model gives the same kind of grid from its columns (blockModelGrid), so both routes share the panels.
// Every number is the user's: the panel side, the GT cut-off and the density. Pure.

// grid: { nx, ny, x0, y0, cell, gt: Float64Array, thickness: Float64Array } (accumulation.js planGrid's shape; NaN = not estimated)
// -> { panels: [{ i, j, x, y, nodes, area, gt, thick, tonnes, gtArea, ore }], totals: { panels, orePanels, area, tonnes, gtArea, grade, thick } } | null
export function gridPanels(grid, { panelM, gtCut, density } = {}) {
  if (!grid || !(panelM > 0) || !(gtCut >= 0) || !(density > 0)) return null;
  const A = grid.cell * grid.cell, by = new Map();
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const k = i + grid.nx * j, g = grid.gt[k];
    if (!Number.isFinite(g)) continue;
    const x = grid.x0 + i * grid.cell, y = grid.y0 + j * grid.cell, pi = Math.floor((x - grid.x0 + grid.cell / 2) / panelM), pj = Math.floor((y - grid.y0 + grid.cell / 2) / panelM), key = `${pi},${pj}`;
    let p = by.get(key);
    if (!p) { p = { i: pi, j: pj, x: grid.x0 - grid.cell / 2 + (pi + 0.5) * panelM, y: grid.y0 - grid.cell / 2 + (pj + 0.5) * panelM, nodes: 0, area: 0, vol: 0, gtArea: 0 }; by.set(key, p); }
    p.nodes++; p.area += A; p.vol += (grid.thickness[k] || 0) * A; p.gtArea += g * A;
  }
  if (!by.size) return null;
  const panels = [...by.values()].map((p) => ({ i: p.i, j: p.j, x: p.x, y: p.y, nodes: p.nodes, area: p.area, gt: p.gtArea / p.area, thick: p.vol / p.area, tonnes: p.vol * density, gtArea: p.gtArea, ore: p.gtArea / p.area >= gtCut && p.vol > 0 }))
    .sort((a, b) => a.j - b.j || a.i - b.i);
  const ore = panels.filter((p) => p.ore), sum = (k) => ore.reduce((s, p) => s + p[k], 0);
  const area = sum("area"), tonnes = sum("tonnes"), gtArea = sum("gtArea"), vol = tonnes / density;
  return { panels, totals: { panels: panels.length, orePanels: ore.length, area, tonnes, gtArea, grade: vol > 0 ? gtArea / vol : null, thick: area > 0 ? vol / area : 0 } };
}

// a block model's columns as such a grid: per column, the thickness of the blocks at or above the grade cut-off (by their coverage) and
// their GT (grade x height); a column of the model with none is 0 (estimated, below the cut-off); outside the model, NaN. The grid's
// cell is the blocks' plan size (a model of mixed plan sizes takes the smallest). -> grid | null
export function blockModelGrid(cells, cutoff, { maxNodes = 4_000_000 } = {}) {
  const ok = (cells || []).filter((c) => [c.x, c.y, c.z, c.dx, c.dy, c.dz, c.value].every(Number.isFinite) && c.dx > 0 && c.dy > 0 && c.dz > 0);
  if (!ok.length || !Number.isFinite(cutoff)) return null;
  let cell = Infinity, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of ok) { cell = Math.min(cell, c.dx, c.dy); x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const nx = Math.round((x1 - x0) / cell) + 1, ny = Math.round((y1 - y0) / cell) + 1;
  if (nx * ny > maxNodes) return null;
  const gt = new Float64Array(nx * ny).fill(NaN), th = new Float64Array(nx * ny).fill(NaN);
  for (const c of ok) {
    const k = Math.round((c.x - x0) / cell) + nx * Math.round((c.y - y0) / cell);
    if (!Number.isFinite(gt[k])) { gt[k] = 0; th[k] = 0; }
    if (c.value >= cutoff) { const h = c.dz * (Number.isFinite(c.coverage) ? c.coverage : 1); th[k] += h; gt[k] += c.value * h; }
  }
  return { nx, ny, x0, y0, cell, gt, thickness: th };
}
