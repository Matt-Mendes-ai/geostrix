// TASKS.csv #1309 — conformable packages separated by unconformities. A stack was either one shared field (nothing can truncate) or
// one field per surface (nothing stays parallel). Real maps need both: on the #1306 benchmark, the worst miss on held-back contacts
// of a folded map with an unconformity was 330 m as a stack and 63 m in packages.
// GeoStrix surfaces are unit TOPS, youngest first, and a break means "an unconformity below this unit" (at index b, an index into
// the units youngest first). So the top of the next unit, b + 1, IS the unconformity: it belongs to the upper package, whose field
// it follows, and takes every contact that crosses the break, whichever older unit lies under it there. The next package starts
// with the top of unit b + 2. Pure: no three.js, no React.

// The package of each of n surfaces (tops), in order
export function surfacePackages(n, breaks) {
  const out = [];
  let pkg = 0;
  for (let i = 0; i < n; i++) {
    out.push(pkg);
    if (breaks.has(i - 1)) pkg++;
  }
  return out;
}

// The package of the ROCK of unit i: its bedding belongs here, though its top may be the unconformity above
export function unitPackage(i, breaks) {
  let pkg = 0;
  for (const b of breaks) if (b < i) pkg++;
  return pkg;
}

const crossing = (ry, ro, breaks) => {
  let first = -1;
  for (let b = ry; b < ro; b++) if (breaks.has(b) && first < 0) first = b;
  return first;
};

// A contact between the younger unit ry and the older unit ro: the surface it belongs to. Across a break, the unconformity; inside a
// package, the older unit's top only (a conformable package is one field and cannot pinch a unit out).
export const contactSurface = (ry, ro, breaks) => { const b = crossing(ry, ro, breaks); return b >= 0 ? b + 1 : ro; };

// The package a dip fitted on that contact describes: the upper one across a break (it is the unconformity's own dip)
export const contactPackage = (ry, ro, breaks) => (crossing(ry, ro, breaks) >= 0 ? unitPackage(ry + 1, new Set([...breaks].filter((b) => b < ry))) : unitPackage(ro, breaks));

// Drillhole contacts: a point on the top of unit k with a younger stack unit directly above it across a break really lies on the
// unconformity, so it moves there. Needs the points' hole_id and contactMd (points without them stay). rows: litho { hole_id, to, value }.
// Mutates specs' points and returns how many moved, by surface index.
export function movePointsToUnconformities(specs, rows, breaks) {
  const kOf = new Map();
  specs.forEach((s, k) => (s.codes || [s.meshName]).forEach((c) => { if (!kOf.has(c)) kOf.set(c, k); }));
  const key = (h, d) => `${h}|${Math.round(Number(d) * 1000)}`;
  const endAt = new Map();
  for (const r of rows || []) if (Number.isFinite(Number(r.to))) endAt.set(key(r.hole_id, r.to), r);
  const moved = specs.map(() => 0), incoming = specs.map(() => []);
  specs.forEach((s, k) => {
    s.points = (s.points || []).filter((p) => {
      if (p.hole_id == null || !Number.isFinite(p.contactMd)) return true;
      const above = endAt.get(key(p.hole_id, p.contactMd));
      const kA = above ? kOf.get(above.value) : undefined;
      if (kA === undefined || kA >= k) return true;
      const target = contactSurface(kA, k, breaks);
      if (target === k) return true;
      incoming[target].push(p);
      moved[target]++;
      return false;
    });
  });
  incoming.forEach((pts, k) => { if (pts.length) specs[k].points.push(...pts); });
  return moved;
}
