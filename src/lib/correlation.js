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

// TASKS.csv #1514 (review #1497, Lawyers) — the whole matrix at once, as correlate() pair by pair (pairwise deletion, the same
// n and r), but: an element without gaps is ranked once (Spearman), log10 values are taken once, Pearson runs over the two
// columns in place (no paired arrays), only the upper triangle is computed, and `cache` (a Map the caller keeps while the
// rows stay the same) holds each element's prepared column and each pair, so ticking one more element computes its row only.
// On Lawyers (83,670 rows, 13 elements) every cell re-sorted both columns: 13.4 s per tick.
// cols: symbol -> array of numbers, null for missing.
export function correlationMatrix(cols, symbols, method, cache = new Map()) {
  const prep = (s) => {
    const key = `prep|${method}|${s}`;
    let p = cache.get(key);
    if (p) return p;
    const src = cols[s] || [];
    const vals = new Float64Array(src.length);
    let complete = true;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      const x = v == null || !Number.isFinite(v) ? NaN : method === "log" ? (v > 0 ? Math.log10(v) : NaN) : v;
      if (Number.isNaN(x)) complete = false;
      vals[i] = x;
    }
    p = { vals, complete, ranks: method === "spearman" && complete ? Float64Array.from(ranks(Array.from(vals))) : null };
    cache.set(key, p);
    return p;
  };
  const cell = (a, b) => {
    const key = `pair|${method}|${a}|${b}`;
    let c = cache.get(key);
    if (c) return c;
    const pa = prep(a), pb = prep(b);
    if (a === b) {
      let n = 0;
      for (let i = 0; i < pa.vals.length; i++) if (!Number.isNaN(pa.vals[i])) n++;
      c = { r: n >= 2 ? 1 : null, n };
    } else if (method === "spearman" && pa.ranks && pb.ranks) {
      c = { r: pearsonPaired(pa.ranks, pb.ranks).r, n: pa.vals.length };
    } else if (method === "spearman") {
      const xs = [], ys = [];
      for (let i = 0; i < pa.vals.length; i++) if (!Number.isNaN(pa.vals[i]) && !Number.isNaN(pb.vals[i])) { xs.push(pa.vals[i]); ys.push(pb.vals[i]); }
      c = { r: pearson(ranks(xs), ranks(ys)), n: xs.length };
    } else {
      c = pearsonPaired(pa.vals, pb.vals);
    }
    cache.set(key, c);
    return c;
  };
  const m = {};
  symbols.forEach((a) => { m[a] = {}; });
  symbols.forEach((a, i) => {
    for (let j = i; j < symbols.length; j++) {
      const b = symbols[j];
      const c = cell(a, b);
      m[a][b] = c; m[b][a] = c;
    }
  });
  return m;
}

// Pearson over the rows where both columns hold a number (NaN = missing): { r, n }, as pearson() on the paired values
function pearsonPaired(x, y) {
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i], b = y[i]; if (a === a && b === b) { n++; sx += a; sy += b; } }
  if (n < 2) return { r: null, n };
  const mx = sx / n, my = sy / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i], b = y[i]; if (a === a && b === b) { const dx = a - mx, dy = b - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; } }
  return { r: sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy), n };
}
