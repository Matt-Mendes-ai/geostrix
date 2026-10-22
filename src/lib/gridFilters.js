import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
// TASKS.csv #373 — potential-field grid filters on a raster's kept values (#326): reduction to the pole,
// first vertical derivative, upward continuation (Fourier domain), and the tilt derivative and analytic
// signal built from those derivatives. These, not inversion, are how most mag grids are read day to day;
// tilt and analytic signal are the honest choice where remanence or a low inclination breaks RTP.
//
// Conventions (x east, y north, z DOWN, observation plane above the sources; FFT kernel e^(-i k.x), so
// d/dx <-> i kx):
//   upward continuation by h      exp(-|k| h)
//   vertical derivative (1VD)     |k|           (= -dT/dz_up: positive over a shallow positive source)
//   RTP (induced, field I, D)     1 / Theta^2,  Theta = sin I + i cos I (kx sin D + ky cos D) / |k|
//                                  (D measured from GRID north: the caller converts true -> grid)
// Checked in test/core.test.mjs against the closed-form field of a buried dipole computed in space (not
// against this file's own maths): RTP of a 60° field vs the same dipole's field at the pole, continuation
// vs the field 50 m higher, 1VD vs a finite difference of two heights.
//
// Edge handling: the grid's mean plane is removed, no-data nodes are filled from their neighbours, the
// grid is extended by mirroring to at least twice its size (next power of two) with a cosine taper on the
// extension, filtered, cropped back, and no-data nodes are put back as NaN.

// ---------------- FFT (iterative radix-2, in place) ----------------
function fft1(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function fft2(re, im, W, H, inverse) {
  const rr = new Float64Array(W), ri = new Float64Array(W);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) { rr[x] = re[o + x]; ri[x] = im[o + x]; }
    fft1(rr, ri, inverse);
    for (let x = 0; x < W; x++) { re[o + x] = rr[x]; im[o + x] = ri[x]; }
  }
  const cr = new Float64Array(H), ci = new Float64Array(H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) { cr[y] = re[y * W + x]; ci[y] = im[y * W + x]; }
    fft1(cr, ci, inverse);
    for (let y = 0; y < H; y++) { re[y * W + x] = cr[y]; im[y * W + x] = ci[y]; }
  }
}
const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };

// ---------------- preparation ----------------
// values: row 0 = NORTH (as raster.grid stores them). Returns the padded working grid, row 0 = SOUTH
// (so +y is north, matching ky), plus what is needed to undo it.
function prepare(values, nx, ny, dx, dy) {
  const mask = new Uint8Array(nx * ny);
  const v = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const src = values[(ny - 1 - j) * nx + i]; // flip to south-first
    const k = j * nx + i;
    if (Number.isFinite(src)) { v[k] = src; mask[k] = 1; } else v[k] = NaN;
  }
  // least-squares plane through the valid nodes (removed, added back where the filter keeps level)
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const z = v[j * nx + i]; if (!Number.isFinite(z)) continue;
    n++; sx += i; sy += j; sz += z; sxx += i * i; syy += j * j; sxy += i * j; sxz += i * z; syz += j * z;
  }
  if (n < 16) throw new Error(tr("Too few valid grid values to filter."));
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], b = [sz, sxz, syz];
  const plane = solve3(A, b) || [sz / n, 0, 0];
  for (let k = 0; k < v.length; k++) if (Number.isFinite(v[k])) v[k] -= plane[0] + plane[1] * (k % nx) + plane[2] * Math.floor(k / nx);
  // fill no-data by repeated neighbour averaging (gaps become smooth, level-0 patches)
  let holes = 0; for (let k = 0; k < v.length; k++) if (!mask[k]) holes++;
  for (let pass = 0; holes && pass < 4 * Math.max(nx, ny); pass++) {
    const next = v.slice();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (Number.isFinite(v[k])) continue;
      let s = 0, c = 0;
      if (i > 0 && Number.isFinite(v[k - 1])) { s += v[k - 1]; c++; }
      if (i < nx - 1 && Number.isFinite(v[k + 1])) { s += v[k + 1]; c++; }
      if (j > 0 && Number.isFinite(v[k - nx])) { s += v[k - nx]; c++; }
      if (j < ny - 1 && Number.isFinite(v[k + nx])) { s += v[k + nx]; c++; }
      if (c) { next[k] = s / c; holes--; }
    }
    v.set(next);
  }
  for (let k = 0; k < v.length; k++) if (!Number.isFinite(v[k])) v[k] = 0;
  // mirror-extend to W x H (>= 2x, power of two), cosine taper to 0 over the extension
  const W = nextPow2(2 * nx), H = nextPow2(2 * ny);
  const ox = Math.floor((W - nx) / 2), oy = Math.floor((H - ny) / 2);
  const re = new Float64Array(W * H);
  const reflect = (i, n) => { const p = 2 * n; i = ((i % p) + p) % p; return i < n ? i : p - 1 - i; };
  const taper = (i, n, o, N) => { const d = i < o ? o - i : i >= o + n ? i - (o + n - 1) : 0; const m = i < o ? o : N - o - n; return d === 0 ? 1 : 0.5 * (1 + Math.cos(Math.PI * Math.min(1, d / Math.max(1, m)))); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = reflect(x - ox, nx), j = reflect(y - oy, ny);
    re[y * W + x] = v[j * nx + i] * taper(x, nx, ox, W) * taper(y, ny, oy, H);
  }
  return { re, W, H, ox, oy, mask, plane, dx, dy };
}
function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

// apply a wavenumber operator op(kx, ky, k) -> [re, im]; return the cropped grid, row 0 = NORTH
function applyOperator(P, nx, ny, op, { keepLevel }) {
  const re = P.re.slice(), im = new Float64Array(re.length);
  fft2(re, im, P.W, P.H, false);
  for (let y = 0; y < P.H; y++) {
    const ky = (2 * Math.PI * (y <= P.H / 2 ? y : y - P.H)) / (P.H * P.dy);
    for (let x = 0; x < P.W; x++) {
      const kx = (2 * Math.PI * (x <= P.W / 2 ? x : x - P.W)) / (P.W * P.dx);
      const k = Math.hypot(kx, ky);
      const [or, oi] = op(kx, ky, k);
      const q = y * P.W + x, a = re[q], b = im[q];
      re[q] = a * or - b * oi; im[q] = a * oi + b * or;
    }
  }
  fft2(re, im, P.W, P.H, true);
  const out = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const kS = j * nx + i;
    let val = re[(j + P.oy) * P.W + (i + P.ox)];
    if (keepLevel) val += P.plane[0] + P.plane[1] * i + P.plane[2] * j;
    out[(ny - 1 - j) * nx + i] = P.mask[kS] ? val : NaN;
  }
  return out;
}
// horizontal gradients by central differences on a north-first grid (units per metre)
function horizontalGradient(g, nx, ny, dx, dy) {
  const gx = new Float64Array(nx * ny), gy = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    const l = i > 0 ? g[k - 1] : NaN, r = i < nx - 1 ? g[k + 1] : NaN;
    const up = j > 0 ? g[k - nx] : NaN, dn = j < ny - 1 ? g[k + nx] : NaN; // row 0 north: j-1 is north
    gx[k] = Number.isFinite(l) && Number.isFinite(r) ? (r - l) / (2 * dx) : Number.isFinite(r) ? (r - g[k]) / dx : Number.isFinite(l) ? (g[k] - l) / dx : NaN;
    gy[k] = Number.isFinite(up) && Number.isFinite(dn) ? (up - dn) / (2 * dy) : Number.isFinite(up) ? (up - g[k]) / dy : Number.isFinite(dn) ? (g[k] - dn) / dy : NaN;
  }
  return { gx, gy };
}

export const FILTERS = {
  rtp: { label: "Reduction to the pole (RTP)", unitsOut: (u) => u, needsField: true },
  vd1: { label: "First vertical derivative (1VD)", unitsOut: (u) => `${u}/m` },
  upward: { label: "Upward continuation", unitsOut: (u) => u, needsHeight: true },
  tilt: { label: "Tilt derivative", unitsOut: () => "degrees" },
  as: { label: "Analytic signal (3D)", unitsOut: (u) => `${u}/m` },
  tiltdepth: { label: "Tilt-depth (contact depths)", unitsOut: () => "m" }, // TASKS.csv #808
};

// grid: { nx, ny, dx, dy, values (north-first array) }. Returns { values: Float64Array (north-first, NaN =
// no data), warning? }.
export function applyGridFilter(grid, kind, opts = {}) {
  const { nx, ny, dx, dy, values } = grid;
  const P = prepare(values, nx, ny, dx, dy);
  const vd = () => applyOperator(P, nx, ny, (kx, ky, k) => [k, 0], { keepLevel: false });
  if (kind === "upward") {
    const h = Number(opts.height);
    if (!(h > 0)) throw new Error(tr("Enter the height to continue upward (m)."));
    return { values: applyOperator(P, nx, ny, (kx, ky, k) => [Math.exp(-k * h), 0], { keepLevel: true }) };
  }
  if (kind === "vd1") return { values: vd() };
  if (kind === "rtp") {
    const I = (Number(opts.inclination) * Math.PI) / 180, D = (Number(opts.declination) * Math.PI) / 180;
    if (!Number.isFinite(I) || !Number.isFinite(D)) throw new Error(tr("Enter the field inclination and (grid) declination."));
    const warning = Math.abs(opts.inclination) < 20
      ? tr("At an inclination of {inclination}° RTP is unstable (it amplifies noise along the declination); the tilt derivative or analytic signal is the safer product here.", { inclination: opts.inclination }) : null;
    const sI = Math.sin(I), cI = Math.cos(I), sD = Math.sin(D), cD = Math.cos(D);
    const out = applyOperator(P, nx, ny, (kx, ky, k) => {
      if (k === 0) return [1 / (sI * sI), 0];
      const thr = sI, ti = (cI * (kx * sD + ky * cD)) / k; // Theta
      const t2r = thr * thr - ti * ti, t2i = 2 * thr * ti; // Theta^2
      const d = t2r * t2r + t2i * t2i;
      return d < 1e-6 ? [0, 0] : [t2r / d, -t2i / d]; // 1 / Theta^2 (zeroed where it would blow up)
    }, { keepLevel: false });
    return { values: out, warning };
  }
  if (kind === "tilt" || kind === "as") {
    const z = vd();
    // horizontal gradients of the DETRENDED grid (a regional slope would otherwise bias every tilt value)
    const detrended = applyOperator(P, nx, ny, () => [1, 0], { keepLevel: false });
    const { gx, gy } = horizontalGradient(detrended, nx, ny, dx, dy);
    const out = new Float64Array(nx * ny);
    for (let k = 0; k < out.length; k++) {
      const h = Math.hypot(gx[k], gy[k]);
      out[k] = !Number.isFinite(z[k]) || !Number.isFinite(h) ? NaN : kind === "tilt" ? (Math.atan2(z[k], h) * 180) / Math.PI : Math.hypot(h, z[k]);
    }
    return { values: out };
  }
  throw new Error(tr("Unknown filter \"{kind}\".", { kind }));
}

// ---------------- TASKS.csv #808 — depth estimates (from the #805 pyGMI review; written from the papers) ----------------

// Tilt-depth (Salem, Williams, Fairhead, Ravat & Smith 2007, The Leading Edge 26, 1502): over a vertical contact the
// tilt of the RTP field is theta = atan(h / z) with h the horizontal distance from the contact, so along the zero
// contour d(theta)/dh = 1 / z: the depth to the contact's top is 1 / |grad theta| (theta in radians). Equivalently
// half the distance between the -45 and +45 degree contours. Returns the depth at every node next to a sign change of
// the tilt (NaN elsewhere): drawn as a raster it traces the contacts coloured by depth. Depths beyond half the grid's
// width are dropped (a flat tilt there says "no contact", not "a deep one"). Meaningful on an RTP (or pole) grid.
// Checked on a synthetic vertical contact at 60 m: found on every row, ~9 % shallow (the mean plane is removed before
// the gradients, as for the tilt itself); the same plane removal can add a few weak crossings far from any contact.
export function tiltDepth(grid) {
  const { nx, ny, dx, dy } = grid;
  const t = applyGridFilter(grid, "tilt").values; // degrees, north-first
  const th = new Float64Array(t.length);
  for (let k = 0; k < t.length; k++) th[k] = (t[k] * Math.PI) / 180;
  const { gx, gy } = horizontalGradient(th, nx, ny, dx, dy);
  const out = new Float64Array(nx * ny).fill(NaN);
  const maxDepth = 0.5 * Math.min(nx * dx, ny * dy);
  const depths = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, a = th[k];
    if (!Number.isFinite(a)) continue;
    // a zero crossing between this node and its east or south neighbour: keep the node nearer zero
    let crossing = false;
    for (const q of [i < nx - 1 ? k + 1 : -1, j < ny - 1 ? k + nx : -1, i > 0 ? k - 1 : -1, j > 0 ? k - nx : -1]) {
      if (q < 0 || !Number.isFinite(th[q])) continue;
      if ((a <= 0) !== (th[q] <= 0) && Math.abs(a) <= Math.abs(th[q])) { crossing = true; break; }
    }
    if (!crossing) continue;
    const g = Math.hypot(gx[k], gy[k]);
    const d = g > 0 ? 1 / g : Infinity;
    if (d > 0 && d <= maxDepth) { out[k] = d; depths.push(d); }
  }
  depths.sort((x, y) => x - y);
  return { values: out, count: depths.length, median: depths.length ? depths[depths.length >> 1] : null };
}

// Radially averaged power spectrum (Spector & Grant 1970, Geophysics 35, 293): for an ensemble of sources whose tops
// sit at depth h below the observation plane, ln P(k) falls as -2 h k (k in radians per metre), so h = -slope / 2.
// Returned per ring of width dk from the first ring to 90 % of Nyquist: { k, lnP, n }.
export function radialSpectrum(grid) {
  const { nx, ny, dx, dy, values } = grid;
  const P = prepare(values, nx, ny, dx, dy);
  const re = P.re.slice(), im = new Float64Array(re.length);
  fft2(re, im, P.W, P.H, false);
  const dk = 2 * Math.PI / Math.min(P.W * P.dx, P.H * P.dy);
  const kmax = 0.9 * Math.min(Math.PI / P.dx, Math.PI / P.dy);
  const nb = Math.max(4, Math.floor(kmax / dk));
  const sum = new Float64Array(nb), cnt = new Uint32Array(nb);
  for (let y = 0; y < P.H; y++) {
    const ky = (2 * Math.PI * (y <= P.H / 2 ? y : y - P.H)) / (P.H * P.dy);
    for (let x = 0; x < P.W; x++) {
      const kx = (2 * Math.PI * (x <= P.W / 2 ? x : x - P.W)) / (P.W * P.dx);
      const b = Math.round(Math.hypot(kx, ky) / dk);
      if (b < 1 || b >= nb) continue;
      const q = y * P.W + x;
      sum[b] += re[q] * re[q] + im[q] * im[q]; cnt[b]++;
    }
  }
  const k = [], lnP = [], n = [];
  for (let b = 1; b < nb; b++) if (cnt[b] && sum[b] > 0) { k.push(b * dk); lnP.push(Math.log(sum[b] / cnt[b])); n.push(cnt[b]); }
  return { k, lnP, n };
}

const lineFit = (x, y, a, b) => { // least squares over [a, b)
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = a; i < b; i++) { n++; sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const d = n * sxx - sx * sx;
  if (n < 2 || !d) return null;
  const m = (n * sxy - sx * sy) / d, c = (sy - m * sx) / n;
  let sse = 0; for (let i = a; i < b; i++) sse += (y[i] - (c + m * x[i])) ** 2;
  return { m, c, sse };
};
// Two straight segments on ln P(k): the low-wavenumber (deep) one steeper than the shallow one, both falling. The
// break minimizes the total squared misfit; the tail within e^4 of the noise floor is left out. Depths
// are below the OBSERVATION level (subtract the sensor height for depth below ground). Returns
// { deep: { h, c, k0, k1 }, shallow: { ... } | null } or null when the spectrum does not fall.
export function fitSpectrumDepths(spec) {
  const { k, lnP } = spec;
  // the noise floor: the median of the last quarter; the fit stops where the spectrum comes within e^4 of it (the knee into the floor included) (white
  // noise, or round-off, flattens the tail and would otherwise read as a "shallow" source)
  const tail = lnP.slice(Math.floor(lnP.length * 0.75)).sort((a, b) => a - b);
  const floor = tail[tail.length >> 1];
  let end = lnP.length;
  while (end > 12 && lnP[end - 1] < floor + 4) end--;
  let best = null;
  for (let b = 6; b <= end - 6; b++) { // at least 6 rings per segment
    const d = lineFit(k, lnP, 0, b), s = lineFit(k, lnP, b, end);
    if (!d || !s || !(d.m < 0) || !(s.m < 0) || !(d.m < s.m)) continue;
    if (!best || d.sse + s.sse < best.sse) best = { sse: d.sse + s.sse, d, s, b };
  }
  const seg = (f, a, b) => ({ h: -f.m / 2, c: f.c, k0: k[a], k1: k[b - 1] });
  const one = lineFit(k, lnP, 0, end);
  // a second segment only when it earns its place: well under half the single line's misfit and slopes at least 1.5x
  // apart (a single ensemble otherwise grows a spurious "shallow" one from the noise tail: 150 m data gave 151 + 60 m)
  if (best && (!one || (best.sse < 0.4 * one.sse && best.d.m < 1.5 * best.s.m))) return { deep: seg(best.d, 0, best.b), shallow: seg(best.s, best.b, end) };
  return one && one.m < 0 ? { deep: seg(one, 0, end), shallow: null } : null;
}

// Matched filter (Spector & Grant 1970; Syberg 1972; Phillips 2001): split the grid by the two fitted ensembles. Each
// component keeps the share of the amplitude its ensemble's power predicts at that wavenumber:
// w_i(k) = sqrt(P_i(k) / (P_deep(k) + P_shallow(k))), P_i(k) = exp(c_i - 2 h_i k). The two add back up to ~the input.
export function matchedFilter(grid, fit) {
  if (!fit?.deep || !fit?.shallow) throw new Error(tr("The spectrum has only one depth segment: there is nothing to separate."));
  const { nx, ny, dx, dy, values } = grid;
  const P = prepare(values, nx, ny, dx, dy);
  const pw = (s, k) => Math.exp(s.c - 2 * s.h * k);
  const w = (which) => (kx, ky, k) => { const a = pw(fit.deep, k), b = pw(fit.shallow, k); return [Math.sqrt((which === "deep" ? a : b) / (a + b)), 0]; };
  return { deep: applyOperator(P, nx, ny, w("deep"), { keepLevel: true }), shallow: applyOperator(P, nx, ny, w("shallow"), { keepLevel: false }) };
}
