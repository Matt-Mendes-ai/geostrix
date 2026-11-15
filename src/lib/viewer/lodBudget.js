// TASKS.csv #3252 (Main's condition on phase 3: GeoStrix must stay light on cheap laptops) and #3518 — the detail tiles' budget follows what the
// TILES cost, not the whole frame. The budget has four levels (all of the tile budget, a half, a quarter, an eighth). While the camera moves,
// each frame's interval is recorded with the number of triangles the tiles draw then (the imagery and terrain tiles each report theirs:
// setTris), and a line is fitted through the last SAMPLES of them: ms = a + b x triangles. The tiles' own cost is b x triangles, what a cut
// can save. Over FRAME_BUDGET_MS the budget is cut one level only if halving the tiles would save at least HELPS_MS (a machine slow with no
// tiles at all keeps them: the synthetic scene draws in 63 ms on an integrated GPU with none); while b is not yet known (the tile count has
// not varied) the first cut is made to find out, and is undone if it turns out not to help. Under RECOVER_MS a cut level is lifted back
// (at most every 5 s). Both the imagery and the terrain tiles read factor().
// Pure numbers, one per window; a frame sampled twice (two callers) counts once.
export const FRAME_BUDGET_MS = 33, RECOVER_MS = 22, HELPS_MS = 4, LEVELS = 4, SAMPLES = 240, NEED = 30;
export function createBudget() {
  const b = { level: 0, ema: 0, lastAt: 0, changedAt: 0, tris: {}, ring: [], slope: null, fitAt: 0, cutFrom: null };
  const trisNow = () => { let n = 0; for (const k in b.tris) n += b.tris[k]; return n; };
  // the least-squares slope of ms on triangles over the ring; null while the triangle count has hardly varied or there are few samples
  const fit = () => {
    const r = b.ring, n = r.length;
    if (n < NEED) return null;
    let mx = 0, my = 0; for (const s of r) { mx += s[0]; my += s[1]; } mx /= n; my /= n;
    let sxx = 0, sxy = 0, lo = Infinity, hi = -Infinity;
    for (const s of r) { sxx += (s[0] - mx) ** 2; sxy += (s[0] - mx) * (s[1] - my); if (s[0] < lo) lo = s[0]; if (s[0] > hi) hi = s[0]; }
    if (!(hi - lo > 0.2 * Math.max(1, mx)) || !(sxx > 0)) return null;
    return Math.max(0, sxy / sxx);
  };
  const go = (l, now) => { b.level = l; b.changedAt = now; };
  return {
    setTris(key, n) { b.tris[key] = n; },
    sample(now, moving) {
      if (now - b.lastAt < 1) return; // the same frame
      if (b.lastAt && moving) {
        const d = now - b.lastAt;
        if (d < 500) { b.ema = b.ema ? b.ema * 0.9 + d * 0.1 : d; b.ring.push([trisNow(), d]); if (b.ring.length > SAMPLES) b.ring.shift(); }
      }
      b.lastAt = now;
      if (b.ring.length < NEED || now - b.changedAt < 2000) return;
      if (now - b.fitAt > 1000) { const f = fit(); if (f != null) b.slope = f; b.fitAt = now; } // the last good fit is kept while the tile count holds still (no variance to fit)
      const own = b.slope == null ? null : b.slope * trisNow(); // ms the tiles take now
      if (b.ema > FRAME_BUDGET_MS) {
        if (b.level < LEVELS - 1 && (own == null || own / 2 >= HELPS_MS)) { b.cutFrom = own == null ? b.level : null; go(b.level + 1, now); return; }
      }
      // lifted back: quick frames again, or the tiles cost next to nothing (a slow machine that was cut: lifting adds about what they cost now)
      if (b.level > 0 && ((now - b.changedAt > 5000 && b.ema < RECOVER_MS) || (now - b.changedAt > 15000 && own != null && own < HELPS_MS / 2))) { go(b.level - 1, now); return; } // 15 s on a level before a cost-based lift: no hunting
      // a cut made to find out (b was unknown) that turns out not to help: undone
      if (b.cutFrom != null && b.slope != null && b.level > b.cutFrom && b.slope * trisNow() < HELPS_MS / 2 && b.ema > RECOVER_MS) { const to = b.cutFrom; b.cutFrom = null; go(to, now); }
    },
    factor: () => 1 / 2 ** b.level,
    state: () => ({ level: b.level, ema: b.ema, slope: b.slope, tris: trisNow(), lastAt: b.lastAt, changedAt: b.changedAt, n: b.ring.length }),
  };
}
export const lodBudget = createBudget();
// a camera's pose as one number (changes when it moves; cheap enough for every frame)
// (a weighted sum, not a polynomial: h * 31 per element reached 1e26, where a move of a metre is below the float's resolution and every frame hashed alike)
export const cameraHash = (camera) => { const e = camera.matrixWorld.elements; let h = (camera.zoom || 1) * 1e-3; for (let i = 0; i < 16; i++) h += e[i] * (1 + i * 0.137); return h; };
