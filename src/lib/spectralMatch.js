// TASKS.csv #2003 (in part) — the matching algorithms of a hyperspectral cube, pure: the spectral angle mapper (Kruse et al. 1993), the matched
// filter (the target's score along the background's whitened direction) and the RX anomaly detector (Mahalanobis distance from the background).
// A cube is read as `pixels`: an array of Float32Array / number[] spectra of equal length (bands), NaN or null for a masked pixel. No dependencies;
// the covariance is regularised by a small ridge so a rank-deficient cube (fewer pixels than bands, a constant band) still inverts.

const finite = (s) => { for (let k = 0; k < s.length; k++) if (!Number.isFinite(s[k])) return false; return true; };

// the angle (radians, 0 = the same shape whatever the brightness) between a pixel spectrum and a reference; NaN when either has no length
export function spectralAngle(s, ref) {
  let dot = 0, a = 0, b = 0;
  for (let k = 0; k < s.length; k++) { dot += s[k] * ref[k]; a += s[k] * s[k]; b += ref[k] * ref[k]; }
  if (!(a > 0) || !(b > 0)) return NaN;
  return Math.acos(Math.min(1, Math.max(-1, dot / Math.sqrt(a * b))));
}
// per pixel angle to the reference (NaN for a masked pixel) -> Float32Array
export function sam(pixels, ref) {
  const out = new Float32Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) out[i] = pixels[i] && finite(pixels[i]) ? spectralAngle(pixels[i], ref) : NaN;
  return out;
}

// mean and covariance of the finite pixels (every `step`-th, at most `max` of them), and the covariance's inverse (ridge = ridgeFrac x the mean variance)
export function background(pixels, { max = 20000, ridgeFrac = 1e-6 } = {}) {
  const used = [];
  const step = Math.max(1, Math.floor(pixels.length / max));
  for (let i = 0; i < pixels.length; i += step) if (pixels[i] && finite(pixels[i])) used.push(pixels[i]);
  const n = used.length, B = used[0]?.length || 0;
  if (n < 2 || !B) return null;
  const mean = new Float64Array(B);
  for (const s of used) for (let k = 0; k < B; k++) mean[k] += s[k] / n;
  const cov = Array.from({ length: B }, () => new Float64Array(B));
  for (const s of used) for (let a = 0; a < B; a++) { const da = s[a] - mean[a]; for (let b = a; b < B; b++) cov[a][b] += (da * (s[b] - mean[b])) / (n - 1); }
  let tr = 0;
  for (let a = 0; a < B; a++) { tr += cov[a][a]; for (let b = 0; b < a; b++) cov[a][b] = cov[b][a]; }
  const ridge = Math.max(1e-12, (ridgeFrac * tr) / B);
  for (let a = 0; a < B; a++) cov[a][a] += ridge;
  return { mean, inv: invert(cov), n, bands: B };
}
// Gauss-Jordan inverse of a small square matrix (rows: Float64Array[]), partial pivoting
function invert(m) {
  const n = m.length, a = m.map((r, i) => { const x = new Float64Array(2 * n); x.set(r); x[n + i] = 1; return x; });
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    const d = a[c][c] || 1e-300;
    for (let k = 0; k < 2 * n; k++) a[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; if (f) for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map((r) => r.slice(n));
}
const mul = (inv, v) => { const n = v.length, o = new Float64Array(n); for (let a = 0; a < n; a++) { let s = 0; for (let b = 0; b < n; b++) s += inv[a][b] * v[b]; o[a] = s; } return o; };

// RX: (x - mean)' Sigma^-1 (x - mean) per pixel (NaN for a masked one); large = unlike the background
export function rx(pixels, bg = background(pixels)) {
  const out = new Float32Array(pixels.length).fill(NaN);
  if (!bg) return out;
  const d = new Float64Array(bg.bands);
  for (let i = 0; i < pixels.length; i++) {
    const s = pixels[i];
    if (!s || !finite(s)) continue;
    for (let k = 0; k < bg.bands; k++) d[k] = s[k] - bg.mean[k];
    const w = mul(bg.inv, d);
    let q = 0; for (let k = 0; k < bg.bands; k++) q += d[k] * w[k];
    out[i] = q;
  }
  return out;
}
// matched filter: (x - mean)' Sigma^-1 (t - mean) / (t - mean)' Sigma^-1 (t - mean): 0 for the background, 1 for the target, per pixel
export function matchedFilter(pixels, target, bg = background(pixels)) {
  const out = new Float32Array(pixels.length).fill(NaN);
  if (!bg) return out;
  const t = new Float64Array(bg.bands);
  for (let k = 0; k < bg.bands; k++) t[k] = target[k] - bg.mean[k];
  const w = mul(bg.inv, t);
  let norm = 0; for (let k = 0; k < bg.bands; k++) norm += t[k] * w[k];
  if (!(norm > 0)) return out;
  for (let i = 0; i < pixels.length; i++) {
    const s = pixels[i];
    if (!s || !finite(s)) continue;
    let q = 0; for (let k = 0; k < bg.bands; k++) q += (s[k] - bg.mean[k]) * w[k];
    out[i] = q / norm;
  }
  return out;
}

// ---- TASKS.csv #2003 (UI step) — a reference spectrum from pasted text, and the three maps on a cube read as one array per band ----
// parseSpectrum: lines of 'wavelength reflectance' (comma, tab, semicolon or space; a header line is skipped); wavelengths in micrometres
// (largest under 10) become nanometres. -> { wl: number[] (ascending, nm), value: number[] }, or null when fewer than 3 pairs
export function parseSpectrum(text) {
  const wl = [], value = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const p = line.trim().split(/[\s,;]+/).map(Number);
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) { wl.push(p[0]); value.push(p[1]); }
  }
  if (wl.length < 3) return null;
  let top = -Infinity; for (const w of wl) if (w > top) top = w; /* no Math.max(...spread): #371 */
  const um = top < 10, idx = wl.map((_, i) => i).sort((a, b) => wl[a] - wl[b]);
  return { wl: idx.map((i) => wl[i] * (um ? 1000 : 1)), value: idx.map((i) => value[i]) };
}
// the spectrum at the cube's band wavelengths by linear interpolation: NaN outside its own range. -> { value: Float64Array, covered: share of bands inside }
export function resampleSpectrum(ref, wl) {
  const out = new Float64Array(wl.length).fill(NaN);
  let inside = 0;
  for (let k = 0; k < wl.length; k++) {
    const w = wl[k];
    if (w < ref.wl[0] || w > ref.wl[ref.wl.length - 1]) continue;
    let j = 0;
    while (j < ref.wl.length - 2 && ref.wl[j + 1] < w) j++;
    const t = (w - ref.wl[j]) / (ref.wl[j + 1] - ref.wl[j] || 1);
    out[k] = ref.value[j] + t * (ref.value[j + 1] - ref.value[j]);
    inside++;
  }
  return { value: out, covered: wl.length ? inside / wl.length : 0 };
}
// bands: one array per band (same length = the pixels), kind 'sam' (the angle in DEGREES, low = like the reference) | 'mf' (matched filter, 0 background to 1
// target) | 'rx' (anomaly, high = unlike the background); ref: the reference at the bands (sam / mf). A pixel with a non-positive or masked value in any
// band is masked (NaN). -> { map: Float32Array, valid }
export function matchMap(bands, kind, ref = null, { isNoData = () => false } = {}) {
  const m = bands.length, n = bands[0]?.length || 0;
  const pixels = new Array(n);
  let valid = 0;
  for (let p = 0; p < n; p++) {
    const s = new Float32Array(m);
    let ok = true;
    for (let b = 0; b < m; b++) { const v = bands[b][p]; if (!Number.isFinite(v) || isNoData(v)) { ok = false; break; } s[b] = v; }
    if (ok) { pixels[p] = s; valid++; } else pixels[p] = null;
  }
  let map;
  if (kind === "sam") map = sam(pixels, ref).map((a) => a * (180 / Math.PI));
  else if (kind === "mf") map = matchedFilter(pixels, ref);
  else map = rx(pixels);
  return { map: map instanceof Float32Array ? map : Float32Array.from(map), valid };
}
