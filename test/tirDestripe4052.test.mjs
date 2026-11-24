// TASKS.csv #4052 — destriping ASTER TIR: a made-up scene (smooth ground with texture) in five bands, each with its own random offset on every scan line at a known angle, plus pixel noise,
// shaped on what the Macpass scene of 2001-05-20 measured (line-to-line level 0.3 % per band, 0.4 % in the quartz index, noise 0.66 % in it; lines independent of each other).
import test from "node:test";
import assert from "node:assert/strict";
import { findStripeAngle, stripeAmplitude, destripe, indexTrust, treatTirBands, mean3, brightnessTemperature } from "../src/lib/tirDestripe.js";

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

// ground: a smooth gradient and two blobs; texture shared by the five bands (a real scene: the bands see the same ground), band-specific tiny emissivity differences
function ground(w, h, base) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = base * (1 + 0.10 * (x / w) - 0.06 * (y / h) + 0.05 * Math.exp(-(((x - 120) ** 2 + (y - 200) ** 2) / 2500)) - 0.04 * Math.exp(-(((x - 260) ** 2 + (y - 90) ** 2) / 1800)));
  return g;
}
function bands({ w = 320, h = 320, angleDeg = -19.5, lineSd = 0.0035, noise = 0.006, base = 10, seed = 5, footprint = false, stripes = true } = {}) {
  const r = rng(seed), a = (angleDeg * Math.PI) / 180, sin = Math.sin(a), cos = Math.cos(a), off = Math.ceil(w * Math.max(0, -sin)) + 1;
  const g = ground(w, h, base), nLines = Math.ceil(w * Math.abs(sin) + h * cos) + 3;
  const lineOff = Array.from({ length: 5 }, () => Float64Array.from({ length: nLines }, () => (stripes ? lineSd * gauss(r) : 0)));
  const out = [], clean = [];
  for (let k = 0; k < 5; k++) {
    const b = new Float32Array(w * h), c = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const line = Math.round(x * sin + y * cos) + off, s = g[y * w + x] * (1 + 0.01 * k * ((x - w / 2) / w)); // a little band-to-band difference, smooth
      c[y * w + x] = s; b[y * w + x] = s * (1 + lineOff[k][line]) + base * noise * gauss(r);
    }
    if (footprint) for (let i = 0; i < b.length; i++) { const x = i % w, y = (i / w) | 0; if (x + 0.3 * y > w - 10 || x + 0.3 * y < 25) { b[i] = NaN; c[i] = NaN; } }
    out.push(b); clean.push(c);
  }
  return { bands: out, clean, w, h };
}
const ratio = (a, b) => Float32Array.from(a, (x, i) => x / b[i]);
const quartz = (b) => Float32Array.from(b[1], (x, i) => (x * x) / (b[0][i] * b[2][i]));
const rmsDiff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { s += (a[i] - b[i]) ** 2; n++; } return Math.sqrt(s / n); };

test("the stripe angle is found from ratios of the bands, at -19.5, 6 and 31 degrees", () => {
  for (const ang of [-19.5, 6, 31]) {
    const { bands: B, w, h } = bands({ angleDeg: ang });
    const f = findStripeAngle([ratio(B[1], B[0]), ratio(B[2], B[3]), ratio(B[4], B[3]), quartz(B)], w, h);
    assert.ok(Math.abs(f.angleDeg - ang) <= 0.5, `angle ${ang}: found ${f.angleDeg}`);
    assert.ok(f.amplitude > 0.002, `level ${f.amplitude}`);
  }
});

test("destriping: one pass takes the stripes down by more than half, two passes by more than 80 %, and the ground is left", () => {
  const { bands: B, clean, w, h } = bands();
  const before = stripeAmplitude(B[1], w, h, -19.5);
  const one = destripe(B[1], w, h, -19.5), two = destripe(one, w, h, -19.5);
  const a1 = stripeAmplitude(one, w, h, -19.5), a2 = stripeAmplitude(two, w, h, -19.5);
  assert.ok(before > 0.0025, `before ${before}`);
  assert.ok(a1 < before * 0.5, `one pass ${a1} against ${before}`);
  assert.ok(a2 < before * 0.2, `two passes ${a2} against ${before}`);
  // the smooth ground is kept: the destriped band is no further from the clean ground than the striped one is
  assert.ok(rmsDiff(two, clean[1]) <= rmsDiff(B[1], clean[1]) * 1.001, "the ground is not damaged");
  assert.ok(Math.abs(stripeAmplitude(clean[1], w, h, -19.5)) < 0.0008, "the clean ground itself shows no stripes");
});

test("a scene with no stripes is left as it is", () => {
  const { bands: B, w, h } = bands({ stripes: false, noise: 0.002 });
  const out = destripe(B[1], w, h, -19.5);
  let worst = 0; for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - B[1][i]) / B[1][i]);
  assert.ok(worst < 0.01, `largest change ${worst}`);
});

test("no data (the footprint's slanted edge) is skipped and stays no data", () => {
  const { bands: B, w, h } = bands({ footprint: true });
  const f = findStripeAngle([ratio(B[1], B[0]), ratio(B[4], B[3])], w, h);
  assert.ok(Math.abs(f.angleDeg + 19.5) <= 0.5, `angle ${f.angleDeg}`);
  const out = destripe(B[1], w, h, f.angleDeg);
  for (let i = 0; i < B[1].length; i++) assert.equal(Number.isNaN(out[i]), Number.isNaN(B[1][i]));
});

test("the quartz index: striped it shows its stripes; after the treatment the stripe level is under a quarter and its noise falls with the 3 x 3 mean", () => {
  const { bands: B, w, h } = bands();
  const t = treatTirBands(B.map((b) => Float32Array.from(b)), w, h, { smooth: true, coldK: 0 });
  assert.ok(Math.abs(t.angleDeg + 19.5) <= 0.5);
  assert.ok(t.stripesAfter < t.stripesBefore * 0.25, `bands: ${t.stripesBefore} -> ${t.stripesAfter}`);
  const raw = indexTrust(quartz(B), w, h, -19.5), fixed = indexTrust(quartz(t.bands), w, h, -19.5);
  assert.ok(fixed.stripes < raw.stripes * 0.25, `index stripes ${raw.stripes} -> ${fixed.stripes}`);
  assert.ok(fixed.noise < raw.noise * 0.5, `noise ${raw.noise} -> ${fixed.noise}`);
  assert.ok(fixed.ratio > raw.ratio * 1.5, "the index stands further clear of its floor");
  assert.equal(t.smoothed, true);
});

test("pixels colder than 0 degrees C at 10.7 um (snow, ice, cloud, cold water) are left out of every band", () => {
  const w = 120, h = 120, n = w * h;
  const planck = (T, um) => 1.19104e8 / (um ** 5 * (Math.exp(1.43877e4 / (um * T)) - 1));
  const um = [8.291, 8.634, 9.075, 10.657, 11.318];
  const B = um.map((u) => Float32Array.from({ length: n }, (_, i) => planck((i % w) < 40 ? 262 : 292, u))); // the left third is cold
  assert.ok(Math.abs(brightnessTemperature(planck(300, 10.657), 10.657) - 300) < 0.01, "the Planck inversion");
  const t = treatTirBands(B, w, h, { smooth: false, passes: 0 });
  assert.equal(t.cold, 40 * h, "every pixel of the cold third");
  assert.equal(t.valid, n);
  for (const b of t.bands) { assert.ok(Number.isNaN(b[5])); assert.ok(Number.isFinite(b[100])); }
});

test("mean3 averages a pixel with its eight neighbours, and a corner with too few is no data", () => {
  const v = new Float32Array(25).fill(1); v[12] = 10;
  const m = mean3(v, 5, 5);
  assert.ok(Math.abs(m[12] - 2) < 1e-6, "(10 + 8 x 1) / 9");
  assert.ok(Number.isNaN(mean3(Float32Array.from([1, NaN, NaN, NaN]), 2, 2)[0]), "fewer than six valid pixels");
});

test("a flat index with only noise is not trusted; a wide one is", () => {
  const w = 300, h = 300, r = rng(11), flat = new Float32Array(w * h), wide = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { flat[y * w + x] = 1 + 0.004 * gauss(r); wide[y * w + x] = 1 + 0.05 * Math.sin(x / 40) * Math.cos(y / 55) + 0.004 * gauss(r); }
  assert.equal(indexTrust(flat, w, h, 0).ok, false, "noise alone");
  assert.equal(indexTrust(wide, w, h, 0).ok, true, "a real pattern well above the noise");
  assert.equal(indexTrust(new Float32Array(100).fill(NaN), 10, 10, 0).ok, false, "too few pixels to say");
});
