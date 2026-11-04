// TASKS.csv #1795 (review #1646, Kodiak) — the survey planner's areas around the surface samples, one per grid. 'Around the surface
// samples' boxed Kodiak's seven soil grids (19 x 31 km) into one area: 50,001 sites, 1,278 line-km, 1,251 field days. Now each grid is
// an area of its own: by a target-like column (Target, Grid, Prospect...) when the samples carry one with 2-30 values, else by
// spatial clusters (samples within `link` m of each other). coverage() says how much of a box lies near a sample, for a warning.
const TARGET_COL = /^(target|grid|prospect|area|block|zone|property|claim)s?$/i;

const boxOf = (pts, pad) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
};

// -> { by: column name | "cluster", areas: [{ name, n, box: [x0, y0, x1, y1] }] } (largest first), or null when there is only one
export function sampleAreas(samples, { pad = 200, link = 1000 } = {}) {
  const pts = (samples || []).filter((s) => Number.isFinite(s?.x) && Number.isFinite(s?.y));
  if (pts.length < 2) return null;
  const cols = new Set(); pts.forEach((s) => Object.keys(s.attrs || {}).forEach((k) => { if (TARGET_COL.test(k.trim())) cols.add(k); }));
  for (const col of cols) {
    const groups = new Map();
    pts.forEach((s) => { const v = s.attrs?.[col]; if (v == null || v === "") return; const k = String(v).trim(); (groups.get(k) || groups.set(k, []).get(k)).push(s); });
    if (groups.size >= 2 && groups.size <= 30) return { by: col, areas: [...groups].map(([name, g]) => ({ name, n: g.length, box: boxOf(g, pad) })).sort((a, b) => b.n - a.n) };
  }
  // spatial clusters: union-find over a grid of link-sized cells (neighbouring cells join)
  const cs = link, cells = new Map();
  pts.forEach((p, i) => { const k = `${Math.floor(p.x / cs)},${Math.floor(p.y / cs)}`; (cells.get(k) || cells.set(k, []).get(k)).push(i); });
  const parent = new Map([...cells.keys()].map((k) => [k, k]));
  const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
  for (const k of cells.keys()) {
    const [cx, cy] = k.split(",").map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const o = `${cx + dx},${cy + dy}`; if (cells.has(o)) { const a = find(k), b = find(o); if (a !== b) parent.set(a, b); } }
  }
  const groups = new Map();
  for (const [k, idx] of cells) { const r = find(k); (groups.get(r) || groups.set(r, []).get(r)).push(...idx.map((i) => pts[i])); }
  if (groups.size < 2) return null;
  const areas = [...groups.values()].filter((g) => g.length >= 3).map((g) => ({ n: g.length, box: boxOf(g, pad) })).sort((a, b) => b.n - a.n).map((a, i) => ({ name: String(i + 1), ...a }));
  return areas.length >= 2 ? { by: "cluster", areas } : null;
}

// The share of a box's cells (cell m a side) that hold a sample or touch one: low = mostly empty ground between grids
export function coverage(box, samples, cell = 250) {
  const [x0, y0, x1, y1] = box, nx = Math.max(1, Math.ceil((x1 - x0) / cell)), ny = Math.max(1, Math.ceil((y1 - y0) / cell));
  if (nx * ny > 400000) return null;
  const hit = new Uint8Array(nx * ny);
  for (const s of samples || []) {
    if (!(s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1)) continue;
    const i = Math.min(nx - 1, Math.floor((s.x - x0) / cell)), j = Math.min(ny - 1, Math.floor((s.y - y0) / cell));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) hit[jj * nx + ii] = 1; }
  }
  let n = 0; for (let k = 0; k < hit.length; k++) n += hit[k];
  return n / hit.length;
}
