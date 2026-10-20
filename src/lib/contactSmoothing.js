// TASKS.csv #761 — automatic local smoothing for clustered contact points (von Harten et al. 2021): a per-point nugget
// on the points that sit in a cluster, found from the data configuration with a Gaussian kernel density estimate, so a
// cluster of noisy picks no longer bends the surface into a local artefact while isolated points stay exact.
// Measured in GemPy v3 (gempy_probe4 B, the paper's set-up): what matters is WHICH points get a nugget, not its size
// (scale 0.1-2 all removed the artefact), so the selection is the careful part.

// The two directions the contacts spread along (the plane they lie in): the top two eigenvectors of their 3 x 3
// covariance (Jacobi rotations), so a steep or vertical contact is handled like a flat one.
function principalPlane(points) {
  const n = points.length, m = [0, 0, 0];
  points.forEach((p) => { m[0] += p.x; m[1] += p.y; m[2] += p.z; });
  m[0] /= n; m[1] /= n; m[2] /= n;
  const c = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  points.forEach((p) => { const v = [p.x - m[0], p.y - m[1], p.z - m[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += v[i] * v[j]; });
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(c[p][q]) < 1e-12 * (Math.abs(c[p][p]) + Math.abs(c[q][q]) + 1e-300)) continue;
      const th = 0.5 * Math.atan2(2 * c[p][q], c[q][q] - c[p][p]), cs = Math.cos(th), sn = Math.sin(th);
      for (let k = 0; k < 3; k++) { const a = c[k][p], b = c[k][q]; c[k][p] = cs * a - sn * b; c[k][q] = sn * a + cs * b; }
      for (let k = 0; k < 3; k++) { const a = c[p][k], b = c[q][k]; c[p][k] = cs * a - sn * b; c[q][k] = sn * a + cs * b; }
      for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = cs * a - sn * b; V[k][q] = sn * a + cs * b; }
    }
  }
  const order = [0, 1, 2].sort((a, b) => c[b][b] - c[a][a]);
  return { mean: m, axes: order.slice(0, 2).map((k) => [V[0][k], V[1][k], V[2][k]]) };
}

// Gaussian KDE density at each point, as the paper: 2D, over the plane the contacts lie in, Scott's-rule bandwidth per
// principal axis (sd x n^(-1/6); with the axes decorrelated this equals scipy's gaussian_kde with its full covariance),
// at least 1 m. Not 3D: contacts lie on a surface, so their spread across it is small, and a kernel only a few metres
// thick made noisy picks in a cluster look far apart (caught by the unit test of the paper's set-up). O(n^2): fine for
// the few thousand contacts a surface has; above maxN it returns null and the caller says so.
export function kdeDensity(points, { maxN = 6000 } = {}) {
  const n = points.length;
  if (n < 3 || n > maxN) return null;
  const { mean, axes } = principalPlane(points);
  const us = Float64Array.from(points, (p) => (p.x - mean[0]) * axes[0][0] + (p.y - mean[1]) * axes[0][1] + (p.z - mean[2]) * axes[0][2]);
  const vs = Float64Array.from(points, (p) => (p.x - mean[0]) * axes[1][0] + (p.y - mean[1]) * axes[1][1] + (p.z - mean[2]) * axes[1][2]);
  const f = Math.pow(n, -1 / 6);
  const sd = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / (n - 1));
  const hu = Math.max(1, sd(us) * f), hv = Math.max(1, sd(vs) * f);
  const iu = 1 / (hu * hu), iv = 1 / (hv * hv);
  const d = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 1; // the point itself
    for (let j = i + 1; j < n; j++) {
      const du = us[i] - us[j], dv = vs[i] - vs[j];
      const q = du * du * iu + dv * dv * iv;
      if (q < 40) { const k = Math.exp(-0.5 * q); s += k; d[j] += k; }
    }
    d[i] += s;
  }
  return d;
}

// Which points are "clustered" and their nugget. The paper uses the density normalised 0-1 as the smoothing value; on
// evenly drilled data that would smooth nearly everything (every interior point is near the maximum). So a point is
// smoothed only when its density is also at least `ratio` x what the same number of points spread EVENLY over the same
// area would give: n x (kernel area 2 pi hu hv) / (area 12 sdu sdv, a uniform rectangle's sd being width / sqrt 12) =
// (pi / 6) n^(2/3) with Scott's factor, whatever the geometry. Nugget = max(floor, scale x normalised density); a
// larger nugget already on the point (a #88 soft intercept) is kept. Points right next to a cluster share its density
// at Scott's bandwidth and are smoothed with it (the paper's method does the same).
export function clusterNuggets(points, { ratio = 2, minNorm = 0.5, scale = 0.5, floor = 2e-5, maxN = 6000 } = {}) {
  const d = kdeDensity(points, { maxN });
  if (!d) return { nuggets: null, smoothed: 0, total: points.length, skipped: points.length > maxN ? "too many points" : "fewer than 3 points" };
  let max = 0;
  for (const v of d) if (v > max) max = v;
  const even = (Math.PI / 6) * Math.pow(points.length, 2 / 3);
  let smoothed = 0;
  const nuggets = Array.from(d, (v, i) => {
    const own = Number.isFinite(points[i].nugget) ? points[i].nugget : null;
    const norm = v / max;
    if (v >= ratio * even && norm >= minNorm) { smoothed++; return Math.max(own ?? 0, floor, scale * norm); }
    return own;
  });
  return { nuggets, smoothed, total: points.length, evenDensity: even, maxDensity: max };
}

// A spec ({points}) with the cluster nuggets applied: points keep their fields, smoothed ones get `nugget`
export function smoothClusteredSpec(spec, opts) {
  const r = clusterNuggets(spec.points, opts);
  if (!r.nuggets || !r.smoothed) return { spec, report: r };
  return { spec: { ...spec, points: spec.points.map((p, i) => (r.nuggets[i] == null ? p : { ...p, nugget: r.nuggets[i] })) }, report: r };
}
