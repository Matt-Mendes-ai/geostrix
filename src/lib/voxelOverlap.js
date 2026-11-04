// TASKS.csv #1808 (review #1646, Kodiak) — two visible block models in the same cells (a resistivity and a chargeability inversion on
// one mesh) are drawn into each other: a mosaic of two palettes, neither readable. A model whose box overlaps another visible one's by
// more than `share` of the smaller is named, so the range row can say so and offer to hide one. Boxes are cached per cells array.
const boxes = new WeakMap();
export function modelBox(model) {
  const cells = model?.cells;
  if (!Array.isArray(cells) || !cells.length) return null;
  if (boxes.has(cells)) return boxes.get(cells);
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const c of cells) {
    const hx = (c.dx || 0) / 2, hy = (c.dy || 0) / 2, hz = (c.dz || 0) / 2;
    if (c.x - hx < b[0]) b[0] = c.x - hx; if (c.y - hy < b[1]) b[1] = c.y - hy; if (c.z - hz < b[2]) b[2] = c.z - hz;
    if (c.x + hx > b[3]) b[3] = c.x + hx; if (c.y + hy > b[4]) b[4] = c.y + hy; if (c.z + hz > b[5]) b[5] = c.z + hz;
  }
  boxes.set(cells, b);
  return b;
}
const vol = (b) => Math.max(0, b[3] - b[0]) * Math.max(0, b[4] - b[1]) * Math.max(0, b[5] - b[2]);
// -> the other visible models drawn in the same space as `model` (none when it is hidden)
export function coincidentModels(model, models, share = 0.8) {
  if (!model || model.visible === false) return [];
  const a = modelBox(model);
  if (!a) return [];
  return (models || []).filter((m) => {
    if (m === model || m.id === model.id || m.visible === false) return false;
    const b = modelBox(m);
    if (!b) return false;
    const i = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3]), Math.min(a[4], b[4]), Math.min(a[5], b[5])];
    const small = Math.min(vol(a), vol(b));
    return small > 0 && vol(i) / small > share;
  });
}
