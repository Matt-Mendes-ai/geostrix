// TASKS.csv #3643 (Fireweed rehearsal #3572 (3), Macpass: two intercepts of one hole measured 110.81 m, the along-hole difference was ~109.2 m) —
// Measure took the point where the click's ray met the interval tube's SURFACE, up to a tube radius off the hole's axis (and the radius is
// symbolic: 2.8 m for the mineralisation tubes). A click on a hole's own drawing (trace, interval tube, assay mark) now lands on the hole's
// axis: the nearest point of its trace (inside the interval's from / to when the hit is an interval). Shift on the click keeps the surface point.
import { drawn, drillObjectOf } from "../../modules/viewer/pickGround.js";

// The point of the hole's trace nearest to p. trace: { pts: [{ md }], wx, wy, wz } (world, as ViewerModule's tracesRef holds them); p: world { x, y, z };
// range: { from, to } (measured depths) limits the search to that part of the hole. -> { x, y, z, md, dist } or null
export function snapToAxis(trace, p, range = null) {
  const pts = trace?.pts, wx = trace?.wx, wy = trace?.wy, wz = trace?.wz;
  if (!pts || pts.length < 2 || !wx || !p || ![p.x, p.y, p.z].every(Number.isFinite)) return null;
  const lo = range && Number.isFinite(range.from) ? range.from : -Infinity, hi = range && Number.isFinite(range.to) ? range.to : Infinity;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const m0 = pts[i].md, m1 = pts[i + 1].md, span = m1 - m0;
    if (!(span > 0) || m1 < lo || m0 > hi) continue;
    const tLo = Math.max(0, (lo - m0) / span), tHi = Math.min(1, (hi - m0) / span);
    const dx = wx[i + 1] - wx[i], dy = wy[i + 1] - wy[i], dz = wz[i + 1] - wz[i], len2 = dx * dx + dy * dy + dz * dz;
    if (!(len2 > 0)) continue;
    let t = ((p.x - wx[i]) * dx + (p.y - wy[i]) * dy + (p.z - wz[i]) * dz) / len2;
    t = Math.min(tHi, Math.max(tLo, t));
    const x = wx[i] + dx * t, y = wy[i] + dy * t, z = wz[i] + dz * t, dist = Math.hypot(p.x - x, p.y - y, p.z - z);
    if (!best || dist < best.dist) best = { x, y, z, md: m0 + span * t, dist };
  }
  return best;
}

// world: the point the click found (worldPointFromHits); hits: the click's ray hits, nearest first; traces: tracesRef.current.
// -> world itself (Shift, a plane point, a click that is not on a hole's own drawing) or the point on the hole's axis, with axis: { hole, md }
export function snapMeasurePoint(world, hits, traces, { shift = false } = {}) {
  if (shift || !world || world.plane || !hits?.length) return world;
  const near = hits.find(drawn);
  const hole = near ? drillObjectOf(near.object) : null;
  if (!hole) return world;
  const trace = (traces || []).find((t) => String(t.hole_id) === hole);
  const row = near.object.userData?.row;
  const s = snapToAxis(trace, world, row ? { from: Number(row.from), to: Number(row.to) } : null);
  return s ? { ...world, x: s.x, y: s.y, z: s.z, axis: { hole, md: s.md } } : world;
}
