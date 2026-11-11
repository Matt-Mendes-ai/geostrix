// TASKS.csv #2549 (review #2486, WA lithium) — a downhole variogram on 1 m composites reported a nugget of 0 %: half the samples were 2 to 5 m
// long and each was cut into identical one-metre pieces, so the pairs inside one sample differ by zero and pull the first lags to the origin.
// The Estimation dialog's 2 m default split the 2.5 m RC samples the same way. How the composite length compares with the samples' own
// lengths, by drilled metres (a hole sampled at 1 m has more samples, not more rock), and the length the samples suggest: their
// length-weighted median, to 0.5 m (2.5 m on the review's 1 m / 2.5 m / 2-5 m mix), never shorter than the composite it replaces. Pure.
// assays [{ from, to, values }], symbol, lengthM -> { n, longer (share of the sampled metres in samples longer than the composite),
// medianM (length-weighted), proposalM } | null
export function compositeVsSamples(assays, symbol, lengthM) {
  const L = Number(lengthM);
  const lens = [];
  for (const a of assays || []) {
    const v = a?.values?.[symbol], f = Number(a?.from), t = Number(a?.to);
    if (v == null || !Number.isFinite(Number(v)) || !Number.isFinite(f) || !(t > f)) continue;
    lens.push(t - f);
  }
  if (!lens.length || !(L > 0)) return null;
  lens.sort((x, y) => x - y);
  let total = 0, longerM = 0;
  for (const l of lens) { total += l; if (l > L * 1.05) longerM += l; }
  let acc = 0, medianM = lens[lens.length - 1];
  for (const l of lens) { acc += l; if (acc >= total / 2) { medianM = l; break; } }
  const proposalM = Math.max(L, Math.max(0.5, Math.round(medianM * 2) / 2));
  return { n: lens.length, longer: longerM / total, medianM, proposalM };
}
// the warning applies when a quarter or more of the sampled metres are in samples longer than the composite
export const COMPOSITE_SHORT_SHARE = 0.25;
