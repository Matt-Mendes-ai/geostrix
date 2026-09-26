// TASKS.csv #445 step 1 — moved out of ViewerModule.jsx unchanged (pure maths, no three.js / DOM), so it
// can be tested on its own (test/core.test.mjs #445). The comments are the originals.

// TASKS.csv #354 — a logged interval's FROM is only a real contact when the interval directly above it in
// the same hole is a DIFFERENT unit. Logs are split at every sample/run break, so a unit logged as
// 0-11.2, 11.2-25, 25-60 has ONE top (at 0), not three; feeding every split to the implicit model as a
// "Top of X" point (33% of the Harry DACT tops were such splits, 3-20 m inside the unit) forced GemPy to
// fold the surface through them (flat contact test: z range 50 m / sd 17.7 m instead of flat). Keyed by
// hole + depth rounded to a millimetre, so float noise in from/to doesn't break the match.
export const depthKey = (hole, d) => `${hole}|${Number(d).toFixed(3)}`;
export function intervalEndIndex(rows) {
  const m = new Map();
  (rows || []).forEach((r) => {
    if (r.hole_id == null || !Number.isFinite(Number(r.to))) return;
    const k = depthKey(r.hole_id, r.to);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r.value);
  });
  return m;
}
// True when a row of one of `codes` ends exactly where `r` starts in the same hole, i.e. `r` continues
// the same unit (or the same lithology group) rather than starting it.
export function continuesUnitAbove(endIndex, r, codes) {
  const above = endIndex.get(depthKey(r.hole_id, r.from));
  return !!above && above.some((v) => codes.has(v));
}
// TASKS.csv #354 — back-to-back rows of one code in one hole (a vein logged as 12.0-12.4 + 12.4-13.1)
// are one intercept, not two thin ones.
export function mergeTouchingIntervals(rows) {
  const byHole = new Map();
  rows.forEach((r) => { if (!byHole.has(r.hole_id)) byHole.set(r.hole_id, []); byHole.get(r.hole_id).push(r); });
  const out = [];
  byHole.forEach((list) => {
    list.sort((a, b) => Number(a.from) - Number(b.from));
    let cur = null;
    list.forEach((r) => {
      if (cur && Math.abs(Number(r.from) - Number(cur.to)) < 1e-3) { cur = { ...cur, to: Number(r.to), merged: (cur.merged || 1) + 1 }; return; }
      if (cur) out.push(cur);
      cur = { ...r, from: Number(r.from), to: Number(r.to) };
    });
    if (cur) out.push(cur);
  });
  return out;
}
