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
// TASKS.csv #2948 — finite values (the usual case) are put in order by a radix sort of their bit patterns instead of an index sort with a
// comparator: the same order (stable, -0 next to 0, ties still averaged by value), about 80 ms instead of 0.5 s per column of 480,000 log readings
function radixOrder(v) {
  const n = v.length, f = Float64Array.from(v), w = new Uint32Array(f.buffer);
  let lo = new Uint32Array(n), hi = new Uint32Array(n), ix = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let l = w[2 * i], h = w[2 * i + 1];
    if (h & 0x80000000) { h = ~h >>> 0; l = ~l >>> 0; } else h = (h | 0x80000000) >>> 0; // negatives reversed, positives after them
    lo[i] = l; hi[i] = h; ix[i] = i;
  }
  let lo2 = new Uint32Array(n), hi2 = new Uint32Array(n), ix2 = new Uint32Array(n);
  const cnt = new Uint32Array(2048);
  for (const [word, shift, bits] of [[0, 0, 11], [0, 11, 11], [0, 22, 10], [1, 0, 11], [1, 11, 11], [1, 22, 10]]) {
    const mask = (1 << bits) - 1, key = word ? hi : lo;
    cnt.fill(0);
    for (let i = 0; i < n; i++) cnt[(key[i] >>> shift) & mask]++;
    if (cnt[(key[0] >>> shift) & mask] === n) continue; // every value has this digit: the pass would change nothing
    for (let b = 0, sum = 0; b <= mask; b++) { const c = cnt[b]; cnt[b] = sum; sum += c; }
    for (let i = 0; i < n; i++) { const d = cnt[(key[i] >>> shift) & mask]++; lo2[d] = lo[i]; hi2[d] = hi[i]; ix2[d] = ix[i]; }
    [lo, lo2] = [lo2, lo]; [hi, hi2] = [hi2, hi]; [ix, ix2] = [ix2, ix];
  }
  return ix;
}
function ranks(v) {
  let finite = v.length > 0;
  for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) { finite = false; break; }
  if (finite) {
    const idx = radixOrder(v), n = v.length, r = new Float64Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k]] = avg;
      i = j + 1;
    }
    return r;
  }
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
// onPair(done, total): after each cell of the upper triangle (TASKS.csv #3032 — the worker's progress)
export function correlationMatrix(cols, symbols, method, cache = new Map(), onPair = null) {
  let scratch = null; // #2904 — the gapped Spearman's buffers, made on the first such pair
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
    // #2508 — each element's rows are sorted once (order); a pair's ranks then come from one walk of that order
    // #2904 (WA iron review: 7.6 s for 27 elements on 147,891 samples, 11.3 s per QAQC toggle) — a complete column is ranked once too, and
    // keeps its centred ranks and their sum of squares, so a pair of complete columns is one dot product; the order comes from a native
    // typed-array sort (sortedOrder); a complete column is never re-sorted for a pair with a gapped one
    p = { vals, complete, order: method === "spearman" ? sortedOrder(vals) : null, dev: null, ss: 0 };
    if (method === "spearman" && complete && vals.length) {
      const r = ranksFromOrder(p.order, vals), mean = (vals.length + 1) / 2;
      let ss = 0;
      for (let i = 0; i < r.length; i++) { r[i] -= mean; ss += r[i] * r[i]; }
      p.dev = r; p.ss = ss;
    }
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
    } else if (method === "spearman" && pa.dev && pb.dev) {
      const n = pa.vals.length; let sxy = 0;
      for (let i = 0; i < n; i++) sxy += pa.dev[i] * pb.dev[i];
      c = { r: n >= 2 && pa.ss > 0 && pb.ss > 0 ? sxy / Math.sqrt(pa.ss * pb.ss) : null, n };
    } else if (method === "spearman") {
      // #2508 (review #2486: 644 ms a tick, 10.7 s for 30 ticks on 21,974 rows) — the rows both hold, ranked by walking each element's
      // presorted order (O(n), ties averaged as ranks() does) instead of re-sorting both columns for every pair. #2904 — in one fused pass
      // per column, into scratch buffers shared by the whole matrix (no arrays per pair)
      if (!scratch || scratch.ra.length < pa.vals.length) scratch = { ra: new Float64Array(pa.vals.length), sel: new Int32Array(pa.vals.length) };
      c = spearmanGapped(pa, pb, scratch);
    } else {
      c = pearsonPaired(pa.vals, pb.vals);
    }
    cache.set(key, c);
    return c;
  };
  const m = {};
  symbols.forEach((a) => { m[a] = {}; });
  const total = (symbols.length * (symbols.length + 1)) / 2;
  let done = 0;
  symbols.forEach((a, i) => {
    for (let j = i; j < symbols.length; j++) {
      const b = symbols[j];
      const c = cell(a, b);
      m[a][b] = c; m[b][a] = c;
      if (onPair) onPair(++done, total);
    }
  });
  return m;
}

// #2508 — the row indices holding a number, sorted by value, ties in row order. #2904 — the values sorted natively (Float64Array.sort, no
// comparator calls), each distinct value's first position noted, then each row placed at its value's next free slot: about 4x the speed of an
// index sort with a comparator on 133,000 values, and the same order. (-0 and 0 are one value here, as === has them.)
export function sortedOrder(vals) {
  let m = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] === vals[i]) m++;
  const s = new Float64Array(m);
  let k = 0;
  for (let i = 0; i < vals.length; i++) if (vals[i] === vals[i]) s[k++] = vals[i] === 0 ? 0 : vals[i];
  s.sort();
  const first = new Map();
  for (let i = 0; i < m; i++) if (i === 0 || s[i] !== s[i - 1]) first.set(s[i], i);
  const next = new Int32Array(m), order = new Int32Array(m);
  for (let i = 0; i < vals.length; i++) {
    const x = vals[i];
    if (x !== x) continue;
    const lo = first.get(x === 0 ? 0 : x);
    order[lo + next[lo]++] = i;
  }
  return order;
}
// #2904 — ranks (1-based, ties averaged) of a complete column from its order -> Float64Array by row
function ranksFromOrder(order, vals) {
  const r = new Float64Array(vals.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && vals[order[j + 1]] === vals[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k]] = avg;
    i = j + 1;
  }
  return r;
}
// #2904 — Spearman over the rows both columns hold: a's ranks within those rows by walking a's order (into scratch.ra), then b's ranks by
// walking b's order, accumulated against a's as they are made. Centred on the mean rank (m + 1) / 2, which averaging ties keeps. -> { r, n }
function spearmanGapped(pa, pb, scratch) {
  const va = pa.vals, vb = pb.vals, ra = scratch.ra, sel = scratch.sel;
  let m = 0;
  for (let k = 0; k < pa.order.length; k++) { const row = pa.order[k]; if (vb[row] === vb[row]) sel[m++] = row; }
  if (m < 2) return { r: null, n: m };
  const mean = (m + 1) / 2;
  for (let i = 0; i < m;) {
    let j = i; const v = va[sel[i]];
    while (j + 1 < m && va[sel[j + 1]] === v) j++;
    const d = (i + j) / 2 + 1 - mean;
    for (let k = i; k <= j; k++) ra[sel[k]] = d;
    i = j + 1;
  }
  let q = 0;
  for (let k = 0; k < pb.order.length; k++) { const row = pb.order[k]; if (va[row] === va[row]) sel[q++] = row; }
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < q;) {
    let j = i; const v = vb[sel[i]];
    while (j + 1 < q && vb[sel[j + 1]] === v) j++;
    const d = (i + j) / 2 + 1 - mean;
    for (let k = i; k <= j; k++) { const x = ra[sel[k]]; sxy += x * d; sxx += x * x; syy += d * d; }
    i = j + 1;
  }
  return { r: sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy), n: m };
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
