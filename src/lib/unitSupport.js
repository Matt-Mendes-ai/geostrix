// TASKS.csv #1725 (review #1645, Copley) — what a modelled unit's shape rests on. Undrilled zones measured a Cu >= 1000 ppm grade
// shell whose 2,876 cells were all informed by ONE hole and all extrapolated, and reported "not covered: 0.30 Mm³ in 3 zones" with
// "Plan a hole to here": the undrilled parts were the interpolator's halo around COP-23-0001, not untested rock. A grade shell /
// estimate records its data support in its params (singleHoleCells, cellsEstimated, supportCounts, surfaceSupportCounts, #91 / #258);
// this reads them so a consumer can say so.
// -> { cells, oneHoleShare, extrapolatedShare (of the shell's BOUNDARY when known, else of the grid), weak } or null (not an estimate,
// or nothing recorded)
export function unitSupport(params) {
  if (!params || typeof params !== "object") return null;
  const cells = Number(params.cellsEstimated) || 0;
  const one = Number(params.singleHoleCells) || 0;
  const oneHoleShare = cells > 0 ? Math.min(1, one / cells) : null;
  const counts = params.surfaceSupportCounts || params.supportCounts || null;
  let extrapolatedShare = null;
  if (counts) {
    const i = Number(counts.interpolated) || 0, e = Number(counts.extrapolated) || 0, u = Number(counts.unsupported) || 0, total = i + e + u;
    if (total > 0) extrapolatedShare = (e + u) / total;
  }
  if (oneHoleShare == null && extrapolatedShare == null) return null;
  return { cells, oneHoleShare, extrapolatedShare, weak: (oneHoleShare ?? 0) >= 0.5 || (extrapolatedShare ?? 0) >= 0.5 };
}
