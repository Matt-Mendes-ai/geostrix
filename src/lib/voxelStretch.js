// TASKS.csv #1812 (review #1646, Kodiak) — the default colour range of a block model with no colour stops: the 2nd to 98th percentile
// of its cells (air left out by the import's own rule, #481 / #1659), not its single min and max. Kodiak's chargeability ran to 23.1
// mV/V on a linear ramp while 95 % of the cells sat at or below 7.3: the model was purple and the IP high a teal smudge. Values beyond
// the clip take the end colours, and the legend says so ('≤ 0.9', '≥ 9.4'). model.stretch === "minmax" (the Range boxes typed, or
// chosen in the colour editor) keeps model.min / max as before. Cached per cells array: computed once per model.
import { maskAirCells } from "./voxel.js";

const cache = new WeakMap();
export const STRETCH_LO = 0.02, STRETCH_HI = 0.98;

// The model's shown values (finite, not air), sorted; cached
export function sortedShownValues(model) {
  const cells = model?.cells;
  if (!Array.isArray(cells) || !cells.length) return null;
  const hit = cache.get(cells);
  if (hit) return hit;
  const v = Float64Array.from(cells, (c) => c.value);
  const air = maskAirCells(Float64Array.from(v)).value;
  const kept = v.filter((x) => Number.isFinite(x) && x !== air).sort();
  cache.set(cells, kept);
  return kept;
}

// [lo, hi] for the colours, or null (use model.min / max): stops of its own, "minmax" chosen, too few values, or a flat model
export function voxelStretch(model) {
  if (!model || model.stops?.length || model.stretch === "minmax") return null;
  const s = sortedShownValues(model);
  if (!s || s.length < 20) return null;
  const q = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const lo = q(STRETCH_LO), hi = q(STRETCH_HI);
  return hi > lo ? [lo, hi] : null;
}
