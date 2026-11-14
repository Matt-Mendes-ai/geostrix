// TASKS.csv #2470 (review #2325, WA uranium) — the ground a GemPy model is cut at, and a box much taller than its drilling. With no terrain
// the surfaces were not cut at all: every top was drawn above the collars somewhere (Top of QA up to RL 805 over collars at RL 318-347).
// The collars of surface drilling are surveyed points on the ground (#1353 pit shells use them the same way); collars drilled from
// underground levels are not (#2217), and then nothing is cut.
import { terrainGroundAt } from "./viewer/geomath.js";
import { collarGround, collarsLookUnderground } from "./pitShell.js";

// -> { ground: { kind, name, bbox: [x0, y0, x1, y1], at(x, y) } | null, kind, collars, why }
// TASKS.csv #2410 (review #2325, WA uranium) — opts.fallbackZ: where the terrain has no data (a collar TIN's gaps, 88 % of its grid) or
// beyond it, the ground is that flat elevation (a map layer's own Elev.), so a surface is cut at the ground over the whole model
const NO_SURVEY = Object.freeze([]); // #3154 — one empty survey, so a call without one finds its memo
export function modelGround(terrain, collars, survey = NO_SURVEY, { fallbackZ = null } = {}) {
  if (terrain && Number.isFinite(fallbackZ)) return { kind: "terrain", ground: { kind: "terrain", name: terrain.name || "terrain", bbox: [-Infinity, -Infinity, Infinity, Infinity], at: (x, y) => { const g = terrainGroundAt(terrain, x, y); return Number.isFinite(g) ? g : fallbackZ; } } };
  if (terrain) return { kind: "terrain", ground: { kind: "terrain", name: terrain.name || "terrain", bbox: terrain.bbox, at: (x, y) => terrainGroundAt(terrain, x, y) } };
  // TASKS.csv #3154 — the collar surface kept per collars array and survey: an Implicit run on WA iron rebuilt it (the bench check and the k-d
  // tree over 6,292 collars, about 60 ms of the run's first main-thread task) on every run, though the collars had not changed. Callers only read it.
  const kept = Array.isArray(collars) ? collarGroundMemo.get(collars) : null;
  if (kept && kept.survey === survey) return kept.out;
  const out = collarModelGround(collars, survey);
  if (Array.isArray(collars)) collarGroundMemo.set(collars, { survey, out });
  return out;
}
const collarGroundMemo = new WeakMap();
function collarModelGround(collars, survey) {
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  if (pts.length < 3) return { ground: null, why: "few" };
  if (collarsLookUnderground(pts, survey).underground) return { ground: null, why: "underground" };
  const g = collarGround(pts);
  if (!g) return { ground: null, why: "few" };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of pts) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; }
  return { kind: "collars", collars: pts.length, ground: { kind: "collars", name: "collar surface", bbox: [x0, y0, x1, y1], at: g } };
}

// extent [x0, x1, y0, y1, z0, z1] (the solver's frame, z up); traces [{ pts: [{ y }] }] (scene: y = elevation - origin) -> the box height
// against the drilled height when the box is more than `factor` times taller, else null
export function boxTallerThanDrilling(extent, traces, factor = 3) {
  const boxM = Number(extent?.[5]) - Number(extent?.[4]);
  let lo = Infinity, hi = -Infinity;
  for (const t of traces || []) for (const p of t.pts || []) { if (p.y < lo) lo = p.y; if (p.y > hi) hi = p.y; }
  const drillM = hi - lo;
  if (!(boxM > 0) || !(drillM > 0)) return null;
  const ratio = boxM / drillM;
  return ratio > factor ? { ratio, boxM, drillM } : null;
}

// TASKS.csv #2634 (review #2486, WA lithium) — the ground in the frame of a grid: (x, y) in that frame -> the ground's elevation in it, or
// NaN where there is no ground (outside a terrain, or outside the collars' footprint for the collar surface, as the GemPy cut does).
// offset: the frame's origin in the world (the unit body and alteration grids are origin-relative; the grade shell's is the world).
// Before this the unit body and the halo looked the terrain up at origin-relative x, y, which no terrain covers: they were never cut.
export function groundAtInFrame(ground, offset = null) {
  if (!ground?.at) return null;
  const ox = offset?.x || 0, oy = offset?.y || 0, oz = offset?.z || 0;
  const [x0, y0, x1, y1] = ground.kind === "collars" && ground.bbox ? ground.bbox : [-Infinity, -Infinity, Infinity, Infinity];
  return (x, y) => {
    const wx = x + ox, wy = y + oy;
    if (wx < x0 || wx > x1 || wy < y0 || wy > y1) return NaN;
    const g = ground.at(wx, wy);
    return Number.isFinite(g) ? g - oz : NaN;
  };
}
