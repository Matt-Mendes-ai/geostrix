// TASKS.csv #2650 (follow-up of #2438, review #2325 WA uranium) — a flat-lying body is not mined by levels: it is judged column by column
// by its grade-thickness (GT, grade x metres) and taken in panels (an open-cut strip, an in-situ recovery pattern). From a block model:
// each column's mineralized thickness is the blocks at or above the grade cut-off (by their coverage), its GT the sum of grade x height
// of those blocks; the plan is cut into square panels of the side given, and a panel counts when its mean GT over the model's columns in it
// reaches the GT cut-off. Every number is the user's: the grade cut-off, the panel side, the GT cut-off and the density. Pure.

// cells [{ x, y, z, dx, dy, dz, value, coverage? }] -> { panels: [{ i, j, x, y, area, minArea, thick, grade, gt, tonnes, metal, ore }],
// totals: { panels, orePanels, area, minArea, tonnes, metal, grade, thick } } or null (no input or no block)
export function flatPanels(cells, { cutoff, panelM, gtCut, density } = {}) {
  if (!(panelM > 0) || !(gtCut >= 0) || !(density > 0) || !Number.isFinite(cutoff) || !cells?.length) return null;
  const cols = new Map();
  for (const c of cells) {
    if (![c.x, c.y, c.z, c.dx, c.dy, c.dz, c.value].every(Number.isFinite) || !(c.dx > 0 && c.dy > 0 && c.dz > 0)) continue;
    const k = `${Math.round(c.x * 100)}|${Math.round(c.y * 100)}`;
    let col = cols.get(k);
    if (!col) { col = { x: c.x, y: c.y, a: c.dx * c.dy, t: 0, gt: 0 }; cols.set(k, col); }
    if (c.value >= cutoff) { const h = c.dz * (Number.isFinite(c.coverage) ? c.coverage : 1); col.t += h; col.gt += c.value * h; }
  }
  if (!cols.size) return null;
  let x0 = Infinity, y0 = Infinity;
  for (const col of cols.values()) { if (col.x < x0) x0 = col.x; if (col.y < y0) y0 = col.y; }
  const panels = new Map();
  for (const col of cols.values()) {
    const i = Math.floor((col.x - x0) / panelM), j = Math.floor((col.y - y0) / panelM), k = `${i},${j}`;
    let p = panels.get(k);
    if (!p) { p = { i, j, x: x0 + (i + 0.5) * panelM, y: y0 + (j + 0.5) * panelM, area: 0, minArea: 0, vol: 0, gtA: 0 }; panels.set(k, p); }
    p.area += col.a;
    if (col.t > 0) { p.minArea += col.a; p.vol += col.a * col.t; p.gtA += col.a * col.gt; }
  }
  const list = [...panels.values()].map((p) => {
    const gt = p.area > 0 ? p.gtA / p.area : 0, tonnes = p.vol * density, metal = p.gtA * density;
    return { i: p.i, j: p.j, x: p.x, y: p.y, area: p.area, minArea: p.minArea, thick: p.minArea > 0 ? p.vol / p.minArea : 0, grade: p.vol > 0 ? p.gtA / p.vol : null, gt, tonnes, metal, ore: p.minArea > 0 && gt >= gtCut };
  }).sort((a, b) => a.j - b.j || a.i - b.i);
  const ore = list.filter((p) => p.ore);
  const sum = (k) => ore.reduce((s, p) => s + p[k], 0);
  const tonnes = sum("tonnes"), metal = sum("metal"), minArea = sum("minArea");
  return { panels: list, totals: { panels: list.length, orePanels: ore.length, area: sum("area"), minArea, tonnes, metal, grade: tonnes > 0 ? metal / tonnes : null, thick: minArea > 0 ? ore.reduce((s, p) => s + p.thick * p.minArea, 0) / minArea : 0 } };
}
