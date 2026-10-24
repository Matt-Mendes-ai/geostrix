// TASKS.csv #852 — geochemical domains of surface samples (Matt: "let's do A to D", B): centred log-ratio transform,
// principal components with the loadings shown, and k-means, written back to the samples as a column so the
// Thresholds populations (#841) and the pathfinder index (#843) can be judged within them.
//
// Why this way (Templ, Filzmoser & Reimann 2008, Applied Geochemistry 23, 2198-2213, "Cluster analysis applied to
// regional geochemical data: problems and possibilities"): concentrations are parts of a closed whole, so distances
// between raw ppm are artefacts of closure - the clr transform (Aitchison 1986) opens them; logs tame the skew that
// would otherwise let a few outliers own the clusters; the number of clusters is the user's choice (the within-cluster
// sum of squares for k = 2..8 is shown as a guide, there is no right answer); and the clusters mostly reproduce
// lithology or regolith, which is the useful result here - populations to threshold within - not a mineral map.
import { valueIn } from "./geochem.js";

// elements with a positive value in at least `minCoverage` of the samples, in the project's order
export function usableElements(samples, elements, units, minCoverage = 0.9) {
  return elements.filter((e) => {
    const n = samples.reduce((c, s) => c + (valueIn(s, e.symbol, units[e.symbol] || "ppm", units) > 0 ? 1 : 0), 0);
    return samples.length > 0 && n / samples.length >= minCoverage;
  }).map((e) => e.symbol);
}

// clr per sample over `symbols` (all must be > 0): rows of log(x_i) - mean_i(log x). Samples missing one are skipped.
export function clrMatrix(samples, symbols, units) {
  const rows = [], index = [];
  samples.forEach((s, i) => {
    const logs = symbols.map((sym) => { const v = valueIn(s, sym, units[sym] || "ppm", units); return v > 0 ? Math.log(v) : NaN; });
    if (logs.some((v) => !Number.isFinite(v))) return;
    const m = logs.reduce((a, v) => a + v, 0) / logs.length;
    rows.push(logs.map((v) => v - m)); index.push(i);
  });
  return { rows, index };
}

// Eigen-decomposition of a symmetric matrix by cyclic Jacobi rotations -> { values (desc), vectors (columns, same order) }
export function symmetricEigen(A) {
  const n = A.length, a = A.map((r) => r.slice()), v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => v.map((row) => row[i])) };
}

// PCA of the clr rows -> { mean, loadings [pc][variable], explained [% per pc], scores [row][pc] }
export function pca(rows) {
  const n = rows.length, d = rows[0]?.length || 0;
  if (n < 3 || d < 2) return null;
  const mean = Array(d).fill(0);
  rows.forEach((r) => r.forEach((x, j) => { mean[j] += x / n; }));
  const C = Array.from({ length: d }, () => Array(d).fill(0));
  rows.forEach((r) => { for (let i = 0; i < d; i++) for (let j = i; j < d; j++) C[i][j] += (r[i] - mean[i]) * (r[j] - mean[j]) / (n - 1); });
  for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) C[i][j] = C[j][i];
  const { values, vectors } = symmetricEigen(C);
  const total = values.reduce((a, v) => a + Math.max(0, v), 0) || 1;
  // sign convention: the largest-magnitude loading of each component positive
  const loadings = vectors.map((vec) => { const big = vec.reduce((bi, x, i) => (Math.abs(x) > Math.abs(vec[bi]) ? i : bi), 0); return vec[big] < 0 ? vec.map((x) => -x) : vec; });
  const scores = rows.map((r) => loadings.map((vec) => vec.reduce((a, w, j) => a + w * (r[j] - mean[j]), 0)));
  return { mean, loadings, explained: values.map((v) => (100 * Math.max(0, v)) / total), scores };
}

// k-means++ with restarts on the rows (centred clr) -> { labels, centres, withinSS }
export function kmeans(rows, k, { restarts = 10, iterations = 100, seed = 1 } = {}) {
  const n = rows.length, d = rows[0]?.length || 0;
  if (!n || k < 1) return { labels: [], centres: [], withinSS: 0 };
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const dist2 = (a, b) => { let t = 0; for (let j = 0; j < d; j++) { const e = a[j] - b[j]; t += e * e; } return t; };
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const centres = [rows[Math.floor(rnd() * n)].slice()];
    while (centres.length < Math.min(k, n)) { // k-means++ seeding
      const w = rows.map((row) => Math.min(...centres.map((c) => dist2(row, c))));
      const tot = w.reduce((a, v) => a + v, 0);
      let u = rnd() * tot, pick = n - 1;
      for (let i = 0; i < n; i++) { u -= w[i]; if (u <= 0) { pick = i; break; } }
      centres.push(rows[pick].slice());
    }
    const labels = new Int32Array(n);
    for (let it = 0; it < iterations; it++) {
      let moved = 0;
      for (let i = 0; i < n; i++) { let bi = 0, bd = Infinity; centres.forEach((c, ci) => { const dd = dist2(rows[i], c); if (dd < bd) { bd = dd; bi = ci; } }); if (labels[i] !== bi) { labels[i] = bi; moved++; } }
      const sums = centres.map(() => Array(d).fill(0)), cnt = centres.map(() => 0);
      for (let i = 0; i < n; i++) { cnt[labels[i]]++; rows[i].forEach((x, j) => { sums[labels[i]][j] += x; }); }
      centres.forEach((c, ci) => { if (cnt[ci]) for (let j = 0; j < d; j++) c[j] = sums[ci][j] / cnt[ci]; });
      if (!moved && it > 0) break;
    }
    const withinSS = rows.reduce((a, row, i) => a + dist2(row, centres[labels[i]]), 0);
    if (!best || withinSS < best.withinSS) best = { labels: Array.from(labels), centres, withinSS };
  }
  // relabel by size, largest first
  const order = [...best.centres.keys()].sort((a, b) => best.labels.filter((l) => l === b).length - best.labels.filter((l) => l === a).length);
  const map = new Map(order.map((old, nw) => [old, nw]));
  return { labels: best.labels.map((l) => map.get(l)), centres: order.map((i) => best.centres[i]), withinSS: best.withinSS };
}

// The whole analysis -> { symbols, index (sample indices used), pca, k, labels, clusters: [{ id, n, enriched, depleted }],
// elbow: [{ k, withinSS }], skipped }
export function geochemDomains(samples, symbols, units, { k = 3, elbowMax = 8 } = {}) {
  const { rows, index } = clrMatrix(samples, symbols, units);
  if (rows.length < Math.max(6, 2 * k)) return { error: "too few samples", n: rows.length };
  const p = pca(rows);
  const km = kmeans(rows, k);
  const overall = symbols.map((_, j) => median(rows.map((r) => r[j])));
  const clusters = Array.from({ length: k }, (_, c) => {
    const members = rows.filter((_, i) => km.labels[i] === c);
    const diff = symbols.map((sym, j) => ({ sym, d: members.length ? median(members.map((r) => r[j])) - overall[j] : 0 })).sort((a, b) => b.d - a.d);
    return { id: `D${c + 1}`, n: members.length, enriched: diff.slice(0, 3).filter((x) => x.d > 0), depleted: diff.slice(-3).reverse().filter((x) => x.d < 0) };
  });
  const elbow = [];
  for (let kk = 2; kk <= Math.min(elbowMax, Math.floor(rows.length / 2)); kk++) elbow.push({ k: kk, withinSS: kk === k ? km.withinSS : kmeans(rows, kk, { restarts: 4 }).withinSS });
  return { symbols, index, pca: p, k, labels: km.labels, clusters, elbow, skipped: samples.length - rows.length };
}
function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; }

export const DOMAIN_ATTR = "Geochemical domain";
// the samples with the domain written into attrs[DOMAIN_ATTR] (those left out keep no value)
export function writeDomains(samples, result) {
  const byIndex = new Map(result.index.map((i, r) => [i, `D${result.labels[r] + 1}`]));
  return samples.map((s, i) => { const attrs = { ...(s.attrs || {}) }; if (byIndex.has(i)) attrs[DOMAIN_ATTR] = byIndex.get(i); else delete attrs[DOMAIN_ATTR]; return Object.keys(attrs).length ? { ...s, attrs } : (() => { const { attrs: _a, ...rest } = s; return rest; })(); });
}
