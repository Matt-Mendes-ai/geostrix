// TASKS.csv #2624 (review #2325, WA uranium; split from #2470) — the implicit model's lithology block (model check fallback, unit volumes,
// "Add as block model", the block read on sections) had the same count on every axis (36 x 36 x 36), so on a 13 x 13 km x 150 m box its
// cells were 361 x 361 x 4 m. The counts now follow the box's shape at the same total (Matt's decision: same run time, roughly cubic
// cells), each clamped to the engine's 4-96 (python-sidecar/app/main.py). The surfaces' mesh is GemPy's octree (Surface detail),
// unchanged by this. Pure.
export const RES_MIN = 4, RES_MAX = 96;

// extent: [xmin, xmax, ymin, ymax, zmin, zmax]; n: the per-axis count of a cube (the Resolution slider) -> [nx, ny, nz], product ~ n^3
export function axisResolution(extent, n) {
  const total = Math.max(1, Math.round(n)) ** 3;
  const L = [extent[1] - extent[0], extent[3] - extent[2], extent[5] - extent[4]].map((v) => (Number.isFinite(v) && v > 0 ? v : 1));
  const fixed = [null, null, null];
  // cubic cells over the free axes; an axis that clamps is fixed and the rest share what is left
  for (let pass = 0; pass < 3; pass++) {
    const free = [0, 1, 2].filter((i) => fixed[i] == null);
    if (!free.length) break;
    const left = total / [0, 1, 2].reduce((p, i) => (fixed[i] == null ? p : p * fixed[i]), 1);
    const c = Math.pow(free.reduce((p, i) => p * L[i], 1) / left, 1 / free.length); // the edge of a cubic cell over the free axes
    // the axis furthest outside 4-96 is clamped first (one per pass: clamping it changes what the others get)
    let worst = -1, by = 0;
    for (const i of free) {
      const k = L[i] / c, over = k < RES_MIN ? Math.log(RES_MIN / k) : k > RES_MAX ? Math.log(k / RES_MAX) : 0;
      if (over > by) { by = over; worst = i; }
    }
    if (worst < 0) { for (const i of free) fixed[i] = L[i] / c; break; }
    fixed[worst] = L[worst] / c < RES_MIN ? RES_MIN : RES_MAX;
  }
  const r = fixed.map((k) => Math.max(RES_MIN, Math.min(RES_MAX, Math.round(k ?? RES_MIN))));
  // rounding up can pass the total: the finest axis gives a cell back (the run time is the slider's)
  for (let guard = 0; guard < 300 && r[0] * r[1] * r[2] > total; guard++) {
    const i = [0, 1, 2].filter((a) => r[a] > RES_MIN).sort((a, b) => L[a] / r[a] - L[b] / r[b])[0];
    if (i == null) break;
    r[i]--;
  }
  // what clamping and rounding left of the budget goes to the coarsest axis that can still take a cell (13 x 13 km x 150 m: 96 x 96 x 5,
  // not 96 x 96 x 4)
  for (let guard = 0; guard < 300; guard++) {
    const prod = r[0] * r[1] * r[2];
    const order = [0, 1, 2].filter((i) => r[i] < RES_MAX && (prod / r[i]) * (r[i] + 1) <= total).sort((a, b) => L[b] / r[b] - L[a] / r[a]);
    if (!order.length) break;
    r[order[0]]++;
  }
  return r;
}

// the block's cell size on each axis, in the box's units -> [dx, dy, dz]
export const blockCellsM = (extent, res) => [0, 1, 2].map((i) => (extent[2 * i + 1] - extent[2 * i]) / res[i]);
