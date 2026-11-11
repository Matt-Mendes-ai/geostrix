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

// TASKS.csv #2596 — the drilled metres with no sample of the element, as points every `step` metres along the holes (traces: [{ hole_id,
// pts: [{ md, x, y, z }] }] in world coordinates, every collar, assayed or not), kept inside `box` (the grid padded by the search) when given.
// sampled: sampledByHole(...). A point is sampled when its depth lies in a sampled interval.
export function unsampledDrillPoints(traces, sampled, step, box = null) {
  const h = Math.max(0.5, Number(step) || 2), out = [];
  const inBox = (p) => !box || (p.x >= box.xmin && p.x <= box.xmax && p.y >= box.ymin && p.y <= box.ymax && p.z >= box.zmin && p.z <= box.zmax);
  for (const t of traces || []) {
    const pts = t?.pts;
    if (!pts || pts.length < 2) continue;
    const segs = sampled?.get(t.hole_id) || [];
    const end = pts[pts.length - 1].md;
    let si = 0, k = 1;
    for (let md = (pts[0].md || 0) + h / 2; md < end; md += h) {
      while (si < segs.length && segs[si].to <= md) si++;
      if (si < segs.length && segs[si].from <= md) continue; // sampled here
      while (k < pts.length - 1 && pts[k].md < md) k++;
      const a = pts[k - 1], b = pts[k], f = b.md > a.md ? (md - a.md) / (b.md - a.md) : 0;
      const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
      if (inBox(p)) out.push(p);
    }
  }
  return out;
}
