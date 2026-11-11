// TASKS.csv #2634 (review #2486, WA lithium) — 'P or Li at or above a cut-off': a closed body of a unit reads only the lithology log, so the
// metres with no rock code are unknown (or, when asked, outside: #2531). In block 3 76 samples at or above 1 % Li2O in 10 holes with no log
// were seen by no lithology tool. With this, where the log is blank and the hole is assayed for the element the user chose, the assay
// decides: at or above the typed cut-off is inside the unit, below it outside. The rest of the blank metres keep the #2531 rule.
// gaps: [{ hole_id, from, to }] (lib/unloggedGaps.js unloggedDrilling rows); segs: [{ hole_id, from, to, value }] (geochem resolvedSegments:
// duplicates and overlaps resolved, values in the element's unit). -> { inside, outside, rest: [{ hole_id, from, to }], insideM, outsideM,
// holes: the holes with an assayed blank metre }
export function assayIndicatorInGaps(gaps, segs, cutoff) {
  const byHole = new Map();
  for (const s of segs || []) {
    if (!Number.isFinite(s?.value) || !(Number(s.to) > Number(s.from))) continue;
    (byHole.get(s.hole_id) || byHole.set(s.hole_id, []).get(s.hole_id)).push(s);
  }
  for (const l of byHole.values()) l.sort((a, b) => a.from - b.from);
  const inside = [], outside = [], rest = [], holes = new Set();
  let insideM = 0, outsideM = 0;
  for (const g of gaps || []) {
    const f0 = Number(g.from), t0 = Number(g.to);
    if (!(t0 > f0)) continue;
    let at = f0;
    for (const s of byHole.get(g.hole_id) || []) {
      if (s.to <= f0) continue;
      if (s.from >= t0) break;
      const a = Math.max(f0, s.from), b = Math.min(t0, s.to);
      if (!(b > a)) continue;
      if (a > at + 1e-9) rest.push({ hole_id: g.hole_id, from: at, to: a });
      const seg = { hole_id: g.hole_id, from: a, to: b };
      if (s.value >= cutoff) { inside.push(seg); insideM += b - a; } else { outside.push(seg); outsideM += b - a; }
      holes.add(g.hole_id);
      at = Math.max(at, b);
    }
    if (t0 > at + 1e-9) rest.push({ hole_id: g.hole_id, from: at, to: t0 });
  }
  return { inside, outside, rest, insideM, outsideM, holes: holes.size };
}
