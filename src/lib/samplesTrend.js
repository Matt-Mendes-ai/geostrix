// TASKS.csv #3593 (Fireweed rehearsal, Macpass Tom West) — a trend could only be typed, taken from structure picks or logged tops, or fitted to a
// generated surface: on Tom West (no logs) the only data source was a grade shell, itself made with an isotropic search, so the fit was circular
// (88° -> 244° from the Zn 2 % shell where the composites at or above 2 % lie on 66° -> 239°). Leapfrog's habit for a tabular body with no
// structure data: the trend from the grades themselves. The samples of an element at or above a cut-off give the plane (their smallest
// spread is its pole), its major axis (the largest spread: the pitch) and their three spreads (the ratios).
// samples: [{ x, y, z }] (east, north, up). -> { dip, dipAzimuth, pitch, ratios: { max, int, min }, spreads: [major, int, minor] (m, one
// standard deviation), n } or null (fewer than 4 samples, or no plane: they lie along a line)
import { planeFromNormal, trendBasis } from "./trend.js";
import { drilledBoxes } from "./viewer/shellBoxes.js";

// eigen-decomposition of a symmetric 3x3 (Jacobi): -> [{ value, vector }] largest first
function eigen3(C) {
  const a = C.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-15) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return [0, 1, 2].map((i) => ({ value: a[i][i], vector: { x: v[0][i], y: v[1][i], z: v[2][i] } })).sort((p, q) => q.value - p.value);
}

const round1 = (v) => Math.round(v * 10) / 10;
export function samplesTrend(samples) {
  const P = (samples || []).filter((p) => [p?.x, p?.y, p?.z].every(Number.isFinite));
  if (P.length < 4) return null;
  const c = P.reduce((m, p) => ({ x: m.x + p.x / P.length, y: m.y + p.y / P.length, z: m.z + p.z / P.length }), { x: 0, y: 0, z: 0 });
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const d = [p.x - c.x, p.y - c.y, p.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (d[i] * d[j]) / P.length; }
  const [e1, e2, e3] = eigen3(C);
  const spreads = [e1, e2, e3].map((e) => Math.sqrt(Math.max(0, e.value)));
  if (!(spreads[1] > 0.02 * spreads[0])) return null; // along one line: no plane
  const plane = planeFromNormal(e3.vector);
  // the pitch whose major axis is the largest spread (searched against trendBasis, so it means what the app means by pitch)
  let pitch = 90, best = -1;
  for (let p = 0; p < 180; p += 0.5) { const m = trendBasis({ dip: plane.dip, dipAzimuth: plane.dipAzimuth, pitch: p }).major; const d = Math.abs(m.x * e1.vector.x + m.y * e1.vector.y + m.z * e1.vector.z); if (d > best) { best = d; pitch = p; } }
  const min = Math.max(spreads[2], 1e-9), cap = (v) => Math.min(20, round1(v / min));
  return { dip: plane.dip, dipAzimuth: plane.dipAzimuth, pitch, ratios: { max: cap(spreads[0]), int: Math.max(1, cap(spreads[1])), min: 1 }, spreads, n: P.length };
}

// One plane through samples in several separate bodies joins them (all of Macpass: Zn >= 7.74 % gave spreads of 19,945 x 1,773 x 242 m across
// deposits 20 km apart). The samples are grouped first (single linkage at linkM, lib/viewer/shellBoxes.js): one group with at least `major`
// of them is fitted alone (the others named as left out); otherwise no plane. -> { trend, groups: [sizes, largest first], used, leftOut }
export function samplesTrendByArea(samples, { linkM = 500, major = 0.8 } = {}) {
  const P = (samples || []).filter((p) => [p?.x, p?.y, p?.z].every(Number.isFinite));
  if (P.length < 4) return { trend: null, groups: [P.length], used: P.length, leftOut: 0 };
  const big = { xmin: -Infinity, xmax: Infinity, ymin: -Infinity, ymax: Infinity, zmin: -Infinity, zmax: Infinity };
  const groups = drilledBoxes(P, { bounds: big, padM: 0, linkM, maxShare: Infinity }).map((g) => g.idx).sort((a, b) => b.length - a.length);
  const sizes = groups.map((g) => g.length);
  if (groups.length > 1 && sizes[0] < major * P.length) return { trend: null, groups: sizes, used: 0, leftOut: P.length };
  const use = groups[0].map((i) => P[i]);
  return { trend: samplesTrend(use), groups: sizes, used: use.length, leftOut: P.length - use.length };
}
