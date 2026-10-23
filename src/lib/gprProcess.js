// TASKS.csv #616 — the usual first processing of a GPR radargram, each a plain function on a scan-major Float32Array
// (scan k's samples at k * nsamp ... k * nsamp + nsamp - 1). Every step returns a NEW array (the raw data stays as read),
// in the order they are normally applied: time zero, dewow, background removal, gain. Pure: no DOM.

// Drop the samples before time zero (sample s0 becomes the first): -> { data, nsamp }
export function cutTimeZero(data, nscans, nsamp, s0) {
  const k0 = Math.max(0, Math.min(nsamp - 2, Math.round(s0)));
  if (!k0) return { data: Float32Array.from(data), nsamp };
  const n = nsamp - k0, out = new Float32Array(nscans * n);
  for (let k = 0; k < nscans; k++) out.set(data.subarray(k * nsamp + k0, (k + 1) * nsamp), k * n);
  return { data: out, nsamp: n };
}

// The first break: the sample where the mean absolute trace first reaches `frac` of its peak (a suggestion for time zero)
export function firstBreak(data, nscans, nsamp, frac = 0.5) {
  const m = new Float64Array(nsamp);
  for (let k = 0; k < nscans; k++) for (let i = 0; i < nsamp; i++) m[i] += Math.abs(data[k * nsamp + i]);
  let peak = 0;
  for (let i = 0; i < nsamp; i++) if (m[i] > peak) peak = m[i];
  for (let i = 0; i < nsamp; i++) if (m[i] >= frac * peak) return i;
  return 0;
}

// Dewow: subtract each trace's running mean over `win` samples (removes the low-frequency "wow" of the early signal)
export function dewow(data, nscans, nsamp, win) {
  const w = Math.max(1, Math.round(win)), h = w >> 1, out = new Float32Array(data.length);
  for (let k = 0; k < nscans; k++) {
    const o = k * nsamp;
    let s = 0, lo = 0, hi = -1;
    for (let i = 0; i < nsamp; i++) {
      const a = Math.max(0, i - h), b = Math.min(nsamp - 1, i + h);
      while (hi < b) s += data[o + ++hi];
      while (lo < a) s -= data[o + lo++];
      out[o + i] = data[o + i] - s / (hi - lo + 1);
    }
  }
  return out;
}

// Background removal: subtract the mean trace — of the whole line (win 0) or of a running window of `win` scans.
// Takes out the flat horizontal banding (antenna ringing, the direct wave); also flat reflectors, as GPR users know.
export function removeBackground(data, nscans, nsamp, win = 0) {
  const out = new Float32Array(data.length);
  if (!(win > 0) || win >= nscans) {
    const mean = new Float64Array(nsamp);
    for (let k = 0; k < nscans; k++) for (let i = 0; i < nsamp; i++) mean[i] += data[k * nsamp + i];
    for (let i = 0; i < nsamp; i++) mean[i] /= nscans;
    for (let k = 0; k < nscans; k++) for (let i = 0; i < nsamp; i++) out[k * nsamp + i] = data[k * nsamp + i] - mean[i];
    return out;
  }
  const h = Math.round(win) >> 1, sum = new Float64Array(nsamp);
  let lo = 0, hi = -1;
  for (let k = 0; k < nscans; k++) {
    const a = Math.max(0, k - h), b = Math.min(nscans - 1, k + h);
    while (hi < b) { hi++; for (let i = 0; i < nsamp; i++) sum[i] += data[hi * nsamp + i]; }
    while (lo < a) { for (let i = 0; i < nsamp; i++) sum[i] -= data[lo * nsamp + i]; lo++; }
    const n = hi - lo + 1;
    for (let i = 0; i < nsamp; i++) out[k * nsamp + i] = data[k * nsamp + i] - sum[i] / n;
  }
  return out;
}

// AGC: each sample divided by the RMS amplitude in a `win`-sample window around it (equalizes weak deep and strong
// shallow signal; amplitudes are no longer comparable between depths)
export function agc(data, nscans, nsamp, win) {
  const w = Math.max(1, Math.round(win)), h = w >> 1, out = new Float32Array(data.length);
  for (let k = 0; k < nscans; k++) {
    const o = k * nsamp;
    let s = 0, lo = 0, hi = -1;
    for (let i = 0; i < nsamp; i++) {
      const a = Math.max(0, i - h), b = Math.min(nsamp - 1, i + h);
      while (hi < b) { hi++; s += data[o + hi] * data[o + hi]; }
      while (lo < a) { s -= data[o + lo] * data[o + lo]; lo++; }
      const rms = Math.sqrt(Math.max(0, s) / (hi - lo + 1));
      out[o + i] = rms > 0 ? data[o + i] / rms : 0;
    }
  }
  return out;
}

// Power gain: each sample times (its time / half the window's time) ^ p (1 at mid-window) — a gentle spreading-loss
// compensation that keeps relative amplitudes along a time line
export function powerGain(data, nscans, nsamp, p) {
  const out = new Float32Array(data.length), g = new Float32Array(nsamp);
  for (let i = 0; i < nsamp; i++) g[i] = Math.pow((i + 1) / (nsamp / 2), p);
  for (let k = 0; k < nscans; k++) for (let i = 0; i < nsamp; i++) out[k * nsamp + i] = data[k * nsamp + i] * g[i];
  return out;
}

// |amplitude| at the q-th quantile (from a sample of the data), for a symmetric colour clip
export function absQuantile(data, q = 0.98, maxSample = 200000) {
  const step = Math.max(1, Math.floor(data.length / maxSample)), a = [];
  for (let i = 0; i < data.length; i += step) a.push(Math.abs(data[i]));
  a.sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))] : 0;
}

// The radargram as RGBA pixels: one column per scan (averaged down to at most maxWidth columns), one row per sample.
// colours "grey" (white positive, black negative, the GPR convention) or "bwr" (blue - white - red).
export function radargramPixels(data, nscans, nsamp, { clip, colors = "grey", maxWidth = 4096 } = {}) {
  const c = clip > 0 ? clip : absQuantile(data) || 1;
  const width = Math.min(nscans, maxWidth), per = nscans / width, px = new Uint8ClampedArray(width * nsamp * 4);
  for (let x = 0; x < width; x++) {
    const k0 = Math.floor(x * per), k1 = Math.max(k0 + 1, Math.floor((x + 1) * per));
    for (let i = 0; i < nsamp; i++) {
      let s = 0;
      for (let k = k0; k < k1; k++) s += data[k * nsamp + i];
      const v = Math.max(-1, Math.min(1, s / (k1 - k0) / c));
      const o = (i * width + x) * 4;
      if (colors === "bwr") {
        if (v >= 0) { px[o] = 255; px[o + 1] = px[o + 2] = Math.round(255 * (1 - v)); }
        else { px[o + 2] = 255; px[o] = px[o + 1] = Math.round(255 * (1 + v)); }
      } else px[o] = px[o + 1] = px[o + 2] = Math.round(127.5 * (1 + v));
      px[o + 3] = 255;
    }
  }
  return { width, height: nsamp, pixels: px };
}
