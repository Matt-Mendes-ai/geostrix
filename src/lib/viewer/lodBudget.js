// TASKS.csv #3252 (Main's condition on phase 3: GeoStrix must stay light on cheap laptops) — the detail tiles' budget follows the frame time.
// While the camera moves, each frame's interval is averaged (EMA); over FRAME_BUDGET_MS the tile budgets are halved (at most every 2 s, down
// to an eighth), under RECOVER_MS they grow back by a quarter (at most every 5 s). Both the imagery and the terrain tiles read factor().
// Pure numbers, one per window; a frame sampled twice (two callers) counts once.
export const FRAME_BUDGET_MS = 33, RECOVER_MS = 22, MIN_FACTOR = 0.125;
export function createBudget() {
  const b = { factor: 1, ema: 0, lastAt: 0, changedAt: 0, samples: 0 };
  return {
    sample(now, moving) {
      if (now - b.lastAt < 1) return; // the same frame
      if (b.lastAt && moving) { const d = now - b.lastAt; if (d < 500) { b.ema = b.ema ? b.ema * 0.9 + d * 0.1 : d; b.samples++; } }
      b.lastAt = now;
      if (b.samples < 10) return;
      if (b.ema > FRAME_BUDGET_MS && now - b.changedAt > 2000 && b.factor > MIN_FACTOR) { b.factor = Math.max(MIN_FACTOR, b.factor / 2); b.changedAt = now; }
      else if (b.ema < RECOVER_MS && now - b.changedAt > 5000 && b.factor < 1) { b.factor = Math.min(1, b.factor * 1.25); b.changedAt = now; }
    },
    factor: () => b.factor,
    state: () => ({ ...b }),
  };
}
export const lodBudget = createBudget();
// a camera's pose as one number (changes when it moves; cheap enough for every frame)
// (a weighted sum, not a polynomial: h * 31 per element reached 1e26, where a move of a metre is below the float's resolution and every frame hashed alike)
export const cameraHash = (camera) => { const e = camera.matrixWorld.elements; let h = (camera.zoom || 1) * 1e-3; for (let i = 0; i < 16; i++) h += e[i] * (1 + i * 0.137); return h; };
