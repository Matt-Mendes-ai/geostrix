// TASKS.csv #2589 (review #2486, WA lithium-pegmatite) — collars of an operating pit: successive benches drilled on one spot are two grounds
// of two dates (48 pairs within 1 m in plan whose RLs differ by 1-15 m; 106 holes within 5 m of a collar 5 m or more higher or lower). A
// terrain triangulated through all of them is a sawtooth: 83 bench holes sat more than 5 m (up to 15.6 m) off the surface built from them,
// and the notice said nothing. Here: find the collars that share a spot with a much higher or lower one, keep the lowest per spot (the
// latest pit floor) or the highest (nearest the original surface) when the user asks, and measure the built surface against its own points.
// Pure.
import { terrainGroundAt } from "./viewer/geomath.js";
import { median } from "./arrayStats.js";

export const BENCH_R_M = 5, BENCH_DZ_M = 5;

// neighbours within r in plan (a 2D hash of r-sized cells). points: [{ x, y, z }]. -> for each point, the indices of its neighbours
function neighbours(points, r) {
  const cells = new Map(), key = (i, j) => `${i},${j}`;
  points.forEach((p, k) => { const kk = key(Math.floor(p.x / r), Math.floor(p.y / r)); (cells.get(kk) || cells.set(kk, []).get(kk)).push(k); });
  return points.map((p) => {
    const i = Math.floor(p.x / r), j = Math.floor(p.y / r), out = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const k of cells.get(key(i + di, j + dj)) || []) {
      const q = points[k];
      if (q !== p && Math.hypot(q.x - p.x, q.y - p.y) <= r) out.push(k);
    }
    return out;
  });
}

const usable = (pts) => (pts || []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y) && Number.isFinite(p?.z));

// -> { n: collars that share a spot (within r in plan) with one dz or more higher or lower, spots: how many such places (groups),
//      maxDz: the largest difference, lowRange: [min, max] RL of them } ; n = 0 when none
export function collarBenches(points, { r = BENCH_R_M, dz = BENCH_DZ_M } = {}) {
  const pts = usable(points);
  const nb = neighbours(pts, r);
  const flagged = new Set();
  let maxDz = 0;
  pts.forEach((p, k) => {
    for (const m of nb[k]) {
      const d = Math.abs(pts[m].z - p.z);
      if (d >= dz) { flagged.add(k); if (d > maxDz) maxDz = d; }
    }
  });
  // spots: connected groups of flagged collars
  const seen = new Set();
  let spots = 0;
  for (const k of flagged) {
    if (seen.has(k)) continue;
    spots++;
    const st = [k];
    seen.add(k);
    while (st.length) { const a = st.pop(); for (const m of nb[a]) if (flagged.has(m) && !seen.has(m)) { seen.add(m); st.push(m); } }
  }
  return { n: flagged.size, spots, maxDz };
}

// mode "all" (as before) | "lowest" (drop a collar with one dz or more LOWER within r: the latest pit floor) | "highest" (drop one with
// a collar dz or more HIGHER within r: nearest the original surface). -> { points, dropped }
export function pickBenchGround(points, mode = "all", { r = BENCH_R_M, dz = BENCH_DZ_M } = {}) {
  const pts = usable(points);
  if (mode !== "lowest" && mode !== "highest") return { points: pts, dropped: 0 };
  const nb = neighbours(pts, r);
  const keep = pts.filter((p, k) => !nb[k].some((m) => (mode === "lowest" ? p.z - pts[m].z >= dz : pts[m].z - p.z >= dz)));
  return { points: keep, dropped: pts.length - keep.length };
}

// the built terrain against the points it was built from. -> { n (with ground), noGround, median (|dz|), worst: { dz, id }, over (> limit) }
export function surfaceMisfit(points, terrain, limit = 5) {
  const d = [];
  let noGround = 0, worst = null;
  for (const p of usable(points)) {
    const g = terrainGroundAt(terrain, p.x, p.y);
    if (!Number.isFinite(g)) { noGround++; continue; }
    const dz = p.z - g;
    d.push(Math.abs(dz));
    if (!worst || Math.abs(dz) > Math.abs(worst.dz)) worst = { dz, id: p.hole_id ?? p.id ?? null };
  }
  return { n: d.length, noGround, median: d.length ? median(d) : null, worst, over: d.filter((v) => v > limit).length };
}
