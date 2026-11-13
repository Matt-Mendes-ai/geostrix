// TASKS.csv #2982 (WA iron review, after #2929) — the Level plan drew one SVG element per thing: each hole's context trace, its collar, each
// in-slab part, each logged interval (with a <title> child) and each pierce point (a <g>, a <circle> and a <title>). On the WA iron project
// (6,390 holes, 150,455 strand intervals) that was 189,332 elements: the open blocked 5-6 s and an RL step 4.2-4.5 s, most of it the
// browser's style / layout / paint work and garbage collection, not the plan's maths. These helpers draw the same lines as a few paths:
//   mergedPath   many polylines in one "d" (one <path> for every context trace, one for every in-slab part)
//   pathsByColour  the logged intervals as one <path> per colour, in first-seen order (the drawing order within a colour does not matter)
//   dotsPath     the collars as zero-length round-capped strokes in one <path> (stroke-width = the dot's diameter)
//   segmentFinder  what used to be each interval's <title>: the interval nearest a point on screen, from a grid of its segments
// X, Y: world E / N -> SVG units (the plan frame's).
// TASKS.csv #3137 — one decimal without toFixed (4x faster; ~0.3 s of the WA iron plan's paths); the same text but '-0.0' -> '0.0'
export const f1 = (v) => { const r = Math.round(v * 10), a = r < 0 ? -r : r; return (r < 0 ? "-" : "") + (a - (a % 10)) / 10 + "." + (a % 10); };

export function linePath(line, X, Y) {
  let d = "";
  for (let i = 0; i < line.length; i++) d += `${i ? "L" : "M"}${f1(X(line[i][0]))},${f1(Y(line[i][1]))}`;
  return d;
}

export function mergedPath(lines, X, Y) {
  const parts = [];
  for (const l of lines) if (l && l.length) parts.push(linePath(l, X, Y));
  return parts.join(" ");
}

// items: [{ color, lines: [[[x, y], ...], ...] }] -> [[color, d], ...]
export function pathsByColour(items, X, Y) {
  const by = new Map();
  for (const it of items) {
    let a = by.get(it.color);
    if (!a) by.set(it.color, (a = []));
    for (const l of it.lines || []) if (l && l.length) a.push(linePath(l, X, Y));
  }
  return [...by].map(([color, parts]) => [color, parts.join(" ")]);
}

export function dotsPath(points, X, Y) {
  let d = "";
  for (const [x, y] of points) if (Number.isFinite(x) && Number.isFinite(y)) d += `M${f1(X(x))},${f1(Y(y))}h0`;
  return d;
}

// squared distance from (px, py) to the segment a-b
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

// items as for pathsByColour -> find(sx, sy, reach = 4): the index of the item with a segment within `reach` SVG units of (sx, sy), the
// nearest one; -1 when none. Built lazily on the first query (a plan nobody hovers costs nothing).
export function segmentFinder(items, X, Y, cell = 12) {
  let grid = null;
  const segs = [];
  const build = () => {
    grid = new Map();
    items.forEach((it, idx) => {
      for (const l of it.lines || []) for (let i = 0; i + 1 < (l?.length || 0); i++) {
        const ax = X(l[i][0]), ay = Y(l[i][1]), bx = X(l[i + 1][0]), by = Y(l[i + 1][1]), k = segs.length;
        segs.push([ax, ay, bx, by, idx]);
        const c0 = Math.floor(Math.min(ax, bx) / cell), c1 = Math.floor(Math.max(ax, bx) / cell), r0 = Math.floor(Math.min(ay, by) / cell), r1 = Math.floor(Math.max(ay, by) / cell);
        if ((c1 - c0 + 1) * (r1 - r0 + 1) > 4096) continue; // a segment across the whole plan at a deep zoom: not hoverable, not worth the cells
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) { const key = c * 100003 + r; const a = grid.get(key); if (a) a.push(k); else grid.set(key, [k]); }
      }
    });
  };
  return (sx, sy, reach = 4) => {
    if (!grid) build();
    let best = -1, bestD = reach * reach;
    const c0 = Math.floor((sx - reach) / cell), c1 = Math.floor((sx + reach) / cell), r0 = Math.floor((sy - reach) / cell), r1 = Math.floor((sy + reach) / cell);
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) for (const k of grid.get(c * 100003 + r) || []) {
      const s = segs[k], d = segDist2(sx, sy, s[0], s[1], s[2], s[3]);
      if (d <= bestD) { bestD = d; best = s[4]; }
    }
    return best;
  };
}
