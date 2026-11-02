// TASKS.csv #1290 — apart from surfaceSpread.js: the 3D view draws a saved spread at startup, and needs only these, not the 12 kB of realization maths.
// Colour for a spread value, t = spread / scaleMax clipped to [0, 1]. Pale where the surface barely
// moves, dark where it moves most — lightness falls monotonically (L* ~95 -> ~66 -> ~27), so it reads
// correctly in greyscale and under colour-vision deficiency, and it does NOT reuse the green/amber/red
// of #92's data-support index: that overlay measures the drill pattern, this one measures sensitivity
// to stated input uncertainty, and the two must not be mistaken for each other. Returns [r, g, b] 0-1.
const SPREAD_STOPS = [[255, 247, 204], [240, 138, 36], [94, 26, 82]];
export function spreadColor(t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 1)) * 2;
  const i = Math.min(1, Math.floor(x));
  const f = x - i;
  const a = SPREAD_STOPS[i], b = SPREAD_STOPS[i + 1];
  return [0, 1, 2].map((c) => (a[c] + (b[c] - a[c]) * f) / 255);
}
// Vertices where some realisation produced no surface nearby are flagged in neutral grey instead — "not
// reproduced" is a different finding from "moved a lot", and folding it into the ramp would hide it.
export const SPREAD_NOT_REPRODUCED = [0.6, 0.63, 0.66];
