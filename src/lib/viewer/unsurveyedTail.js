// TASKS.csv #3588 (5) (Fireweed rehearsal, Macpass) — NB91-22 (one survey at 0 m, 262.4 m long), N81-1 and NB22-008 were drawn as solid traces to the end of
// hole on the last measured attitude, with no word that the path below the last station was not surveyed. The index of the trace point at the hole's last
// survey station when more than TAIL_MIN_M of the hole lies below it (shorter tails are a hole's last few metres past its last reading): the part from
// there on is drawn dashed. -1: none (no survey rows, a hole surveyed to its end, or a tail under TAIL_MIN_M).
// hs: the hole's survey rows ({ depth }); pts: its trace points in order ({ md }).
export const TAIL_MIN_M = 10;
export function unsurveyedTailStart(hs, pts) {
  if (!hs?.length || !pts || pts.length < 2) return -1;
  let last = -Infinity;
  for (const s of hs) { const d = Number(s?.depth); if (Number.isFinite(d) && d > last) last = d; }
  const end = pts[pts.length - 1].md;
  if (!Number.isFinite(last) || !Number.isFinite(end) || end - last <= TAIL_MIN_M) return -1;
  let k = 0;
  for (let i = 0; i < pts.length; i++) { if (pts[i].md <= last + 1e-6) k = i; else break; }
  return k < pts.length - 1 ? k : -1;
}

// TASKS.csv #3761 (Scottie Gold review: SR23-313's last 108 m of 179 m looked measured under the lithology tubes, Identify there said 'survey method
// measured', and SR23-299's 339 m between its first two stations was not marked at all, the rule looking only below the LAST station) — every stretch of
// a hole with no survey station: the tail below the last station (over TAIL_MIN_M, as unsurveyedTailStart) and any stretch between two stations longer
// than GAP_MIN_M (the stations of a surveyed hole are usually 30 m apart, a gyro run 10-30 m; over 100 m the path between is an interpolation). The path
// there is an assumption whatever is drawn on it: the trace dashed, the tubes crossed by the dashed line, Identify saying so.
// hs: the hole's survey rows ({ depth }); pts: its trace points ({ md }) -> [{ from, to (measured depths), i0, i1 (trace point indices, both inside), kind: 'tail' | 'gap' }]
export const GAP_MIN_M = 100;
export function unsurveyedSpans(hs, pts) {
  if (!hs?.length || !pts || pts.length < 2) return [];
  const ds = [...new Set(hs.map((s) => Number(s?.depth)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!ds.length) return [];
  const end = pts[pts.length - 1].md;
  const spans = [];
  const at = (md) => { let k = 0; for (let i = 0; i < pts.length; i++) { if (pts[i].md <= md + 1e-6) k = i; else break; } return k; };
  for (let i = 0; i + 1 < ds.length; i++) if (ds[i + 1] - ds[i] > GAP_MIN_M) spans.push({ from: ds[i], to: Math.min(ds[i + 1], end), kind: "gap" });
  const tail = unsurveyedTailStart(hs, pts);
  if (tail >= 0) spans.push({ from: ds[ds.length - 1], to: end, kind: "tail" });
  return spans.filter((sp) => sp.to > sp.from).map((sp) => { const i0 = at(sp.from), i1 = sp.kind === "tail" ? pts.length - 1 : Math.max(i0 + 1, at(sp.to)); return { ...sp, i0, i1: Math.min(pts.length - 1, i1) }; });
}
// the span a measured depth (or the middle of an interval) falls in, or null
export const assumedSpanAt = (spans, md) => (Array.isArray(spans) && Number.isFinite(md) ? spans.find((sp) => md > sp.from && md <= sp.to) || null : null);
