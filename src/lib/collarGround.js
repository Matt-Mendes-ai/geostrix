// TASKS.csv #3159 — the collar ground and the underground check, moved verbatim out of pitShell.js: the 3D view, the drapes and
// the picking need them at startup, and importing them from pitShell.js put the whole pit solver (and gradeTonnage.js) in the
// startup bundle. pitShell.js re-exports them, so the pit tools and the workers are unchanged.
import { suspectElevationIds } from "./collarElevationTrust.js"; // TASKS.csv #2962 — the shared rule (#3004)

// TASKS.csv #1353 (review #1352, Silvertip) — with no terrain the pit took ONE flat ground at the top of the highest block,
// above every collar: 100-140 m of air was costed as waste and a paying Zn pit came out empty. The collars are surveyed points on
// the ground: interpolated between them (inverse distance, the 4 nearest), they stand in for the terrain. collars: [{ x, y, z }].
// TASKS.csv #2217 (review #2174, WA underground mine) — the collars are a ground surface only for surface drilling. Collars drilled from
// underground levels (RL 82-352 under a surface at about 390, 12 holes drilled upward) made the estimate drop 3,855 of 36,267 blocks
// 'above the ground', the upholes' grade with them. -> { underground, upward, stacked }: holes drilled upward (a collar or survey dip
// below 0, stored as degrees below horizontal, #339) and pairs of collars within 5 m in plan but over 10 m apart in elevation. Counted
// against the project's size: Woodjam's surface compilation (544 collars) has 2 duplicate collars with conflicting elevations, the WA
// mine 12 upholes in 245 holes. Upward holes: at least 2 and 2 % of the holes; stacked pairs: at least 3 and 5 % of the collars.
// TASKS.csv #2798 — a 20,000-collar commit spent 0.28 s here: about 15 callers ask on each collar change with the same arrays (the store
// replaces them, never edits them in place), so the last answers are kept per collars / survey array; and the grid key is a number, not a
// string per neighbour cell. A key collision only adds candidates: the distance test decides.
const UG_SEEN = new WeakMap(), NO_SURVEY = {}, NO_CELL = [];
export function collarsLookUnderground(collars, survey) {
  const a = collars || NO_SURVEY, b = survey || NO_SURVEY;
  if (typeof a === "object") { const m = UG_SEEN.get(a); if (m?.has(b)) return { ...m.get(b) }; }
  const r = lookUnderground(collars, survey || []);
  if (typeof a === "object") { let m = UG_SEEN.get(a); if (!m) UG_SEEN.set(a, (m = new Map())); if (m.size > 4) m.clear(); m.set(b, r); }
  return { ...r };
}
function lookUnderground(collars, survey) {
  const up = new Set();
  for (const c of collars || []) if (Number.isFinite(c?.dip) && c.dip < 0) up.add(c.hole_id);
  for (const s of survey || []) if (Number.isFinite(s?.dip) && s.dip < 0) up.add(s.hole_id);
  // TASKS.csv #2962 — a collar whose elevation is not ground by the shared rule (#3004: suspect, or assumed at import from the median or as
  // 0) is no evidence of collars stacked on mine levels: a 0 m twin 2.5 m from a surveyed collar made a small surface project 'underground'
  // (and the Elev offer, the pit and the solver then refused the ground)
  const suspect = suspectOf(collars);
  const pts = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z) && !c.zSuspect && !(c.hole_id != null && suspect.has(c.hole_id)) && !(c.zAssumed && c.zAssumed !== "terrain"));
  const cells = new Map(), key = (i, j) => i * 67108864 + j;
  let stacked = 0;
  for (const c of pts) {
    const i = Math.floor(c.x / 5), j = Math.floor(c.y / 5);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const o of cells.get(key(i + di, j + dj)) || NO_CELL) {
      if ((o.x - c.x) ** 2 + (o.y - c.y) ** 2 <= 25 && Math.abs(o.z - c.z) > 10) stacked++; // no Math.hypot (slow in V8), no array per empty cell (#2798)
    }
    (cells.get(key(i, j)) || cells.set(key(i, j), []).get(key(i, j))).push(c);
  }
  const n = Math.max(1, (collars || []).length);
  return { underground: up.size >= Math.max(2, 0.02 * n) || stacked >= Math.max(3, 0.05 * n), upward: up.size, stacked };
}

// TASKS.csv #2584 (review #2486, WA lithium pegmatite; Matt's decision 2026-11-11) — in a mined pit the collars stand on benches of
// different mining stages: holes 10 m apart at RL 219.8 and 234.7, and the surface through all of them (229.5 there) is a ground that
// never existed; the present floor is at or below the lowest. A collar with another collar within BENCH_PLAN_M in plan that is more
// than BENCH_RL_M lower is left out of the collar ground, so the lowest collar there is used. A check, not a fact about the ground: on
// a hillside steeper than about 18 degrees it lowers real ground too, which is why every tool using this ground says so (CollarLevelsNote).
// -> { kept: [collars], higher: [the collars left out], planM, rlM }
export const BENCH_PLAN_M = 15, BENCH_RL_M = 5;
// TASKS.csv #2962 (review #2876, WA iron) — two collars recorded at 0 m on a 433 m plateau (and three bores given the import's median
// elevation beside surveyed twins) pulled the ground between the collars down to 0.1-9 m, and the rule below kept the bad collars (the
// lowest) and left out the surveyed ones beside them, as 'a pit or benches?'. An elevation that is not ground is left out first, by the
// shared rule (lib/collarElevationTrust.js, #3004): suspect (0 m among collars far from 0, or a stray), or assumed at import from the
// median or as 0 (one taken from a terrain is ground, and stays). When nothing would be left, the collars are used as before.
// -> also untrusted: [{ hole_id, z, why: "suspect" | "assumed" }]
const suspectMemo = new WeakMap();
const suspectOf = (collars) => { if (!Array.isArray(collars)) return new Set(); if (!suspectMemo.has(collars)) suspectMemo.set(collars, suspectElevationIds(collars)); return suspectMemo.get(collars); };
export function collarBenches(collars, { planM = BENCH_PLAN_M, rlM = BENCH_RL_M } = {}) {
  const all = (collars || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  const suspect = suspectOf(collars), untrusted = [], trusted = [];
  for (const c of all) {
    const why = c.zSuspect || (c.hole_id != null && suspect.has(c.hole_id)) ? "suspect" : c.zAssumed && c.zAssumed !== "terrain" ? "assumed" : null;
    if (why) untrusted.push({ hole_id: c.hole_id, z: c.z, why }); else trusted.push(c);
  }
  const pts = trusted.length ? trusted : all;
  if (!trusted.length) untrusted.length = 0;
  const cells = new Map(), key = (i, j) => `${i},${j}`;
  pts.forEach((c) => { const k = key(Math.floor(c.x / planM), Math.floor(c.y / planM)); (cells.get(k) || cells.set(k, []).get(k)).push(c); });
  const kept = [], higher = [];
  for (const c of pts) {
    const i = Math.floor(c.x / planM), j = Math.floor(c.y / planM);
    let lower = false;
    for (let di = -1; di <= 1 && !lower; di++) for (let dj = -1; dj <= 1 && !lower; dj++) for (const o of cells.get(key(i + di, j + dj)) || []) {
      if (o.z < c.z - rlM && Math.hypot(o.x - c.x, o.y - c.y) <= planM) { lower = true; break; }
    }
    (lower ? higher : kept).push(c);
  }
  return { kept, higher, untrusted, planM, rlM }; // untrusted: #2962
}
// the collar ground: the four nearest collars, inverse distance squared, over the collars collarBenches keeps (#2584)
export function collarGround(collars) {
  return idwGround(collarBenches(collars).kept);
}
// the same interpolation over any points (a weathered base, the block model's column tops), with no bench check
export function idwGround(points) {
  const pts = (points || []).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y) && Number.isFinite(c?.z));
  if (!pts.length) return null;
  // TASKS.csv #1903 — the four nearest come out of a cell bucket, ring by ring, with the same answer as sorting every collar: on
  // Lawyers (446 collars) a dump grid of 30-40k cells sorted 446 distances per cell and froze the window 3-5 s; the pit and the
  // pit design use this ground too.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of pts) { if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x; if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y; }
  const cell = Math.max(1, Math.sqrt(Math.max(1, (x1 - x0) * (y1 - y0)) / pts.length)); // about one collar per cell
  const nx = Math.max(1, Math.floor((x1 - x0) / cell) + 1), ny = Math.max(1, Math.floor((y1 - y0) / cell) + 1);
  const buckets = new Map();
  const ci = (x) => Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))), cj = (y) => Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / cell)));
  pts.forEach((c, k) => { const q = cj(c.y) * nx + ci(c.x); (buckets.get(q) || buckets.set(q, []).get(q)).push(k); });
  return (x, y) => {
    const i0 = ci(x), j0 = cj(y), best = []; // up to four [distance, z], ascending
    const take = (k) => {
      const c = pts[k], d = Math.hypot(c.x - x, c.y - y);
      if (best.length === 4 && d >= best[3][0]) return;
      let at = best.length; while (at > 0 && best[at - 1][0] > d) at--;
      best.splice(at, 0, [d, c.z]); if (best.length > 4) best.pop();
    };
    const scan = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= ny) return; const b = buckets.get(j * nx + i); if (b) for (const k of b) take(k); };
    for (let r = 0; ; r++) {
      // a collar in ring r is at least (r - 1) cells away: once the fourth best is nearer than that, no later ring can beat it
      if (best.length === 4 && best[3][0] <= (r - 1) * cell) break;
      if (i0 - r < 0 && j0 - r < 0 && i0 + r >= nx && j0 + r >= ny) break; // the grid is exhausted
      if (r === 0) scan(i0, j0);
      else { for (let i = i0 - r; i <= i0 + r; i++) { scan(i, j0 - r); scan(i, j0 + r); } for (let j = j0 - r + 1; j <= j0 + r - 1; j++) { scan(i0 - r, j); scan(i0 + r, j); } }
    }
    if (best[0][0] < 1e-6) return best[0][1];
    let w = 0, s = 0;
    for (const [d, z] of best) { const k = 1 / (d * d); w += k; s += k * z; }
    return s / w;
  };
}
