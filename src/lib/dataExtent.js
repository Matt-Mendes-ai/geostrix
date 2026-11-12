// Project-extent helpers for the lazily loaded Maps / Geophysics code (kept out of dataClusters.js, which the 3D view loads at start).
import { mainClusters } from "./dataClusters.js"; // TASKS.csv #2126

// TASKS.csv #2126 (review #2013, Woodjam) — the collars an imagery area is seeded from. Woodjam's 544 collars are a 1974-2024 district list
// (50 x 55 km) of which only the 10 holes of 2024 have a survey: 10 m Sentinel-2 came out at ~53 m pixels. When some holes are traced (a
// survey, or a dip / azimuth on the collar) and others are not, the traced ones; then the main cluster of those (lib/dataClusters.js).
// -> { collars, total, by: "all" | "traced" | "cluster" }
export function imageryAreaCollars(collars, survey = []) {
  const cs = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  const surveyed = new Set((survey || []).map((s) => s?.hole_id).filter((h) => h != null));
  const has = (v) => v !== "" && v != null && Number.isFinite(Number(v)); // an empty cell is not a dip
  const traced = cs.filter((c) => surveyed.has(c.hole_id) || has(c.dip) || has(c.azimuth));
  let pick = cs, by = "all";
  if (traced.length && traced.length < cs.length) { pick = traced; by = "traced"; }
  const { keep } = mainClusters(pick);
  const main = pick.filter((_, i) => keep[i]);
  if (main.length && main.length < pick.length) { pick = main; if (by === "all") by = "cluster"; }
  return { collars: pick, total: cs.length, by };
}

// TASKS.csv #1461 — the default area to fetch terrain or imagery for: the collars AND the surface samples within `nearM` of a
// collar (Silvertip's soil grid starts 770 m beyond a collars-only box and runs 4 km north), with the collars' usual margin
// (a quarter of the span, at least 200 m). No collars: null (the callers keep their own fallbacks). -> [x0, y0, x1, y1]
export function fetchAreaBox(collars, samples = [], { nearM = 5000 } = {}) {
  const cs = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
  if (!cs.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (p) => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; };
  cs.forEach(grow);
  const near2 = nearM * nearM;
  for (const s of samples || []) {
    if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) continue;
    if (cs.some((c) => (c.x - s.x) ** 2 + (c.y - s.y) ** 2 <= near2)) grow(s);
  }
  const mx = Math.max((x1 - x0) * 0.25, 200), my = Math.max((y1 - y0) * 0.25, 200);
  return [x0 - mx, y0 - my, x1 + mx, y1 + my];
}

// TASKS.csv #1427 — how far an imported model lies from the project's own data: the gap between its blocks' plan extent and the
// collars' (else the terrain's) extent, in km; 0 when they overlap, null with nothing to compare. A Woodjam ZTEM model loaded into
// Silvertip (UTM 10 numbers in a UTM 9 project) sat ~870 km away, in silence.
export function modelGapKm(cells, collars = [], terrainBbox = null) {
  let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
  for (const c of cells || []) if (Number.isFinite(c?.x) && Number.isFinite(c?.y)) { if (c.x < mx0) mx0 = c.x; if (c.x > mx1) mx1 = c.x; if (c.y < my0) my0 = c.y; if (c.y > my1) my1 = c.y; }
  if (!Number.isFinite(mx0)) return null;
  let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity;
  for (const c of collars || []) if (Number.isFinite(c?.x) && Number.isFinite(c?.y)) { if (c.x < rx0) rx0 = c.x; if (c.x > rx1) rx1 = c.x; if (c.y < ry0) ry0 = c.y; if (c.y > ry1) ry1 = c.y; }
  if (!Number.isFinite(rx0) && terrainBbox) [rx0, ry0, rx1, ry1] = terrainBbox;
  if (!Number.isFinite(rx0)) return null;
  return Math.hypot(Math.max(0, rx0 - mx1, mx0 - rx1), Math.max(0, ry0 - my1, my0 - ry1)) / 1000;
}
