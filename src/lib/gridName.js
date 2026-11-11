// TASKS.csv #2306 (review #2174, WA gold) — a local-grid project's title block said 'Datum / projection' with nothing honest to put
// there, while the collars named their grid (GRIDNAME = WALLABY). The grid's own name, when the collars carry one: the commonest
// value of a 'grid name' field (GRIDNAME, grid_name, Grid, LocalGrid ...), and only when it is held by most of the holes that have one.
const FIELD = /^(grid[\s_-]?(name|id|code)?|local[\s_-]?grid([\s_-]?name)?|mine[\s_-]?grid)$/i;
export function collarGridName(collars) {
  const counts = new Map();
  let n = 0;
  for (const c of collars || []) {
    for (const [k, v] of Object.entries(c?.attrs || {})) {
      if (!FIELD.test(String(k).trim())) continue;
      const s = String(v ?? "").trim();
      if (!s || /^(mga|gda|utm|wgs|nad|amg|epsg)/i.test(s)) continue; // a projected CRS name is not a local grid's name
      counts.set(s, (counts.get(s) || 0) + 1); n++;
      break;
    }
  }
  let best = null;
  for (const [s, k] of counts) if (!best || k > best[1]) best = [s, k];
  return best && best[1] / n > 0.5 ? best[0] : null;
}
