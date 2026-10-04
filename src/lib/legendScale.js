// TASKS.csv #498 / #522 — what the 3D view's legend shows for a coloured model, built from the model's OWN
// stops so it always matches what the renderer (colorForVoxelValue) draws. The legend used to sample seven
// colours at evenly spaced VALUES whatever the scale: on a log-coloured resistivity model (logStops, #322 /
// #481 / #482) six of the seven fell in the top fifth of the ramp and the whole conductive red-to-white half
// (the DC/IP target) got one swatch, under an unlabelled linear bar; and a classified (discrete) model was
// painted as seven equal steps that could skip a whole class. Pure; tested in test/core.test.mjs.
import { colorForVoxelValue } from "./layers.js";

// Stops that are spaced evenly in log10 (and not evenly in value) — how logStops builds them.
export function stopsAreLogSpaced(stops) {
  const v = (stops || []).map((s) => s.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 3 || v[0] <= 0) return false;
  const span = v[v.length - 1] / v[0];
  if (!(span > 20)) return false; // under ~1.3 decades a log and a linear key look alike: keep it linear
  const lg = v.map(Math.log10);
  const d = lg.slice(1).map((x, i) => x - lg[i]);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  return mean > 0 && d.every((x) => Math.abs(x - mean) <= 0.05 * mean);
}

// -> { kind: "classes", items: [[label, color]] }   for a discrete (classified) model
//    { kind: "ramp", log, min, max, colors, ticks: [{ at (0-1), label }] }   otherwise
export function legendScale(model, lo, hi, fmt = (x) => String(+Number(x).toPrecision(3))) {
  const stops = [...(model?.stops || [])].filter((s) => Number.isFinite(s.value)).sort((a, b) => a.value - b.value);
  if (model?.colorMode === "discrete" && stops.length) {
    const items = [];
    for (let i = 0; i < stops.length; i++) {
      const from = i === 0 ? -Infinity : stops[i].value, to = i + 1 < stops.length ? stops[i + 1].value : Infinity;
      if (to <= lo || from > hi) continue; // a class entirely outside the shown range
      const a = Math.max(from, lo), b = Math.min(to, hi);
      items.push([i + 1 < stops.length ? `${fmt(a)} – ${fmt(b)}` : `≥ ${fmt(a)}`, stops[i].color]);
    }
    return { kind: "classes", items };
  }
  const log = (model?.log === true || stopsAreLogSpaced(stops)) && lo > 0 && hi > lo;
  const n = 17;
  const at = (t) => (log ? 10 ** (Math.log10(lo) + t * (Math.log10(hi) - Math.log10(lo))) : lo + t * (hi - lo));
  const colors = Array.from({ length: n }, (_, i) => colorForVoxelValue(model, at(i / (n - 1))));
  const ticks = [];
  if (log) {
    for (let e = Math.ceil(Math.log10(lo) - 1e-9); 10 ** e <= hi * (1 + 1e-9); e++) {
      const t = (e - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
      if (t > 0.04 && t < 0.96) ticks.push({ at: t, label: fmt(10 ** e) });
    }
  }
  return { kind: "ramp", log, min: lo, max: hi, colors, ticks };
}
