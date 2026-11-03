// TASKS.csv #1400 (review #1352, Silvertip) — strip-log tracks the window lacked: Recovery % beside RQD, the oriented-core
// structures, and a log scale for numeric logs (mag susc of 0.1-2 against a 100 maximum drew 1-px slivers).

// share of the track a value fills on a log axis from the smallest positive value to the largest; 3 % floor so the lowest
// value still shows; 0 for a value <= 0 (no log)
export function logFrac(v, minPos, max) {
  if (!(v > 0) || !(max > 0) || !(minPos > 0)) return 0;
  const lo = Math.log10(minPos), hi = Math.log10(max);
  return hi > lo ? Math.max(0.03, Math.min(1, (Math.log10(v) - lo) / (hi - lo))) : 1;
}

// smallest positive value and largest of a track's rows
export function valueRange(rows) {
  let minPos = Infinity, max = 0;
  for (const r of rows || []) { const v = Number(r.value); if (v > 0 && v < minPos) minPos = v; if (v > max) max = v; }
  return { minPos: Number.isFinite(minPos) ? minPos : 0, max };
}

// Recovery is a percent, but core exports carry values over 100 (Silvertip: 235 of 2,250 intervals, up to 112.67 %): the bar's
// full scale is 100, or the largest value when it is more, so nothing is clipped.
export const recoveryMax = (rows) => Math.max(100, valueRange(rows).max);

// A structure pick as a tick across its track at its alpha (the angle between the plane and the core axis, which runs down
// the log): alpha 90 is a plane square to the core (a horizontal tick), alpha 0 one along it (vertical). Half-extents of a tick
// of half-length `half` px; null without an alpha (the pick is then a short mark at the track's edge).
export function alphaTick(alpha, half) {
  const a = Number(alpha);
  if (alpha == null || alpha === "" || !Number.isFinite(a)) return null;
  const r = (Math.max(0, Math.min(90, a)) * Math.PI) / 180;
  return { dx: half * Math.sin(r), dy: half * Math.cos(r) };
}

// the structure picks of one hole with a depth (a blank one is left out: Number(null) is 0), sorted down the hole
export function holeStructures(rows, holeId) {
  return (rows || []).filter((s) => s.hole_id === holeId && s.depth != null && s.depth !== "" && Number.isFinite(Number(s.depth))).map((s) => ({ ...s, depth: Number(s.depth) })).sort((a, b) => a.depth - b.depth);
}
