// Moved verbatim from ViewerModule.jsx (TASKS.csv #1533, for its #1084 size cap): the assay marker size and screening cutoff.
// assaySizeFor: same continuous min/max normalization as the original hardcoded 1.2–3.8 range, just
// scaled by style.sizeMult (default 1) so "change the size" has an effect without changing what the
// size differences MEAN (still "bigger sphere = higher grade within this element's own range").
// TASKS.csv #306 — the normalisation inside that 1.2-3.8 range used to be LINEAR in raw grade, and on
// real assay data that means the channel carries almost nothing. Measured over the bundled 37-hole
// harry_property assay_wide.csv: 99.2% of Au markers, 99.6% of Cu, 99.7% of Zn and 98.8% of As landed
// in the bottom 10% of the radius range, because a single high-grade outlier sets `max` three to five
// orders of magnitude above the median and every ordinary sample then maps to ~1.2. Combined with the
// per-element hue this row's palette work covers, that meant NEITHER channel actually carried grade.
// Replaced with a piecewise-linear QUANTILE map through the element's own distribution — (min, 0),
// (p50, 0.5), (p90, 0.9), (max, 1) — which is the same distribution-robust idea seedBreaks now uses for
// the colour classes, so size and colour encode the same quantity the same way. Redundant encoding is
// also what keeps grade readable for a colourblind user, radius being an achromatic channel.
// A log(value) map was implemented and measured first and is NOT what shipped: it fixes the trace
// elements (Au p05-p95 radius 1.20-2.49 instead of 1.20-1.24) but inverts on the near-normally-
// distributed major oxides in the same file, where the minimum is a tiny outlier — every Al_pct marker
// came out at radius 3.58-3.72, i.e. uniformly near-maximum, which is just the old failure at the
// other end. The quantile map fixes both: measured p05/p50/p95 radius Au 1.20/2.50/3.54 and
// Al_pct 2.27/2.50/3.56, and the share of markers stuck in the bottom tenth of the radius range falls
// from 98.8-99.7% (ore elements, linear) to 0.1-26.4% across all 14 — and what is left down there is
// now genuinely the low tail of the distribution rather than 99% of the dataset.
// `range` is one entry of globalAssayRanges. A range with no percentiles (any future caller, or a
// degenerate single-value element) falls back to the original linear min/max mapping rather than
// producing NaN radii; `min === max` keeps its original 0.3 midpoint constant.
export function assaySizeFor(value, range, style) {
  const mult = style?.sizeMult ?? 1;
  const { min, max, p50, p90 } = range || {};
  let t = 0.3;
  if (max > min) {
    const seg = (v, lo, hi, tLo, tHi) => tLo + ((v - lo) / (hi - lo)) * (tHi - tLo);
    if (Number.isFinite(p50) && Number.isFinite(p90) && p50 > min && p90 > p50 && p90 < max) {
      // TASKS.csv #1696 (review #1645, Copley) — above P90 the size grows on a LOG scale to the maximum over 40 % of the size range: on
      // a linear 0.9-1 segment, 97 ppm and 6,887 ppm Cu (P90 59, max 19,400) were radius 3.54 and 3.63 - the same sphere. Now 2.8 and 3.6.
      t = value <= p50 ? seg(value, min, p50, 0, 0.35)
        : value <= p90 ? seg(value, p50, p90, 0.35, 0.6)
        : p90 > 0 ? 0.6 + 0.4 * (Math.log(value / p90) / Math.log(max / p90))
        : seg(value, p90, max, 0.6, 1);
    } else {
      t = (value - min) / (max - min);
    }
    t = Math.max(0, Math.min(1, t));
  }
  return (1.2 + 2.6 * t) * mult;
}
// assayPassesCutoff: "ignore values lower than X" — a value strictly below minCutoff is dropped
// entirely (not just recolored/shrunk), matching how a geologist would actually want a screening
// cutoff to behave for a 3D view (decluttering below-threshold noise), not just visually de-emphasized.
export function assayPassesCutoff(value, style) {
  return style?.minCutoff == null || value >= style.minCutoff;
}
