// TASKS.csv #2905 (WA iron review) — a stratigraphic stack of thin units in a model box whose vertical cell is thicker than they are: one
// GemPy field cannot place them apart, and the six 5 m iron strands came out folded and out of order after 9.5 minutes (18 m cells). Said
// BEFORE the solve now, with the route that works (an Explicit surface per unit from its logged tops). Pure.

// specs: the stack's surfaces youngest first, each { points: [{ hole_id, z (elevation) }] } (its contacts). Per hole, the drop from one
// unit's top to the next unit's top is that unit's thickness there; the median of the positive ones, or null with fewer than 3.
export function medianStackThickness(specs) {
  const tops = (specs || []).map((s) => {
    const m = new Map();
    for (const p of s?.points || []) if (p?.hole_id != null && Number.isFinite(p.z)) { const z = m.get(p.hole_id); if (z == null || p.z > z) m.set(p.hole_id, p.z); } // the highest top in a hole
    return m;
  });
  const t = [];
  for (let k = 0; k + 1 < tops.length; k++) for (const [h, z] of tops[k]) { const z2 = tops[k + 1].get(h); if (z2 != null && z - z2 > 0) t.push(z - z2); }
  if (t.length < 3) return null;
  t.sort((a, b) => a - b);
  const mid = t.length >> 1;
  return t.length % 2 ? t[mid] : (t[mid - 1] + t[mid]) / 2;
}

// { thick, dz } when the units are thinner than the vertical cell dz (unresolved); else null
export function stackCellCheck(specs, dz) {
  if (!(dz > 0) || (specs || []).length < 2) return null;
  const thick = medianStackThickness(specs);
  return thick != null && thick < dz ? { thick, dz } : null;
}
