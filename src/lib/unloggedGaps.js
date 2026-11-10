// TASKS.csv #2380 (review #2325, WA uranium) — an alteration log that records alteration only where it is seen: between its rows the rock
// was logged (Lithology) but has no alteration row, so an indicator halo counted it as unknown, not unaltered. SIL (3,081 m logged 2 m at a
// time) became a 715 Mm³ body from RL 158 to 421, above the collars and below the holes. These are the parts of the Lithology intervals that
// no alteration row covers, per hole: the zeros the halo can take when asked. Pure.

// litho, alt: [{ hole_id, from, to }] -> { rows: [{ hole_id, from, to }], metres, holes }
export function rockWithoutRows(litho, alt) {
  const cover = new Map();
  for (const r of alt || []) {
    const f = Number(r.from), t = Number(r.to);
    if (!(t > f)) continue;
    (cover.get(r.hole_id) || cover.set(r.hole_id, []).get(r.hole_id)).push([f, t]);
  }
  for (const list of cover.values()) list.sort((a, b) => a[0] - b[0]);
  const rows = [];
  let metres = 0;
  const holes = new Set();
  for (const r of litho || []) {
    let f = Number(r.from);
    const t = Number(r.to);
    if (!(t > f)) continue;
    const list = cover.get(r.hole_id);
    if (!list) continue; // a hole with no alteration log at all is not "logged as unaltered"
    for (const [a, b] of list) {
      if (b <= f) continue;
      if (a >= t) break;
      if (a > f) { rows.push({ hole_id: r.hole_id, from: f, to: a }); metres += a - f; holes.add(r.hole_id); }
      f = Math.max(f, b);
      if (f >= t) break;
    }
    if (f < t) { rows.push({ hole_id: r.hole_id, from: f, to: t }); metres += t - f; holes.add(r.hole_id); }
  }
  return { rows, metres, holes: holes.size };
}
