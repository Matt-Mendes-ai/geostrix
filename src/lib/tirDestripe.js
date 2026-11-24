// TASKS.csv #4052 (Matt, Macpass in plan: "quartz from aster doesn't look right") — ASTER thermal infrared (bands 10-14) is noisy line by line: each scan line carries its own small
// offset, and the quartz / carbonate / mafic indices (ratios of radiances that differ by a few per cent) show the lines and the speckle instead of geology. L1T is map-projected, so the
// scan lines run at the orbit's angle across the grid (about -20 degrees from the rows on Macpass), not along the rows. MEASURED on the Macpass scene of 2001-05-20 (the one the app
// offered first): the quartz index's line-to-line spread was 0.38 % against 0.04 % at other angles (a sharp peak at -19.5 degrees), the lines were nearly independent of each other
// (autocorrelation 0.16 at one line, none at ten: it is not a 10-detector pattern in that scene), and the bands' own line means were smooth (0.82), because the scene's texture, not the
// stripes, dominates a band. So the stripes are found where a ratio of bands shows them, and taken out as the part of each line's mean that its neighbours do not share.
//   findStripeAngle  the angle at which the line-to-line (white) part of the line means is largest, summed over the series given (ratios of bands, where the scene's texture cancels)
//   stripeAmplitude  that part's RMS at a given angle, relative to the local mean: the stripe level
//   destripe         each line's white offset taken out; the scene's own gradients and texture (shared by neighbouring lines) are kept
//   indexTrust       whether an index's spread stands clear of the noise and the stripes left in it
// Pure (no React, no three.js). A grid is a Float32Array of w * h values, NaN = no data; row 0 first.
const BOX = 8;        // half-width (pixels) of the box mean the scene's own smooth trend is taken as (the values are relative to it)
const MIN_PIX = 40;   // a line with fewer valid pixels than this (a corner of the slanted footprint) has no mean of its own
const HALF = 3;       // a line is compared with the three lines either side (excluding itself)

// NaN-aware box mean (radius r) by integral images
function boxMean(v, w, h, r) {
  const W = w + 1, S = new Float64Array(W * (h + 1)), C = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rc = 0;
    for (let x = 0; x < w; x++) {
      const val = v[y * w + x];
      if (Number.isFinite(val)) { rs += val; rc++; }
      S[(y + 1) * W + x + 1] = S[y * W + x + 1] + rs; C[(y + 1) * W + x + 1] = C[y * W + x + 1] + rc;
    }
  }
  const mean = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const c = C[y1 * W + x1] - C[y0 * W + x1] - C[y1 * W + x0] + C[y0 * W + x0];
      mean[y * w + x] = c ? (S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0]) / c : NaN;
    }
  }
  return mean;
}

// (v - trend) / trend: NaN where there is no data or no positive trend
function relative(v, w, h) {
  const mean = boxMean(v, w, h, BOX), rel = new Float32Array(w * h);
  for (let i = 0; i < rel.length; i++) { const m = mean[i], x = v[i]; rel[i] = Number.isFinite(x) && Number.isFinite(m) && m > 0 ? (x - m) / m : NaN; }
  return { rel, mean };
}

// which line each pixel is on when the scan lines run at `angleDeg` from the rows (0 = the rows themselves): the along-track position, rounded to a cell
function lines(w, h, angleDeg) {
  const a = (angleDeg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a), off = Math.ceil(w * Math.max(0, -sin)) + 1;
  const n = Math.ceil(w * Math.abs(sin) + h * cos) + 3, id = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) id[y * w + x] = Math.round(x * sin + y * cos) + off;
  return { id, n };
}

function lineMeans(rel, id, n, stepPix = 1) {
  const sum = new Float64Array(n), cnt = new Float64Array(n);
  for (let i = 0; i < rel.length; i += stepPix) { const r = rel[i]; if (Number.isFinite(r)) { sum[id[i]] += r; cnt[id[i]]++; } }
  const m = new Float64Array(n);
  const need = stepPix > 1 ? Math.max(8, MIN_PIX / stepPix) : MIN_PIX;
  for (let k = 0; k < n; k++) m[k] = cnt[k] >= need ? sum[k] / cnt[k] : NaN;
  return m;
}

// the white part of a profile: each line's mean minus the mean of its neighbours (NaN without any)
function white(m) {
  const out = new Float64Array(m.length).fill(NaN);
  for (let k = 0; k < m.length; k++) {
    if (!Number.isFinite(m[k])) continue;
    let s = 0, c = 0;
    for (let d = -HALF; d <= HALF; d++) { if (d && k + d >= 0 && k + d < m.length && Number.isFinite(m[k + d])) { s += m[k + d]; c++; } }
    if (c >= 2) out[k] = m[k] - s / c;
  }
  return out;
}
const rms = (a) => { let s = 0, n = 0; for (const x of a) if (Number.isFinite(x)) { s += x * x; n++; } return n ? Math.sqrt(s / n) : 0; };

// the stripe level of one series at a given angle: RMS of the white part of its line means, relative to its local mean
export function stripeAmplitude(v, w, h, angleDeg) {
  const { rel } = relative(v, w, h), { id, n } = lines(w, h, angleDeg);
  return rms(white(lineMeans(rel, id, n)));
}

// the angle (degrees from the rows, -45 to 45) at which the line-to-line part of the line means is largest, summed over `seriesList` (ratios of bands: the scene's own texture, shared by
// the bands, cancels in them). A pass at every 0.5 degree on every second pixel, then 0.1 degree around the best. `around`: the footprint's own angle (lib/asterScenes.js
// crossTrackAngle), when it is known: only `span` degrees either side of it are tried, so a small window need not find the angle alone. -> { angleDeg, amplitude }
export function findStripeAngle(seriesList, w, h, { around = null, span = 2 } = {}) {
  const list = (Array.isArray(seriesList) ? seriesList : [seriesList]).map((v) => relative(v, w, h).rel);
  const score = (ang, step) => { const { id, n } = lines(w, h, ang); let s = 0; for (const rel of list) { const a = rms(white(lineMeans(rel, id, n, step))); s += a * a; } return Math.sqrt(s / list.length); };
  let best = { angleDeg: 0, amplitude: -1 };
  const lo = Number.isFinite(around) ? Math.max(-45, around - span) : -45, hi = Number.isFinite(around) ? Math.min(45, around + span) : 45;
  for (let ang = lo; ang <= hi + 1e-9; ang += 0.5) { const a = score(ang, 2); if (a > best.amplitude) best = { angleDeg: ang, amplitude: a }; }
  const c = best.angleDeg;
  for (let ang = c - 0.5; ang <= c + 0.5 + 1e-9; ang += 0.1) { const a = score(ang, 1); if (a > best.amplitude) best = { angleDeg: Math.round(ang * 10) / 10, amplitude: a }; }
  return best;
}

// -> a destriped copy of `v`: each line's white offset (its mean, relative to the local mean, minus its neighbours') divided out. The part the neighbouring lines share is kept.
export function destripe(v, w, h, angleDeg) {
  const { rel } = relative(v, w, h), { id, n } = lines(w, h, angleDeg), wh = white(lineMeans(rel, id, n));
  const out = Float32Array.from(v);
  for (let i = 0; i < out.length; i++) { const k = wh[id[i]]; if (Number.isFinite(k) && Number.isFinite(out[i])) out[i] = out[i] / (1 + k); }
  return out;
}

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] : NaN);
const robustSd = (arr) => { const s = Float64Array.from(arr).sort(); const med = percentile(s, 0.5), dev = s.map((x) => Math.abs(x - med)).sort(); return 1.4826 * percentile(dev, 0.5); };

// whether an index stands clear of the noise and the stripes left in it. -> { ok, spread, noise, stripes, ratio, level (the mean of |index|) }
//   spread  the index's robust standard deviation (1.4826 x the median absolute deviation) over valid pixels
//   noise   the pixel-to-pixel noise: the robust spread of the difference of neighbours along a row, / sqrt 2
//   stripes the line-to-line stripe level left in the index (at `angleDeg`), in the index's own units
// The index is trusted when its spread is at least `minRatio` times the larger of the two.
export function indexTrust(values, w, h, angleDeg, { minRatio = 2 } = {}) {
  const ok = [], diff = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = values[y * w + x];
    if (!Number.isFinite(v)) continue;
    ok.push(v);
    if (x + 1 < w) { const u = values[y * w + x + 1]; if (Number.isFinite(u)) diff.push(u - v); }
  }
  if (ok.length < 1000) return { ok: false, spread: NaN, noise: NaN, stripes: NaN, ratio: NaN, level: NaN };
  const spread = robustSd(ok), noise = diff.length ? robustSd(diff) / Math.SQRT2 : 0;
  const level = ok.reduce((a, b) => a + Math.abs(b), 0) / ok.length;
  const stripes = stripeAmplitude(values, w, h, angleDeg) * level;
  const floor = Math.max(noise, stripes);
  const ratio = floor > 0 ? spread / floor : Infinity;
  return { ok: ratio >= minRatio, spread, noise, stripes, ratio, level };
}

// ---- the whole treatment of an ASTER thermal stack, for the fetch ----
// The ASTER TIR band centres (um) and the Planck constants for radiance in W m-2 sr-1 um-1: brightness temperature of an at-sensor radiance
const BAND_UM = [8.291, 8.634, 9.075, 10.657, 11.318];
export const brightnessTemperature = (radiance, um = BAND_UM[3]) => (radiance > 0 ? 1.43877e4 / (um * Math.log(1 + 1.19104e8 / (um ** 5 * radiance))) : NaN);
export const COLD_K = 273.15; // 0 degrees C

// a 3 x 3 mean (NaN-aware; a pixel with fewer than six valid neighbours is no data): the speckle of the bands is as wide as an index of a few per cent, and averages down by 3
export function mean3(v, w, h) {
  const o = new Float32Array(v.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!Number.isFinite(v[i])) { o[i] = NaN; continue; }
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy >= 0 && yy < h) { const q = v[yy * w + xx]; if (Number.isFinite(q)) { s += q; c++; } } }
    o[i] = c >= 6 ? s / c : NaN;
  }
  return o;
}

// bands: the five TIR radiance arrays (bands 10-14, NaN = no data) of one window. Finds the stripe angle from ratios of the bands, destripes every band in two passes (the second takes
// what the first's neighbour averages left), optionally takes the 3 x 3 mean, and leaves out the pixels colder than 0 degrees C at 10.7 um (snow, ice, cloud, cold water: L1T has no mask).
// -> { bands, angleDeg, stripesBefore, stripesAfter (the mean over the bands, relative to the local mean), cold (pixels left out), valid (pixels before that), smoothed }
export function treatTirBands(bands, w, h, { smooth = true, passes = 2, coldK = COLD_K, around = null } = {}) {
  const ratio = (a, b) => Float32Array.from(a, (x, i) => x / b[i]);
  const f = findStripeAngle([ratio(bands[1], bands[0]), ratio(bands[2], bands[3]), ratio(bands[4], bands[3]), Float32Array.from(bands[1], (x, i) => (x * x) / (bands[0][i] * bands[2][i]))], w, h, { around });
  const angleDeg = f.angleDeg, mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const stripesBefore = mean(bands.map((b) => stripeAmplitude(b, w, h, angleDeg)));
  let out = bands;
  for (let p = 0; p < passes; p++) out = out.map((b) => destripe(b, w, h, angleDeg));
  const stripesAfter = mean(out.map((b) => stripeAmplitude(b, w, h, angleDeg)));
  if (smooth) out = out.map((b) => mean3(b, w, h));
  let cold = 0, valid = 0;
  for (let i = 0; i < w * h; i++) {
    if (!Number.isFinite(out[3][i])) continue;
    valid++;
    if (brightnessTemperature(out[3][i]) < coldK) { cold++; for (const b of out) b[i] = NaN; }
  }
  return { bands: out, angleDeg, stripesBefore, stripesAfter, cold, valid, smoothed: smooth };
}
