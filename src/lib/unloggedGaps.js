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

// TASKS.csv #2531 (review #2486, WA lithium) — the drilled metres with no rock code: a hole's length (0 to its collar length) less its logged
// rows (a blank code is not a code). Grade-control bench holes logged pegmatite-or-nothing made a closed body of P 1.84 Mm³ against 0.74-0.77:
// their unlogged metres did not limit it. collars [{ hole_id, length }], rows the lithology rows; isLogged(r) decides a code.
// -> { rows: [{ hole_id, from, to }], metres, drilled, holes (with any unlogged metres), noLog (holes with no logged row at all) }
export function unloggedDrilling(collars, rows, isLogged = (r) => r.value != null && String(r.value).trim() !== "") {
  const cover = new Map();
  for (const r of rows || []) {
    const f = Number(r.from), t = Number(r.to);
    if (!(t > f) || !isLogged(r)) continue;
    (cover.get(r.hole_id) || cover.set(r.hole_id, []).get(r.hole_id)).push([f, t]);
  }
  for (const list of cover.values()) list.sort((a, b) => a[0] - b[0]);
  const out = [];
  let metres = 0, drilled = 0, noLog = 0;
  const holes = new Set();
  for (const c of collars || []) {
    const L = Number(c?.length);
    if (!(L > 0) || c.hole_id == null) continue;
    drilled += L;
    const list = cover.get(c.hole_id);
    if (!list) { noLog++; out.push({ hole_id: c.hole_id, from: 0, to: L }); metres += L; holes.add(c.hole_id); continue; }
    let f = 0;
    for (const [a, b] of list) {
      if (b <= f) continue;
      if (a >= L) break;
      if (a > f) { out.push({ hole_id: c.hole_id, from: f, to: a }); metres += a - f; holes.add(c.hole_id); }
      f = Math.max(f, b);
      if (f >= L) break;
    }
    if (f < L) { out.push({ hole_id: c.hole_id, from: f, to: L }); metres += L - f; holes.add(c.hole_id); }
  }
  return { rows: out, metres, drilled, holes: holes.size, noLog };
}
