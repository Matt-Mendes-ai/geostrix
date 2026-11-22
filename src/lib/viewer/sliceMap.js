// TASKS.csv #4020 (Matt: "mag and other voxels won't display well in the 3d slice") — in a 3D slice a block model was its boxes clipped to one
// cell-thick layer (#3765); three.js does not cap a clipped box, so seen from above only the side walls were left, edge-on: single-pixel dots in
// rows that aliased into a moiré, the view showing through. Now the slab shows the model as ONE filled colour map, sampled from the cells:
//  - a texel every cell (coarser past `maxTex` texels a side), over the model's extent in the slab's plane, so every cell the slab crosses is drawn,
//    not only the cells whose centre is in it;
//  - a thin slab (one cell or less along its normal) and any discrete model: the cell at the slab's middle; a thicker slab of a continuous model:
//    the mean of the cells across the slab (up to MAX_SAMPLES samples along the normal), said in the slice pane;
//  - no cell there: a transparent texel.
// Colours come from the model's own resolver (the legend's ramp or classes). Pure: no three.js; scene axes x east, y up, z = -north.

export const MAX_SAMPLES = 6;
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

// the plane's two axes, perpendicular to the slab normal n: a level slab east and south; an upright one up and along its strike
export function planeAxes(n) {
  if (Math.abs(n.y) > 0.9) return { e1: { x: 1, y: 0, z: 0 }, e2: { x: 0, y: 0, z: 1 } };
  const h = Math.hypot(n.x, n.z) || 1;
  return { e1: { x: 0, y: 1, z: 0 }, e2: { x: -n.z / h, y: 0, z: n.x / h } };
}

// the cells' world box [x0, y0, z0, x1, y1, z1], once per cells array (a slice moved by the slider reuses it)
const boxes = new WeakMap();
function worldBox(cells) {
  let w = boxes.get(cells);
  if (w) return w;
  w = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const c of cells) {
    const hx = c.dx / 2, hy = c.dy / 2, hz = c.dz / 2;
    if (c.x - hx < w[0]) w[0] = c.x - hx; if (c.y - hy < w[1]) w[1] = c.y - hy; if (c.z - hz < w[2]) w[2] = c.z - hz;
    if (c.x + hx > w[3]) w[3] = c.x + hx; if (c.y + hy > w[4]) w[4] = c.y + hy; if (c.z + hz > w[5]) w[5] = c.z + hz;
  }
  boxes.set(cells, w);
  return w;
}
// cells: the model's shown cells (world x, y, z, dx, dy, dz, value); lookup: buildVoxelLookup(cells) (find(x, y, z) -> cell, minCell);
// slab: { n (scene unit normal), nc (n . the slab's middle), t (thickness) }; origin: the scene origin in world coordinates; rgb(value) -> [r, g, b] 0-255
// -> null (nothing in the slab) | { width, height, rgba, centre (scene, at the slab's middle), e1, e2, sizeA, sizeB, reduce: "middle" | "mean", filled }
export function sliceImage({ cells, lookup, slab, origin, rgb, discrete = false, maxTex = 384 }) {
  if (!cells?.length || !lookup || !slab || !(slab.t > 0)) return null;
  const { n, nc, t } = slab, { e1, e2 } = planeAxes(n), o = origin || { x: 0, y: 0, z: 0 };
  // the model's extent in scene coordinates along the plane's axes (and along n, to skip a slab that misses it): its world box's eight corners
  const w = worldBox(cells);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  for (const X of [w[0], w[3]]) for (const Y of [w[1], w[4]]) for (const Z of [w[2], w[5]]) {
    const p = { x: X - o.x, y: Z - o.z, z: -(Y - o.y) }, a = dot(p, e1), b = dot(p, e2), u = dot(p, n);
    if (a < a0) a0 = a; if (a > a1) a1 = a; if (b < b0) b0 = b; if (b > b1) b1 = b; if (u < u0) u0 = u; if (u > u1) u1 = u;
  }
  if (u1 < nc - t / 2 || u0 > nc + t / 2) return null; // the slab misses the model
  const cell = Number.isFinite(lookup.minCell) && lookup.minCell > 0 ? lookup.minCell : Math.max(a1 - a0, b1 - b0) / maxTex;
  const step = Math.max(cell, (a1 - a0) / maxTex, (b1 - b0) / maxTex);
  const width = Math.max(1, Math.ceil((a1 - a0) / step)), height = Math.max(1, Math.ceil((b1 - b0) / step));
  const mean = !discrete && t > cell * 1.01, ns = mean ? Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(t / cell))) : 1;
  const us = Array.from({ length: ns }, (_, k) => (ns === 1 ? nc : nc - t / 2 + ((k + 0.5) * t) / ns));
  const rgba = new Uint8Array(width * height * 4);
  let filled = 0;
  for (let j = 0; j < height; j++) {
    const b = b0 + (j + 0.5) * step;
    for (let i = 0; i < width; i++) {
      const a = a0 + (i + 0.5) * step;
      let sum = 0, k = 0, hit = null;
      for (const u of us) {
        const sx = e1.x * a + e2.x * b + n.x * u, sy = e1.y * a + e2.y * b + n.y * u, sz = e1.z * a + e2.z * b + n.z * u;
        const c = lookup.find(sx + o.x, o.y - sz, sy + o.z); // scene -> world
        if (!c || !Number.isFinite(c.value)) continue;
        if (!mean) { hit = c.value; break; }
        sum += c.value; k++;
      }
      const v = mean ? (k ? sum / k : null) : hit;
      if (v == null) continue;
      const [r, g, bl] = rgb(v), q = (j * width + i) * 4;
      rgba[q] = r; rgba[q + 1] = g; rgba[q + 2] = bl; rgba[q + 3] = 255;
      filled++;
    }
  }
  if (!filled) return null;
  const am = a0 + (width * step) / 2, bm = b0 + (height * step) / 2; // the texel grid's own middle (it is rounded up to whole texels)
  const centre = { x: e1.x * am + e2.x * bm + n.x * nc, y: e1.y * am + e2.y * bm + n.y * nc, z: e1.z * am + e2.z * bm + n.z * nc };
  return { width, height, rgba, centre, e1, e2, sizeA: width * step, sizeB: height * step, step, reduce: mean ? "mean" : "middle", samples: ns, filled };
}
