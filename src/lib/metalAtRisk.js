// TASKS.csv #3746 (Scottie Gold review, nuggety gold) — how much of the metal the top samples carry. The tools showed the metal a cap would remove only
// after it was typed or clicked, and offered only whole-column percentiles (P99 = 1.92 g/t removed 58.8 % of the metal); the 38 samples at 10 g/t or
// more held 50.4 % of the gold and the ten highest 27.6 %, and that was nowhere on screen. Any element, any deposit style: it reads the data only.
//
// metalAtRisk(values, weights): the arrays ascending by value (the arrays Grade statistics and Compositing already sort), weights = each sample's
// length (or 1 when unweighted); metal = value x weight.
// -> { n, total (metal), metres, rows: [{ kind: "n" | "pct", top, n, grade (the lowest grade among them), metres, pctMetal, capRemovesPct }] }
// capRemovesPct: the share of the total metal a cap AT that grade removes (the metal above it), so a cap is chosen where the loss is seen.
const TOP_N = [1, 2, 3, 5, 10, 20, 50, 100];
const TOP_PCT = [0.1, 0.5, 1, 2.5, 5, 10];

export function metalAtRisk(values, weights) {
  const n = values?.length || 0;
  let total = 0, metres = 0;
  for (let i = 0; i < n; i++) { const w = weights ? weights[i] : 1; if (!(w > 0) || !(values[i] > 0)) continue; total += values[i] * w; metres += w; }
  if (!n || !(total > 0)) return { n, total: 0, metres: 0, rows: [] };
  const wOf = (i) => { const w = weights ? weights[i] : 1; return w > 0 ? w : 0; };
  // the group counts wanted, by sample count, deduplicated and below the whole set
  const want = [];
  for (const k of TOP_N) if (k < n) want.push({ kind: "n", top: k, k });
  for (const p of TOP_PCT) { const k = Math.max(1, Math.ceil((p / 100) * n)); if (k < n && !want.some((w) => w.k === k)) want.push({ kind: "pct", top: p, k }); }
  want.sort((a, b) => a.k - b.k);
  const rows = [];
  let wi = 0, m = 0, len = 0;
  for (let c = 1; c <= n && wi < want.length; c++) {
    const i = n - c, v = values[i], w = wOf(i);
    if (v > 0) { m += v * w; len += w; }
    while (wi < want.length && want[wi].k === c) {
      const g = v;
      // the metal above the grade g (strictly above: what a cap at g removes), over the whole sample, found in the same pass by the loop below
      rows.push({ kind: want[wi].kind, top: want[wi].top, n: c, grade: g, metres: len, pctMetal: (100 * m) / total, capRemovesPct: 0 });
      wi++;
    }
  }
  // the metal a cap at each row's grade removes: sum over samples above the grade of (v - g) x w, one pass from the top
  for (const r of rows) {
    let removed = 0;
    for (let i = n - 1; i >= 0 && values[i] > r.grade; i--) removed += (values[i] - r.grade) * wOf(i);
    r.capRemovesPct = (100 * removed) / total;
  }
  return { n, total, metres, rows };
}

// the share of the total metal in the samples at or above `cut` (the Above cut-off table's '% of metal') -> number | null
export function metalShareAbove(values, weights, cut) {
  let total = 0, above = 0;
  for (let i = 0; i < (values?.length || 0); i++) {
    const v = values[i], w = weights ? weights[i] : 1;
    if (!(w > 0) || !(v > 0)) continue;
    total += v * w;
    if (v >= cut) above += v * w;
  }
  return total > 0 ? (100 * above) / total : null;
}

// a cap's effect for the line shown BEFORE it is applied: { n, above, pctMetalRemoved } on ascending arrays (capEffect's answer, without the unsorted pass)
export function capRemoves(values, weights, cap) {
  let total = 0, removed = 0, above = 0, n = 0;
  for (let i = 0; i < (values?.length || 0); i++) {
    const v = values[i], w = weights ? weights[i] : 1;
    if (!(w > 0) || !Number.isFinite(v)) continue;
    n++; total += Math.max(0, v) * w;
    if (v > cap) { above++; removed += (v - cap) * w; }
  }
  return { n, above, pctMetalRemoved: total > 0 ? (100 * removed) / total : 0 };
}
