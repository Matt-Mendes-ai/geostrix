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
  // TASKS.csv #1903 — the four nearest without sorting every collar per query (Lawyers, 446 collars: a dump grid froze the window 3-5 s);
  // #2945 — without allocating per query (typed arrays, squared distances).
  // TASKS.csv #3119 (from #3085, WA iron) — a k-d tree instead of #1903's cell buckets. The buckets held about one collar per cell over
  // the collars' box, which suits collars spread evenly; drilling comes in clusters, and over WA iron's 6,292 collars (21.6 x 17.4 km)
  // most cells were empty, so a query scanned ring after ring of them: 33 us inside the box and 78 us beyond it, 1.35 s of a layer-cake
  // stack's main thread (the block cut and the surface cut). The answer is the sorted one exactly: ties in distance go to the earlier
  // point, as a stable sort puts them.
  const n = pts.length, X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
  pts.forEach((c, k) => { X[k] = c.x; Y[k] = c.y; Z[k] = c.z; });
  // the tree in place: ord[lo..hi) splits at mid = (lo + hi) >> 1 on axis ax[mid] (0 = x, 1 = y, the wider side of the range's box);
  // ord[lo..mid) is on or below the split, ord(mid..hi) on or above it; ranges of LEAF points or fewer are scanned
  const LEAF = 6, ord = new Int32Array(n), ax = new Uint8Array(n);
  for (let k = 0; k < n; k++) ord[k] = k;
  const select = (C, lo, hi, m) => { // quickselect on C[ord[]] over [lo, hi), so ord[m] is the m-th
    let l = lo, r = hi - 1;
    while (r > l) {
      const pv = C[ord[(l + r) >> 1]];
      let i = l, j = r;
      while (i <= j) { while (C[ord[i]] < pv) i++; while (C[ord[j]] > pv) j--; if (i <= j) { const t = ord[i]; ord[i] = ord[j]; ord[j] = t; i++; j--; } }
      if (m <= j) r = j; else if (m >= i) l = i; else return;
    }
  };
  const build = (lo, hi) => {
    if (hi - lo <= LEAF) return;
    let ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity;
    for (let m = lo; m < hi; m++) { const k = ord[m]; if (X[k] < ax0) ax0 = X[k]; if (X[k] > ax1) ax1 = X[k]; if (Y[k] < ay0) ay0 = Y[k]; if (Y[k] > ay1) ay1 = Y[k]; }
    const mid = (lo + hi) >> 1, a = ax1 - ax0 >= ay1 - ay0 ? 0 : 1;
    ax[mid] = a; select(a ? Y : X, lo, hi, mid);
    build(lo, mid); build(mid + 1, hi);
  };
  build(0, n);
  const bd = new Float64Array(4), bz = new Float64Array(4), bk = new Int32Array(4); // the four best, ascending by (distance, index)
  let cnt = 0, qx = 0, qy = 0;
  const take = (k) => {
    const dx = X[k] - qx, dy = Y[k] - qy, d2 = dx * dx + dy * dy;
    if (cnt === 4 && (d2 > bd[3] || (d2 === bd[3] && k > bk[3]))) return;
    let at = cnt < 4 ? cnt++ : 3;
    while (at > 0 && (bd[at - 1] > d2 || (bd[at - 1] === d2 && bk[at - 1] > k))) { bd[at] = bd[at - 1]; bz[at] = bz[at - 1]; bk[at] = bk[at - 1]; at--; }
    bd[at] = d2; bz[at] = Z[k]; bk[at] = k;
  };
  const search = (lo, hi) => {
    if (hi - lo <= LEAF) { for (let m = lo; m < hi; m++) take(ord[m]); return; }
    const mid = (lo + hi) >> 1, k = ord[mid], diff = ax[mid] ? qy - Y[k] : qx - X[k];
    if (diff < 0) { search(lo, mid); take(k); if (cnt < 4 || diff * diff <= bd[3]) search(mid + 1, hi); }
    else { search(mid + 1, hi); take(k); if (cnt < 4 || diff * diff <= bd[3]) search(lo, mid); }
  };
  return (x, y) => {
    cnt = 0; qx = x; qy = y;
    search(0, n);
    if (bd[0] < 1e-12) return bz[0];
    let w = 0, s = 0;
    for (let m = 0; m < cnt; m++) { const k = 1 / bd[m]; w += k; s += k * bz[m]; }
    return s / w;
  };
}
