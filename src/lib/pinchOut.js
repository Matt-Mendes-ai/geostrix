// TASKS.csv #1030 (review #1016, implicit modeller) — a stack unit missing between its neighbours. Each unit's surface was
// fed only its own tops, so where a hole shows A directly on C (B never logged in that hole) the A/C contact went to
// "top of C" alone and "top of B" was extrapolated from where B was logged: 50-70 m of B modelled where every log says
// none. The usual implicit-modelling rule (Leapfrog's) gives that contact to the top of every missing unit between A and
// C as well, so they thin to nothing there. Pure: no React / three.js.
//
// specs: the stack's units, youngest first: [{ meshName, codes, points: [{ ..., hole_id, contactMd }] }] (contactMd: the
// down-hole depth of the contact a point came from; up-hole picks and drawn / explicit points have none and are left
// alone). rows: the litho rows ({ hole_id, from, to, value }).
// -> { add: [[points for spec 0], [for spec 1], ...], absent: [{ unit, holes }] } — `add` points are copies tagged
// srcCode "pinch:<code>", for the caller to append when the stack can pinch out (erosional groups).
export function pinchOutPoints(specs, rows) {
  const kOf = new Map();
  specs.forEach((s, k) => (s.codes || [s.meshName]).forEach((c) => { if (!kOf.has(c)) kOf.set(c, k); }));
  const present = new Map(), endAt = new Map();
  const key = (h, d) => `${h}|${Math.round(Number(d) * 1000)}`;
  for (const r of rows || []) {
    const k = kOf.get(r.value);
    if (k !== undefined) (present.get(r.hole_id) || present.set(r.hole_id, new Set()).get(r.hole_id)).add(k);
    if (Number.isFinite(Number(r.to))) endAt.set(key(r.hole_id, r.to), r);
  }
  const add = specs.map(() => []), holesOf = specs.map(() => new Set());
  specs.forEach((s, k) => {
    for (const p of s.points || []) {
      if (p.hole_id == null || !Number.isFinite(p.contactMd)) continue;
      const above = endAt.get(key(p.hole_id, p.contactMd));
      const kA = above ? kOf.get(above.value) : undefined;
      if (kA === undefined || kA >= k - 1) continue; // not a younger stack unit directly above, or nothing missing
      const has = present.get(p.hole_id) || new Set();
      for (let m = kA + 1; m < k; m++) {
        if (has.has(m)) continue; // logged elsewhere in this hole: repeated / faulted, not absent
        const { contactMd: _c, ...q } = p;
        add[m].push({ ...q, srcCode: `pinch:${p.srcCode ?? ""}` });
        holesOf[m].add(p.hole_id);
      }
    }
  });
  return { add, absent: specs.map((s, m) => ({ unit: s.meshName, holes: holesOf[m].size })).filter((a) => a.holes) };
}
