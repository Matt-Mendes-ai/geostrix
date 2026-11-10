// TASKS.csv #2433 (review #2325, WA uranium) — a pit cut at a typed 28° stood 32–43°, and its name, the Nested pits shells and the Pit
// design check all quoted the 28°. These say the walls as drawn wherever the typed slope is quoted.
import { t as tr } from "./i18n.js";

// the slope part of a pit's name: "28" when the walls stand within a degree of it, "28° typed, walls 32–33" otherwise (the name adds "°")
export function slopeName(slopeDeg, walls) {
  const s = Number(slopeDeg);
  if (!walls || !Number.isFinite(walls.flattest) || !Number.isFinite(walls.steepest)) return String(slopeDeg);
  if (walls.flattest - s <= 1 && walls.steepest - s <= 3) return String(slopeDeg);
  return tr("{t}° typed, walls {f}–{s}", { t: slopeDeg, f: walls.flattest.toFixed(0), s: walls.steepest.toFixed(0) });
}

// Pit design: the inter-ramp angle against the shell's attained walls ([flattest, steepest] in params.wallAnglesDeg) when the pit has
// them and no sector slopes, else against the typed slope as before. -> { side: -1 flatter / 1 steeper, walls?: [f, s] } or null (in step)
export function shellWallCompare(interRamp, wallAnglesDeg, typedDeg, bySector = false) {
  if (!Number.isFinite(interRamp)) return null;
  const w = Array.isArray(wallAnglesDeg) && wallAnglesDeg.length === 2 && wallAnglesDeg.every(Number.isFinite) && !bySector ? wallAnglesDeg : null;
  if (w) {
    if (interRamp < w[0] - 1) return { side: -1, walls: w };
    if (interRamp > w[1] + 1) return { side: 1, walls: w };
    return null;
  }
  if (!Number.isFinite(typedDeg) || Math.abs(interRamp - typedDeg) <= 1) return null;
  return { side: interRamp < typedDeg ? -1 : 1 };
}
