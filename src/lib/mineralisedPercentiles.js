// TASKS.csv #3758 (#3876's leftover) — the one-click caps (P97.5 / P99) taken over the MINERALISED population, not the whole column: in a
// project where most samples are background, the whole column's P97.5 can sit inside the ore and a cap there cuts ordinary ore grades. The
// mineralised samples are those at or above where the grades split into a background and a higher group (lib/auto/autoGradeShell.js
// bestSplit, on the log of the length-weighted grades), a value read from the data, never a "usual" cut-off; the caller says it as such. Pure.
import { bestSplit } from "./auto/autoGradeShell.js";
import { weightedPercentile } from "./probPlot.js";

// values, lengths: the samples (valueLengthArrays) -> { cut, n, p975, p99 } over the samples at or above the split, or null (no split, or
// fewer than MIN_N samples above it)
export const MIN_N = 20;
export function mineralisedPercentiles(values, lengths) {
  const vs = [], ws = [];
  values.forEach((v, i) => { if (v > 0) { vs.push(Math.log10(v)); ws.push(lengths?.[i] > 0 ? lengths[i] : 1); } });
  const split = vs.length >= MIN_N ? bestSplit(vs, ws) : null;
  if (!split) return null;
  const cut = +(10 ** split.cut).toPrecision(2);
  const mv = [], mw = [];
  values.forEach((v, i) => { if (v >= cut) { mv.push(v); mw.push(lengths?.[i] > 0 ? lengths[i] : 1); } });
  if (mv.length < MIN_N) return null;
  return { cut, n: mv.length, clear: split.clear, p975: weightedPercentile(mv, mw, 97.5), p99: weightedPercentile(mv, mw, 99) };
}
