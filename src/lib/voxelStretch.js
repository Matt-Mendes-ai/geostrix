// TASKS.csv #1812 (review #1646, Kodiak) — the default colour range of a block model with no colour stops: the 2nd to 98th percentile
// of its cells (air left out by the import's own rule, #481 / #1659), not its single min and max. Kodiak's chargeability ran to 23.1
// mV/V on a linear ramp while 95 % of the cells sat at or below 7.3: the model was purple and the IP high a teal smudge. Values beyond
// the clip take the end colours, and the legend says so ('≤ 0.9', '≥ 9.4'). model.stretch === "minmax" (the Range boxes typed, or
// chosen in the colour editor) keeps model.min / max as before. Cached per cells array: computed once per model.
import { maskAirCells } from "./voxelAir.js"; // TASKS.csv #3159: not voxel.js, which put the UBC / block-model parsers in startup

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
  airCache.set(cells, air);
  return kept;
}

// TASKS.csv #1872 (review #1646, Kodiak) — a model saved before #1659 still holds its -1 air slab, and the blocks averaged with it read a
// little below 0: the printed chargeability key started at -0.035 mV/V when its range was typed or its colours edited (the default
// 2-98 % stretch already left them out). Where the air flag is negative, the negatives above it are air-diluted, not rock: the low end of
// the key is the lowest value at or above 0. -> lo, or that value. (A model imported since #1659 masks the air before averaging: none.)
const airCache = new WeakMap();
export function airDilutedFloor(model, lo) {
  if (!(lo < 0)) return lo;
  const s = sortedShownValues(model), air = s ? airCache.get(model.cells) : null;
  if (!(air < 0)) return lo;
  const i = s.findIndex((x) => x >= 0);
  return i < 0 ? lo : Math.max(lo, s[i]);
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
