// TASKS.csv #1622 (review #1497, Lawyers) — minimum-curvature gridding with tension (Briggs 1974; Smith & Wessel 1990, GMT's
// "surface"), beside IDW for soil and point surveys: IDW draws bullseyes on single samples and is flat between them; a tensioned
// minimum-curvature surface bends smoothly through the samples. Pure; the node layout is idw.js idwGrid's (row 0 = north, node
// centres at xmin + (i + 0.5) cell, ymax - (j + 0.5) cell), so the two methods share gridSamples' extent, blanking and raster.
//
// Each sample fixes its nearest node (several in one node: their mean). The free nodes minimise the surface's energy
//   E = (1 - T) sum (del2 u)^2 + T sum |grad u|^2
// whose minimum is the tensioned minimum-curvature surface ((1 - T) del4 u - T del2 u = 0) with its natural edge conditions. E is a
// convex quadratic, solved by conjugate gradients (the plain relaxation GMT describes needed thousands of sweeps here and still
// settled off a plane through the samples). Coarse to fine: a grid twice as coarse, solved and interpolated, starts the next.
// T = 0 is pure minimum curvature (smoothest; a plane through the samples comes back exactly; overshoots most); T = 1 a membrane (no
// overshoot, a tent between samples, flat at the edges); GMT suggests 0.25 for potential fields. Not clipped: between samples the
// surface can overshoot their range, most with low tension (log10 gridding keeps that positive in the unit).

// out = H v on the full grid (H the Hessian of E up to a factor 2). The curvature term is the thin-plate form u_xx^2 + 2 u_xy^2 +
// u_yy^2: the same del4 in the interior, but every second difference that fits on the grid counts, edges included, so only a plane
// costs nothing. (Laplacians at the interior nodes alone left the edge rows free: with T = 0 any harmonic wobble along them was
// free and a plane through the samples came back up to 59 off.) Slope terms on every pair of neighbours.
// act (optional): the nodes that exist; a term with any node outside is left out, which solves on that area alone with natural edges
function applyH(v, out, nx, ny, a, T, act = null) {
  out.fill(0);
  if (a > 0) {
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx - 1; i++) { // u_xx
      const k = j * nx + i;
      if (act && !(act[k - 1] & act[k] & act[k + 1])) continue;
      const l = a * (v[k - 1] - 2 * v[k] + v[k + 1]);
      out[k - 1] += l; out[k] -= 2 * l; out[k + 1] += l;
    }
    for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx; i++) { // u_yy
      const k = j * nx + i;
      if (act && !(act[k - nx] & act[k] & act[k + nx])) continue;
      const l = a * (v[k - nx] - 2 * v[k] + v[k + nx]);
      out[k - nx] += l; out[k] -= 2 * l; out[k + nx] += l;
    }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { // 2 u_xy, on each cell
      const k = j * nx + i;
      if (act && !(act[k] & act[k + 1] & act[k + nx] & act[k + nx + 1])) continue;
      const m = 2 * a * (v[k] - v[k + 1] - v[k + nx] + v[k + nx + 1]);
      out[k] += m; out[k + 1] -= m; out[k + nx] -= m; out[k + nx + 1] += m;
    }
  }
  if (T > 0) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i < nx - 1 && (!act || act[k] & act[k + 1])) { const d = T * (v[k + 1] - v[k]); out[k + 1] += d; out[k] -= d; }
      if (j < ny - 1 && (!act || act[k] & act[k + nx])) { const d = T * (v[k + nx] - v[k]); out[k + nx] += d; out[k] -= d; }
    }
  }
}

// conjugate gradients on the free nodes, from u (fixed nodes already hold their values); -> iterations used
function solveCG(u, fixed, nx, ny, T, { maxIter, relTol, act = null }) {
  const n = nx * ny, a = 1 - T;
  const r = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  applyH(u, r, nx, ny, a, T, act);
  let rr = 0;
  for (let k = 0; k < n; k++) { r[k] = fixed[k] || (act && !act[k]) ? 0 : -r[k]; p[k] = r[k]; rr += r[k] * r[k]; }
  const stop = rr * relTol * relTol;
  let it = 0;
  for (; it < maxIter && rr > stop && rr > 0; it++) {
    applyH(p, Ap, nx, ny, a, T, act);
    let pAp = 0;
    for (let k = 0; k < n; k++) { if (fixed[k] || (act && !act[k])) Ap[k] = 0; pAp += p[k] * Ap[k]; }
    if (!(pAp > 0)) break;
    const alpha = rr / pAp;
    let rr2 = 0;
    for (let k = 0; k < n; k++) { u[k] += alpha * p[k]; r[k] -= alpha * Ap[k]; rr2 += r[k] * r[k]; }
    const beta = rr2 / rr;
    for (let k = 0; k < n; k++) p[k] = r[k] + beta * p[k];
    rr = rr2;
  }
  return it;
}

// points [{ x, y, v }] -> the nodes they fix on a grid of cell `cell` anchored at (xmin, ymax): Map(k -> mean)
function constraints(points, nx, ny, xmin, ymax, cell) {
  const sum = new Map(), cnt = new Map();
  for (const p of points) {
    const i = Math.round((p.x - xmin) / cell - 0.5), j = Math.round((ymax - p.y) / cell - 0.5);
    if (i < 0 || j < 0 || i >= nx || j >= ny || !Number.isFinite(p.v)) continue;
    const k = j * nx + i;
    sum.set(k, (sum.get(k) || 0) + p.v); cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  const out = new Map();
  for (const [k, s] of sum) out.set(k, s / cnt.get(k));
  return out;
}

// points: [{ x, y, v }]; the grid: { xmin, ymax, cell, nx, ny }; tension 0-1. -> { values: Float32Array (row 0 north), iterations, levels }
// active (optional, Uint8Array nx*ny): the finest grid's nodes to solve (the rest are left as interpolated from the coarser level and
// should be blanked): solving only near the samples skips the slow, unconstrained far field (sampleGrid.js has the figures).
// relTol 1e-5: on Lawyers' soil Au (log10) within 0.0008 of a 1e-8 solve.
export function minCurvatureGrid(points, { xmin, ymax, cell, nx, ny }, { tension = 0.25, maxIter = 3000, relTol = 1e-5, active = null } = {}) {
  const T = Math.min(1, Math.max(0, Number(tension) || 0));
  const mean = points.reduce((s, p) => s + p.v, 0) / Math.max(1, points.length);
  // the levels: halve the node count until the grid is small (about 32 nodes a side) or a level would drop below 8 nodes
  const levels = [];
  for (let f = 1; ; f *= 2) {
    const lx = Math.ceil(nx / f), ly = Math.ceil(ny / f);
    levels.push({ f, nx: lx, ny: ly });
    if ((lx <= 32 && ly <= 32) || lx < 16 || ly < 16) break;
  }
  let prev = null, iterations = 0;
  for (let L = levels.length - 1; L >= 0; L--) {
    const { f, nx: lx, ny: ly } = levels[L], c = cell * f;
    const u = new Float64Array(lx * ly), fixed = new Uint8Array(lx * ly);
    if (prev) {
      // bilinear from the coarser level (its nodes sit at the same origin with twice the spacing)
      for (let j = 0; j < ly; j++) for (let i = 0; i < lx; i++) {
        const x = (i + 0.5) / 2 - 0.5, y = (j + 0.5) / 2 - 0.5;
        const i0 = Math.max(0, Math.min(prev.nx - 1, Math.floor(x))), j0 = Math.max(0, Math.min(prev.ny - 1, Math.floor(y)));
        const i1 = Math.min(prev.nx - 1, i0 + 1), j1 = Math.min(prev.ny - 1, j0 + 1);
        const tx = Math.max(0, Math.min(1, x - i0)), ty = Math.max(0, Math.min(1, y - j0));
        u[j * lx + i] = prev.u[j0 * prev.nx + i0] * (1 - tx) * (1 - ty) + prev.u[j0 * prev.nx + i1] * tx * (1 - ty) + prev.u[j1 * prev.nx + i0] * (1 - tx) * ty + prev.u[j1 * prev.nx + i1] * tx * ty;
      }
    } else u.fill(mean);
    for (const [k, v] of constraints(points, lx, ly, xmin, ymax, c)) { u[k] = v; fixed[k] = 1; }
    iterations += solveCG(u, fixed, lx, ly, T, { maxIter: L === 0 ? maxIter : Math.ceil(maxIter / 2), relTol: L === 0 ? relTol : relTol * 100, act: L === 0 ? active : null });
    prev = { u, nx: lx, ny: ly };
  }
  return { values: Float32Array.from(prev.u), iterations, levels: levels.length };
}
