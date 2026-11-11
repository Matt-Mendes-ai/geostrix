// TASKS.csv #2626 (follow-up of #2417 / #2542) — Surface query's metres inside a closed grade shell, split into the metres sampled for the
// shell's own element and the metres with no sample (the review's CLDD005: 117 m inside a U shell, 14.4 m of them sampled): a shell drawn
// through unsampled core is the estimate's assumption, not a measurement.
// segs: [{ hole_id, from, to, value }] (geochem resolvedSegments) -> Map hole_id -> merged, sorted [{ from, to }] of the sampled metres
export function sampledByHole(segs) {
  const by = new Map();
  for (const s of segs || []) {
    const f = Number(s.from), t = Number(s.to);
    if (!Number.isFinite(s?.value) || !(t > f)) continue;
    (by.get(s.hole_id) || by.set(s.hole_id, []).get(s.hole_id)).push({ from: f, to: t });
  }
  for (const [id, l] of by) {
    l.sort((a, b) => a.from - b.from);
    const m = [];
    for (const x of l) { const p = m[m.length - 1]; if (p && x.from <= p.to + 1e-9) p.to = Math.max(p.to, x.to); else m.push({ ...x }); }
    by.set(id, m);
  }
  return by;
}

// intervals: [{ from, to }] (the hole's inside intervals, downhole metres); sampled: the hole's merged sampled metres -> metres of overlap
export function sampledMetres(intervals, sampled) {
  let m = 0;
  for (const iv of intervals || []) {
    for (const s of sampled || []) {
      if (s.from >= iv.to) break;
      const a = Math.max(iv.from, s.from), b = Math.min(iv.to, s.to);
      if (b > a) m += b - a;
    }
  }
  return m;
}
