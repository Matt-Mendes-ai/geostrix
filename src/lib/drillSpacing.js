// TASKS.csv #2517 (review #2486, WA lithium) / #2343 — the section tool opened at ±100 m on a 25 m drill grid: eight drill lines stacked on
// one plane, one dipping pegmatite sheet read as four. The default Buffer is half the drill spacing, measured from the collars: collars
// within siteM of each other are one drill site (a fan from one pad or an underground cuddy counts once, so fans do not give 0 m), and the
// spacing is the median distance from each site to its nearest neighbour. Pure; a grid hash keeps it near-linear on large projects.

// collars [{ x, y }] -> { sites, spacing, buffer } | null (fewer than 3 sites, or no usable spacing)
export function drillSiteSpacing(collars, { siteM = 2, minBuffer = 2, maxBuffer = 100 } = {}) {
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  if (pts.length < 3) return null;
  // sites: merge collars within siteM (one pass over a siteM grid)
  const g = new Map(), sites = [];
  const key = (i, j) => `${i},${j}`;
  for (const c of pts) {
    const i = Math.floor(c.x / siteM), j = Math.floor(c.y / siteM);
    let hit = null;
    for (let di = -1; di <= 1 && !hit; di++) for (let dj = -1; dj <= 1 && !hit; dj++) for (const s of g.get(key(i + di, j + dj)) || []) if (Math.hypot(s.x - c.x, s.y - c.y) <= siteM) { hit = s; break; }
    if (hit) continue;
    const s = { x: c.x, y: c.y };
    sites.push(s);
    const k = key(i, j); if (!g.has(k)) g.set(k, []); g.get(k).push(s);
  }
  if (sites.length < 3) return null;
  // nearest neighbour of each site: search rings of a grid sized to the mean spacing
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of sites) { if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x; if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y; }
  const area = Math.max(1, (maxX - minX) * (maxY - minY));
  const cell = Math.max(siteM, Math.sqrt(area / sites.length));
  const grid = new Map();
  for (const s of sites) { const k = key(Math.floor(s.x / cell), Math.floor(s.y / cell)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); }
  const span = Math.ceil(Math.max(maxX - minX, maxY - minY) / cell) + 1;
  const nn = [];
  for (const s of sites) {
    const i0 = Math.floor(s.x / cell), j0 = Math.floor(s.y / cell);
    let best = Infinity;
    for (let r = 0; r <= span; r++) {
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; // the ring only
        for (const o of grid.get(key(i0 + di, j0 + dj)) || []) { if (o === s) continue; const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < best) best = d; }
      }
      if (best <= r * cell) break; // nothing in a farther ring can be closer
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  const spacing = nn[Math.floor(nn.length / 2)];
  const half = spacing / 2;
  const nice = half < 50 ? Math.round(half * 2) / 2 : Math.round(half); // 12.5 m on a 25 m grid, not 13
  return { sites: sites.length, spacing, buffer: Math.max(minBuffer, Math.min(maxBuffer, nice)) };
}
