// TASKS.csv #2056 (review #2013, Woodjam) — the default 'Whole property' model box on a project whose logged holes sit in three clusters
// 3-5 km apart built one district blob (Top of VANSS with 126 m cells, 19.24 km³ of unit volume) and nothing said 'your holes are in three
// clusters: model one'. Single-linkage clusters of the holes in plan: two holes are in one cluster when a chain of holes joins them with no
// step longer than `factor` x the median distance from a drill site to the next. Grid-hashed, so thousands of collars stay quick. Pure.
import { medianSiteSpacing } from "./trendThin.js";

// collars: [{ hole_id, x, y }] -> { gapM, spacingM, clusters: [{ ids: [hole_id], n, cx, cy, spanM }] largest first } | null (fewer than 3
// holes, or no spacing to measure)
export function holeClusters(collars, { factor = 5 } = {}) {
  const P = (collars || []).filter((c) => c && c.hole_id != null && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.y))).map((c) => ({ id: c.hole_id, x: Number(c.x), y: Number(c.y) }));
  if (P.length < 3) return null;
  const spacingM = medianSiteSpacing(P);
  if (!(spacingM > 0)) return null;
  const gapM = factor * spacingM, g2 = gapM * gapM;
  const parent = P.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const key = (i, j) => `${i},${j}`, grid = new Map();
  P.forEach((p, k) => { const kk = key(Math.floor(p.x / gapM), Math.floor(p.y / gapM)); (grid.get(kk) || grid.set(kk, []).get(kk)).push(k); });
  P.forEach((p, k) => {
    const ci = Math.floor(p.x / gapM), cj = Math.floor(p.y / gapM);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const m of grid.get(key(ci + a, cj + b)) || []) {
      if (m <= k) continue;
      const q = P[m];
      if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 <= g2) { const ra = find(k), rb = find(m); if (ra !== rb) parent[ra] = rb; }
    }
  });
  const by = new Map();
  P.forEach((p, k) => { const r = find(k); (by.get(r) || by.set(r, []).get(r)).push(p); });
  const clusters = [...by.values()].map((list) => {
    let sx = 0, sy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of list) { sx += p.x; sy += p.y; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    return { ids: list.map((p) => p.id).sort((u, v) => String(u).localeCompare(String(v))), n: list.length, cx: sx / list.length, cy: sy / list.length, spanM: Math.hypot(x1 - x0, y1 - y0) };
  }).sort((a, b) => b.n - a.n || String(a.ids[0]).localeCompare(String(b.ids[0])));
  return { gapM, spacingM, clusters };
}

// the Holes-list state that checks one cluster's holes only (every other collar unchecked)
export function onlyTheseHoles(collars, ids) {
  const keep = new Set(ids);
  return Object.fromEntries((collars || []).map((c) => [c.hole_id, keep.has(c.hole_id)]));
}
