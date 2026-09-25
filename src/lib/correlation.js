// TASKS.csv #21 / #405 — correlation coefficients for the multi-element correlation matrix.
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

// TASKS.csv #405 — assay grades are strongly right-skewed, so Pearson r on raw values is driven by a
// handful of high samples (and multi-element CRM standards, when left in, invent correlations between
// every element they certify). Spearman (Pearson on ranks, ties averaged) and Pearson on log10 values are
// the usual choices for geochemistry; raw Pearson stays available.
function ranks(v) {
  const idx = v.map((x, i) => i).sort((a, b) => v[a] - v[b]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}
export function correlate(xs, ys, method) {
  if (method === "log") {
    const a = [], b = [];
    for (let i = 0; i < xs.length; i++) if (xs[i] > 0 && ys[i] > 0) { a.push(Math.log10(xs[i])); b.push(Math.log10(ys[i])); }
    return { r: pearson(a, b), n: a.length };
  }
  if (method === "spearman") return { r: pearson(ranks(xs), ranks(ys)), n: xs.length };
  return { r: pearson(xs, ys), n: xs.length };
}
