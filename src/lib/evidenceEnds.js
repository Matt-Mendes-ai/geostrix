// TASKS.csv #1565 (review #1497, Lawyers) — a card's default membership ends, from its values over the grid: the 10th / 90th
// percentiles (a distance: 0 and the median), as on Add (#1179). Switching a Samples card from soil to rock chip recomputed the values
// (reach 320 -> 510 m) but kept the soil's ends (0 = -0.849, 1 = 0.784); the ends now follow the values until the user types one.
// Distance-to-drilling, picked points and zones have ends set from the site spacing, not from these values: null (left as they are).
import { quantileSorted } from "./arrayStats.js";

export const RESETTABLE_KINDS = new Set(["element", "index", "survey", "grade", "pxrf", "numeric", "voxel", "raster", "distance"]);
// kind, values (any array, NaN = no value) -> { low, high, log } or null
export function defaultEvidenceEnds(kind, values) {
  if (!RESETTABLE_KINDS.has(kind)) return null;
  const finite = Float64Array.from((values || []).filter(Number.isFinite));
  if (!finite.length) return null;
  finite.sort();
  if (kind === "distance") return { low: 0, high: quantileSorted(finite, 0.5), log: false };
  const low = quantileSorted(finite, 0.1), high = quantileSorted(finite, 0.9);
  return { low, high, log: (kind === "grade" || kind === "pxrf") && low > 0 && high > low };
}
