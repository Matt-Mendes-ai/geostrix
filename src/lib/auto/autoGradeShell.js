// TASKS.csv #3898 — "Build it for me" for the grade shell: the cut-off from the grade distribution itself, and the shell's cell size from
// the drilling. The user still names the element; GeoStrix never assumes a deposit style or a "usual" cut-off for a metal.
//
// The cut-off is where the grades split into a low background and a higher population, on the logarithm of the grades (assays are
// skewed). First the threshold that leaves the two groups most apart (Otsu's method: the largest between-group variance); then, on the
// smoothed histogram, the lowest point between the peaks either side of it. When that valley drops below CLEAR_VALLEY of the smaller peak,
// the grades really are two groups and the cut-off sits in the valley (the natural break, even for a small high-grade group, where Otsu
// alone leans into the background). Otherwise there is no valley (one population, or a flat spread): the Otsu threshold is still given,
// with a note that it is the best split, not a natural one, rather than drawn as a confident shell.
//
// input: { collars, samples: [{ hole_id, x, y, z, from, to, value }], unit: "g/t" | "%" | "ppm" ... (shown with the cut-off) }
// -> values: { cutoff, cellSize, shareAbove (length-weighted, 0-1), holesAbove }
import { thin, fin, niceNumber, twoFigures, metres, siteSpacing, holesOf, autoResult, because, say } from "./autoCommon.js";
import { fmtNum } from "../i18n.js";

export const CLEAR_VALLEY = 0.5;
const BINS = 64;

// -> { cut (a log10 grade), clear (a valley between two peaks), valley (its height / the smaller peak's) } | null
export function bestSplit(logs, weights) {
  let lo = Infinity, hi = -Infinity;
  for (const v of logs) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > lo)) return null;
  const w = new Float64Array(BINS), s = new Float64Array(BINS), width = (hi - lo) / BINS;
  let W = 0, S = 0;
  logs.forEach((v, i) => { const b = Math.min(BINS - 1, Math.floor((v - lo) / width)), k = weights[i]; w[b] += k; s[b] += k * v; W += k; S += k * v; });
  let w0 = 0, s0 = 0, best = -1, cutBin = -1;
  for (let b = 0; b < BINS - 1; b++) {
    w0 += w[b]; s0 += s[b];
    const w1 = W - w0;
    if (w0 <= 0 || w1 <= 0) continue;
    const between = (w0 * w1 / (W * W)) * (s0 / w0 - (S - s0) / w1) ** 2;
    if (between > best) { best = between; cutBin = b; }
  }
  if (cutBin < 0) return null;
  // the histogram smoothed over five bins, its peak on each side of the Otsu threshold, and the lowest point between them
  const h = Array.from(w, (_, b) => { let t = 0, n = 0; for (let k = Math.max(0, b - 2); k <= Math.min(BINS - 1, b + 2); k++) { t += w[k]; n++; } return t / n; });
  // a peak is a local maximum (a tail falling away from the other side's peak is not one); none on a side: that side's highest bin
  const isPeak = (b) => (b === 0 || h[b] >= h[b - 1]) && (b === BINS - 1 || h[b] >= h[b + 1]);
  const peakIn = (from, to) => { let p = -1; for (let b = from; b <= to; b++) if (isPeak(b) && (p < 0 || h[b] > h[p])) p = b; if (p < 0) { p = from; for (let b = from; b <= to; b++) if (h[b] > h[p]) p = b; } return p; };
  const p0 = peakIn(0, cutBin), p1 = peakIn(cutBin + 1, BINS - 1);
  let v = p0;
  for (let b = p0; b <= p1; b++) if (h[b] < h[v]) v = b;
  const valley = h[v] / Math.min(h[p0], h[p1]);
  const clear = valley < CLEAR_VALLEY && v > p0 && v < p1;
  return { cut: lo + (clear ? v + 0.5 : cutBin + 1) * width, clear, valley };
}

export function autoGradeShell({ collars = [], samples = [], unit = "" } = {}) {
  const pts = thin(samples.filter((s) => fin(s.value) && s.value > 0));
  const holes = holesOf(pts), problems = [], notes = [];
  if (holes < 3) problems.push(holes === 1 ? say("Grades in only one hole: a grade shell needs grades in three or more holes.") : say("Grades in only {n} holes: a grade shell needs grades in three or more holes.", { n: holes }));
  if (pts.length < 20) problems.push(say("Only {n} samples with a grade above zero: too few to see where the grades split.", { n: pts.length }));
  if (problems.length) return autoResult(null, [], notes, problems);

  const len = (s) => (fin(s.to) && fin(s.from) && s.to > s.from ? s.to - s.from : 1); // length-weighted, as a run of samples is reported
  const split = bestSplit(pts.map((s) => Math.log10(s.value)), pts.map(len));
  if (!split) return autoResult(null, [], notes, [say("All the grades are the same: there is nothing to separate into a shell.")]);
  const cutoff = twoFigures(10 ** split.cut);
  let wAll = 0, wAbove = 0;
  const above = new Set();
  for (const s of pts) { const k = len(s); wAll += k; if (s.value >= cutoff) { wAbove += k; above.add(s.hole_id); } }
  const shareAbove = wAbove / wAll, holesAbove = above.size;
  if (holesAbove < 2) problems.push(say("Only one hole has grades above the cut-off ({c}): a shell around one hole would be a guess.", { c: `${fmtNum(cutoff)} ${unit}`.trim() }));
  if (problems.length) return autoResult(null, [], notes, problems);

  const reasons = [];
  reasons.push(because("cutoff", "Cut-off {c}: where these grades split best into a low background and a higher group ({p} % of the sampled length is above it, in {h} holes).",
    { c: `${fmtNum(cutoff)} ${unit}`.trim(), p: fmtNum(100 * shareAbove, { maximumFractionDigits: shareAbove < 0.1 ? 1 : 0 }), h: holesAbove }));
  if (!split.clear) notes.push(say("The grades do not split clearly into two groups: this cut-off is the best split, not a natural one. Check it against your geology, or choose one yourself."));
  const { spacing } = siteSpacing(collars);
  const cellSize = spacing ? niceNumber(spacing / 4) : null;
  if (cellSize) reasons.push(because("cellSize", "Shell cells {x} m: about a quarter of the median spacing between drill sites ({s} m), so the shell bends between holes, not only at them.", { x: metres(cellSize), s: metres(spacing) }));
  else notes.push(say("The drill sites are too few or too close to measure their spacing: the shell keeps its own cell size."));
  return autoResult({ cutoff, cellSize, shareAbove, holesAbove }, reasons, notes, problems);
}
