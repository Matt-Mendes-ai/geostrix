// TASKS.csv #2376 (review #2325, WA uranium) — are a stack run's surfaces in the order they were given, at the holes? GemPy's stack is one
// scalar field, so its surfaces cannot cross; but each surface is the level of the field at its own points, and when the field is poorly
// held (a 78 m column of 1.5-12 m units at a 66-70 m cell) those levels can come out of order. On the WA palaeochannel stack Top of H lay
// above Top of I and Top of Basement above Top of E2 and E1 at every point sampled, under a pane that said the surfaces "can't cross".
// Pure (no three.js): `surfaces` youngest first, each { label, package, q } with q a lib/meshQuery.js query over scene positions (y up);
// `holes` the collar positions in the same frame { x, z }. Only surfaces of the same conformable package are compared (#1309: across an
// unconformity the older package is truncated, not ordered).
import { segmentIntersections } from "./meshQuery.js";

// The highest crossing of a vertical line through (x, z), or null where the surface does not reach
export function surfaceTopAt(q, x, z, yLo, yHi) {
  if (!q) return null;
  const a = { x, y: yHi, z }, b = { x, y: yLo, z };
  const ts = segmentIntersections(q, a, b);
  return ts.length ? yHi + (yLo - yHi) * ts[0] : null;
}

export function stackOrderAtHoles(surfaces, holes, { yLo, yHi, tolM = 0.5 } = {}) {
  const tops = holes.map((h) => surfaces.map((s) => surfaceTopAt(s.q, h.x, h.z, yLo, yHi)));
  const pairs = [];
  for (let i = 0; i + 1 < surfaces.length; i++) {
    const a = surfaces[i], b = surfaces[i + 1];
    if ((a.package ?? 0) !== (b.package ?? 0)) continue;
    let of = 0, above = 0, worst = 0;
    tops.forEach((t) => {
      if (t[i] == null || t[i + 1] == null) return;
      of++;
      const d = t[i + 1] - t[i];
      if (d > tolM) { above++; worst = Math.max(worst, d); }
    });
    pairs.push({ younger: a.label, older: b.label, above, of, worstM: worst });
  }
  return { holes: holes.length, pairs, outOfOrder: pairs.filter((p) => p.above > 0) };
}
