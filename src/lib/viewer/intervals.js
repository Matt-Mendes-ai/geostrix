// TASKS.csv #445 step 1 — moved out of ViewerModule.jsx unchanged (pure maths, no three.js / DOM), so it
// can be tested on its own (test/core.test.mjs #445). The comments are the originals.

// TASKS.csv #354 — a logged interval's FROM is only a real contact when the interval directly above it in
// the same hole is a DIFFERENT unit. Logs are split at every sample/run break, so a unit logged as
// 0-11.2, 11.2-25, 25-60 has ONE top (at 0), not three; feeding every split to the implicit model as a
// "Top of X" point (33% of the Harry DACT tops were such splits, 3-20 m inside the unit) forced GemPy to
// fold the surface through them (flat contact test: z range 50 m / sd 17.7 m instead of flat). Keyed by
// hole + depth rounded to a millimetre, so float noise in from/to doesn't break the match.
export const depthKey = (hole, d) => `${hole}|${Number(d).toFixed(3)}`;
// TASKS.csv #2931 (WA iron review) — the two indexes below were one Map keyed by depthKey strings: on 150,455 strand intervals building
// them was most of Contact picks' time once the trace lookups were fixed. They are now hole -> (whole millimetres -> values), about
// six times faster to build; read them with depthIndexAt(index, hole, depth) (the same 1 mm match, holes compared as text).
const mmOf = (d) => Math.round(Number(d) * 1000);
function depthIndex(rows, field) {
  const m = new Map();
  let last, hm = null;
  for (const r of rows || []) {
    if (r.hole_id == null || !Number.isFinite(Number(r[field]))) continue;
    const h = String(r.hole_id);
    if (h !== last || !hm) { last = h; hm = m.get(h); if (!hm) m.set(h, (hm = new Map())); }
    const k = mmOf(r[field]), v = hm.get(k);
    if (v) v.push(r.value); else hm.set(k, [r.value]);
  }
  return m;
}
export const depthIndexAt = (index, hole, d) => (hole == null ? undefined : index?.get(String(hole))?.get(mmOf(d)));
export const intervalEndIndex = (rows) => depthIndex(rows, "to"); // #2931 — read with depthIndexAt
// True when a row of one of `codes` ends exactly where `r` starts in the same hole, i.e. `r` continues
// the same unit (or the same lithology group) rather than starting it.
export function continuesUnitAbove(endIndex, r, codes) {
  const above = depthIndexAt(endIndex, r.hole_id, r.from);
  return !!above && above.some((v) => codes.has(v));
}
// TASKS.csv #569 — rows indexed by START depth (hole|from), the mirror of intervalEndIndex, for up-holes below.
export const intervalStartIndex = (rows) => depthIndex(rows, "from"); // #2931
// TASKS.csv #569 — where a logged interval's UPPER contact is. Picking used to take `from` (the shallower end
// along the hole) as the unit's top, which is right for a down-hole but, in a hole drilled UPWARD (common
// underground), `from` is the stratigraphically LOWER end: every pick was the unit's base fed in as its top.
// zAt(md) -> elevation on the hole's trace. When the trace rises from `from` to `to`, the top is at `to`, and
// the unit "continues from above" when a row of `codes` STARTS at `to` (not when one ends at `from`).
// Returns { md, upHole, continues }. Without elevations (no trace) it keeps the down-hole rule. An OVERTURNED
// limb (down-hole, but the sequence upside down) cannot be told from geometry; that needs younging data.
export function upperContactOf(r, zAt, { startIndex, endIndex, codes }) {
  const zf = zAt ? zAt(Number(r.from)) : NaN, zt = zAt ? zAt(Number(r.to)) : NaN;
  const upHole = Number.isFinite(zf) && Number.isFinite(zt) && zt > zf + 1e-6;
  if (!upHole) return { md: Number(r.from), upHole: false, continues: continuesUnitAbove(endIndex, r, codes) };
  const next = depthIndexAt(startIndex, r.hole_id, r.to);
  return { md: Number(r.to), upHole: true, continues: !!next && next.some((v) => codes.has(v)) };
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
