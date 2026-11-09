// TASKS.csv #2074 (review #2013, Geophysics) — the pre-inversion pseudosection was coloured dots with no station axis, no
// pseudo-depth axis, no colour bar, no chargeability view and no word on where each reading is plotted: a geophysicist could
// not QC the data before inverting it. The plot geometry lives here (pure, tested); DcipPanel's Pseudosection draws it.
import { niceStep } from "./dcipSectionImage.js";
import { logStops, sequentialStops } from "./inversion.js";
import { arrMin, arrMax } from "./arrayStats.js";

// ticks on a 1, 2, 5 x 10^n step inside [lo, hi]
export function axisTicks(lo, hi, n = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (hi <= lo) return [lo];
  const st = niceStep(lo, hi, n), out = [];
  for (let k = Math.ceil(lo / st - 1e-9); k * st <= hi + st * 1e-9; k++) out.push(Number((k * st).toPrecision(12)));
  return out;
}

// the colour model, the bar's values and its labels for one field: resistivity on a log ramp (it spans decades), chargeability
// on a linear one from min(0, lo) (as the Data-fit plot draws it); readings that are not finite (or not > 0 on a log ramp) are
// left out of the range and drawn grey
export function pseudoColourScale(values, field, steps = 24) {
  const log = field === "resistivity";
  const ok = (values || []).filter((v) => Number.isFinite(v) && (!log || v > 0));
  if (!ok.length) return null;
  let lo = arrMin(ok), hi = arrMax(ok);
  if (!log) lo = Math.min(0, lo);
  if (hi <= lo) hi = log ? lo * 10 : lo + 1;
  const model = { stops: log ? logStops(lo, hi) : sequentialStops(lo, hi), colorMode: "continuous" };
  const at = (f) => (log ? 10 ** (Math.log10(lo) + (Math.log10(hi) - Math.log10(lo)) * f) : lo + (hi - lo) * f);
  const bar = Array.from({ length: steps }, (_, i) => at((i + 0.5) / steps));
  return { log, lo, hi, model, bar, labels: [lo, at(0.5), hi], unit: log ? "ohm·m" : "mV/V", usable: ok.length };
}

// the plot frame: margins for the depth labels (left) and the station labels (bottom), the scale functions and the ticks
export function pseudoFrame(pts, { W = 320, H = 150, left = 34, right = 16, top = 6, bottom = 20 } = {}) {
  const ss = pts.map((p) => p.s), ds = pts.map((p) => p.depth);
  const smin = arrMin(ss), smax = arrMax(ss), dmax = arrMax(ds) || 1;
  const x = (s) => left + ((s - smin) / (smax - smin || 1)) * (W - left - right);
  const y = (d) => top + (d / dmax) * (H - top - bottom);
  return { W, H, left, right, top, bottom, smin, smax, dmax, x, y, sTicks: axisTicks(smin, smax, 5), dTicks: axisTicks(0, dmax, 4) };
}
