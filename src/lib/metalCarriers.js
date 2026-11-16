// TASKS.csv #3784 (Complete GeoStrix review, narrow-vein gold) — inverse distance inside the shell turned 12 % of the composites at 3 g/t into 27 % of
// the blocks, and half of the model's metal rested on 13 composites; the Grade-tonnage table, where the ounces are read, said neither. The estimate now
// keeps each composite's share of the metal it put in the blocks (lib/estimation.js opts.carry: per block, the composite's weight times its grade,
// scaled to the block's value), and the composites' grades as quantiles, so Grade-tonnage can set the share of the composites at a cut-off beside the
// share of the blocks, and say how few composites carry the metal. Pure.

// carry: Float64Array (a value per composite). -> null or { halfFrom, contributing, tenHighestShare } — the fewest composites holding half the metal
export function metalCarriers(carry) {
  if (!carry?.length) return null;
  const v = Float64Array.from(carry).sort().reverse();
  let total = 0, contributing = 0;
  for (const x of v) if (x > 0) { total += x; contributing++; }
  if (!(total > 0)) return null;
  let acc = 0, halfFrom = 0;
  while (halfFrom < v.length && acc < total / 2) acc += v[halfFrom++];
  let ten = 0; for (let i = 0; i < Math.min(10, v.length); i++) ten += v[i];
  return { halfFrom, contributing, tenHighestShare: +(ten / total).toFixed(3) };
}

// the composites' grades, length-weighted, at n evenly spaced cumulative shares (the (i + 0.5) / n quantiles) -> number[] (rounded to 4 figures)
export function gradeQuantiles(points, n = 200) {
  const P = (points || []).filter((p) => Number.isFinite(p?.value)).map((p) => ({ v: p.value, w: p.length > 0 ? p.length : 1 })).sort((a, b) => a.v - b.v);
  if (!P.length) return null;
  const W = P.reduce((s, p) => s + p.w, 0), out = [];
  let acc = 0, j = 0;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * W;
    while (j < P.length - 1 && acc + P[j].w < t) acc += P[j++].w;
    out.push(+P[j].v.toPrecision(4));
  }
  return out;
}

// the share of the composites (by length) at or above a cut-off, from gradeQuantiles -> 0..1 (to 1 / n) or null
export function shareAtOrAbove(q, cutoff) {
  if (!q?.length || !Number.isFinite(cutoff)) return null;
  let k = 0; for (const v of q) if (v >= cutoff) k++;
  return k / q.length;
}
