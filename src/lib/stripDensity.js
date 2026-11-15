// TASKS.csv #3558 (Fireweed rehearsal) — the strip log's density track: headed with its unit, scaled from the data's own low end (2.5 to 4.8 t/m3 shows the contrast; from 0 every bar
// was over half full), and a value whose method is not a measurement told apart from a measured one. Also the fit rule for a long hole (#3559). Pure.

// a method word that names a calculated / assumed / default value rather than a measurement (REG regressed, CALC, EST, ASSUMED, DEFAULT, PRED, MODEL, INTERP)
const CALCULATED = /^(reg|regress|calc|est|assum|default|pred|model|interp|derived|nominal)/i;
export const isCalculatedMethod = (m) => typeof m === "string" && CALCULATED.test(m.trim());

// the low end of a density track's scale: a little below the smallest value (a tenth of the spread), to a tenth of a unit, never below 0; null when the values are one number
export function densityLo(values) {
  const v = (values || []).map(Number).filter(Number.isFinite);
  if (v.length < 1) return null;
  let min = Infinity, max = -Infinity;
  for (const x of v) { if (x < min) min = x; if (x > max) max = x; }
  if (!(max > min)) return null;
  const lo = Math.max(0, Math.floor((min - 0.1 * (max - min)) * 10) / 10);
  return lo < max ? lo : null;
}

// px per metre that fits `span` metres in `heightPx` of pane (the track headers and the scale captions take `chrome`), within the box's limits
export const FIT_MIN_PX = 0.05, FIT_MAX_PX = 40;
export function fitPxPerMetre(span, heightPx, chrome = 110) {
  const s = Number(span), h = Number(heightPx);
  if (!(s > 0) || !(h > 0)) return 6;
  const px = Math.floor(((h - chrome) / s) * 100) / 100;
  return Math.max(FIT_MIN_PX, Math.min(FIT_MAX_PX, px > 0 ? px : FIT_MIN_PX));
}

// the depths a long hole opens on: its sampled stretch (a little either side) when that is under 60 % of the hole and the hole is longer than the pane at 6 px/m; else the whole hole
// -> { from, to } | null (the whole hole)
export function openRange(maxDepth, sampledFrom, sampledTo, heightPx, chrome = 110) {
  if (!(maxDepth * 6 + chrome > heightPx)) return null;
  if (!Number.isFinite(sampledFrom) || !Number.isFinite(sampledTo) || !(sampledTo > sampledFrom)) return null;
  if ((sampledTo - sampledFrom) >= 0.6 * maxDepth) return null;
  const pad = Math.max(5, 0.03 * maxDepth);
  return { from: Math.max(0, Math.floor(sampledFrom - pad)), to: Math.min(Math.ceil(maxDepth), Math.ceil(sampledTo + pad)) };
}
