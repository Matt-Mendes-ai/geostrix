// TASKS.csv #1832 / startup size (side 1, 2026-11-17) — "is this voxel model narrowed to a target band?", apart from the planned-hole checks' sums (lib/plannedHoleChecks.js, 7.7 kB), which only the Planned holes
// pane needs: the 3D view's model list asks the question at startup, the sums load with the pane. plannedHoleChecks.js re-exports these, so nothing that imports them from there changes.
// Only voxel models the user has narrowed (threshold / rangeMax inside the model's own min / max) define a target band:
// an un-narrowed model spans its whole range, and scoring a hole against every cell would tell a geologist nothing.
// TASKS.csv #1832 (review #1646, Kodiak) — a cutoff that only hides the air / no-data cells (Kodiak's chargeability at -0.035 over
// -1 air, and a few hundred mixed cells between -0.75 and 0 from a reduction before air masking) is not a band: a range is one when
// it leaves out at least BAND_MIN_SHARE of the model's real (non-air) cells. -> the share of real cells outside [threshold, rangeMax]
import { sortedShownValues } from "./voxelStretch.js"; // TASKS.csv #1832

export const BAND_MIN_SHARE = 0.02;
export function hiddenShare(m) {
  const s = sortedShownValues(m);
  if (!s || !s.length || !Number.isFinite(m.threshold) || !Number.isFinite(m.rangeMax)) return 0;
  const lower = (v) => { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < v) lo = mid + 1; else hi = mid; } return lo; };
  const upper = (v) => { let lo = 0, hi = s.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] <= v) lo = mid + 1; else hi = mid; } return lo; };
  return (lower(m.threshold) + (s.length - upper(m.rangeMax))) / s.length;
}
export const isTargetModel = (m) => hiddenShare(m) >= BAND_MIN_SHARE;
