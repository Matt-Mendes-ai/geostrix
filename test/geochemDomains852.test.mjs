// TASKS.csv #852 — geochemical domains: clr rows sum to zero, the Jacobi eigen-solver against a known matrix, PCA
// separating two synthetic populations on PC1, k-means recovering them, the domain written back as a sample column
import test from "node:test";
import assert from "node:assert/strict";
import { usableElements, clrMatrix, symmetricEigen, pca, kmeans, geochemDomains, writeDomains, DOMAIN_ATTR } from "../src/lib/geochemDomains.js";

const units = { Cu: "ppm", Zn: "ppm", Ni: "ppm", Cr: "ppm", K: "%" };
function two(seed = 3) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const S = [];
  for (let i = 0; i < 120; i++) {
    const mafic = i < 60; // mafic soils: high Ni / Cr, low K; felsic the reverse
    S.push({ sample_id: `S${i}`, x: i, y: 0, medium: "soil", truth: mafic ? "mafic" : "felsic",
      values: { Cu: 40 * 10 ** (0.15 * g()), Zn: 80 * 10 ** (0.15 * g()), Ni: (mafic ? 150 : 15) * 10 ** (0.15 * g()), Cr: (mafic ? 300 : 30) * 10 ** (0.15 * g()), K: (mafic ? 0.4 : 2.5) * 10 ** (0.12 * g()) } });
  }
  return S;
}

test("#852 usable elements by coverage; clr rows sum to zero and skip samples with a missing part", () => {
  const S = two();
  S[0].values.Ni = null; S[1].values.Cr = 0;
  const els = [{ symbol: "Cu" }, { symbol: "Zn" }, { symbol: "Ni" }, { symbol: "Cr" }, { symbol: "K" }, { symbol: "Au" }];
  assert.deepEqual(usableElements(S, els, units), ["Cu", "Zn", "Ni", "Cr", "K"], "Au is in no sample");
  const { rows, index } = clrMatrix(S, ["Cu", "Zn", "Ni", "Cr", "K"], units);
  assert.equal(rows.length, 118); assert.equal(index[0], 2);
  rows.forEach((r) => assert.ok(Math.abs(r.reduce((a, v) => a + v, 0)) < 1e-9));
});

test("#852 Jacobi eigen-decomposition of a known symmetric matrix", () => {
  const { values, vectors } = symmetricEigen([[2, 1, 0], [1, 2, 0], [0, 0, 5]]);
  assert.deepEqual(values.map((v) => +v.toFixed(9)), [5, 3, 1]);
  const v1 = vectors[1].map(Math.abs);
  assert.ok(Math.abs(v1[0] - Math.SQRT1_2) < 1e-9 && Math.abs(v1[1] - Math.SQRT1_2) < 1e-9 && v1[2] < 1e-9);
});

test("#852 PCA: PC1 carries the mafic-felsic contrast (Ni, Cr against K) and separates the populations", () => {
  const S = two();
  const { rows } = clrMatrix(S, ["Cu", "Zn", "Ni", "Cr", "K"], units);
  const p = pca(rows);
  assert.ok(p.explained[0] > 60, `PC1 explains ${p.explained[0].toFixed(0)} %`);
  const l = p.loadings[0];
  assert.ok(Math.sign(l[2]) === Math.sign(l[3]) && Math.sign(l[4]) === -Math.sign(l[2]), "Ni and Cr load together, K the other way");
  const mafic = p.scores.slice(0, 60).map((s) => s[0]), felsic = p.scores.slice(60).map((s) => s[0]);
  assert.ok(Math.min(...mafic) > Math.max(...felsic) || Math.max(...mafic) < Math.min(...felsic), "no overlap on PC1");
});

test("#852 k-means recovers the two populations and labels the larger cluster first", () => {
  const S = two();
  const { rows } = clrMatrix(S, ["Cu", "Zn", "Ni", "Cr", "K"], units);
  const km = kmeans(rows, 2);
  const agree = km.labels.slice(0, 60).filter((l) => l === km.labels[0]).length + km.labels.slice(60).filter((l) => l !== km.labels[0]).length;
  assert.ok(agree >= 118, `${agree} of 120 right`);
  assert.equal(km.labels.filter((l) => l === 0).length, 60);
  const km3 = kmeans(rows, 3);
  assert.ok(km3.withinSS < km.withinSS, "more clusters, less within-cluster scatter");
});

test("#852 the whole analysis and the write-back column", () => {
  const S = two();
  const r = geochemDomains(S, ["Cu", "Zn", "Ni", "Cr", "K"], units, { k: 2 });
  assert.equal(r.k, 2); assert.equal(r.skipped, 0); assert.equal(r.elbow[0].k, 2);
  const d1 = r.clusters[0];
  assert.ok(d1.enriched.map((e) => e.sym).some((s) => ["Ni", "Cr", "K"].includes(s)));
  const out = writeDomains(S, r);
  assert.ok(out.every((s) => /^D[12]$/.test(s.attrs[DOMAIN_ATTR])));
  assert.equal(new Set(out.slice(0, 60).map((s) => s.attrs[DOMAIN_ATTR])).size, 1, "the mafic soils share one domain");
  assert.equal(geochemDomains(S.slice(0, 4), ["Cu", "Zn"], units, { k: 2 }).error, "too few samples");
});
