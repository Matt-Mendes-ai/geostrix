// TASKS.csv #3271 (Galore Creek review) — the top cut of a set's other elements. In a Cu + Au + Ag set only copper was capped: gold (CV 237 %,
// composites to 7.59 g/t) and silver were estimated uncapped, said only in a hover tooltip, while a run on gold alone opens capped at its P99
// (the dialog's rule since #1573: a CV over 150 % starts capped at the length-weighted P99). Each member now takes the same proposal.
import { lengthWeightedPercentile } from "./geochem.js";

export const CAP_CV_PCT = 150;

// the coefficient of variation in % of the element's assay values (sample stdev / mean), as the dialog's elementCV; null under 3 values
export function valuesCV(assays, symbol) {
  let n = 0, s = 0;
  for (const a of assays || []) { const v = a.values?.[symbol]; if (Number.isFinite(v)) { n++; s += v; } }
  if (n < 3) return null;
  const mean = s / n;
  if (!(mean > 0)) return null;
  let ss = 0;
  for (const a of assays || []) { const v = a.values?.[symbol]; if (Number.isFinite(v)) ss += (v - mean) ** 2; }
  return (Math.sqrt(ss / (n - 1)) / mean) * 100;
}

// -> { cv, proposed }: proposed is the length-weighted P99 (4 significant figures) when the CV is over 150 %, else null (not capped)
export function memberCapProposal(assays, symbol, unit, elementUnits) {
  const cv = valuesCV(assays, symbol);
  if (!(cv > CAP_CV_PCT)) return { cv, proposed: null };
  const p99 = lengthWeightedPercentile(assays, symbol, unit, elementUnits, 99);
  return { cv, proposed: Number.isFinite(p99) && p99 > 0 ? Number(p99.toPrecision(4)) : null };
}
