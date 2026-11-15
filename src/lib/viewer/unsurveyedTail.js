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
