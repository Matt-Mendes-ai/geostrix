// TASKS.csv #3560 B3 (Matt: "B3 yes") — a bent fence: the panel through the holes the geologist ticked, IN THE ORDER ticked, along the polyline of
// their collars, unfolded. The straight panel (lib/fence.js buildFencePanel) projects every hole onto one line, so a bent line of holes has some
// of them far off it; here the distance runs along the polyline (the collars in plan, joined in order) and each hole hangs from its own collar:
// its points are placed by their offset along, and across, the line's direction at that collar (the bisector of the two segments meeting there:
// the one segment at either end). Same result shape as buildFencePanel, plus line.bent and line.vertices.
//
// traces: [{ hole_id, md[], wx[], wy[], wz[] }]; order: hole ids in the order to join them
// -> { line: { origin, dir, azimuth, bent: true, vertices: [{ hole_id, x, y, s }], length }, holes, sRange, zRange } or null (fewer than 2 holes)
const dirToAzimuth = (dx, dy) => ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
export function buildBentPanel(traces, order) {
  const byId = new Map((traces || []).filter((t) => t?.wx?.length > 0).map((t) => [t.hole_id, t]));
  const ids = (order || []).filter((id) => byId.has(id));
  if (ids.length < 2) return null;
  const V = ids.map((id) => ({ hole_id: id, x: byId.get(id).wx[0], y: byId.get(id).wy[0] }));
  const unit = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); return L > 0 ? { x: dx / L, y: dy / L, L } : null; };
  const segs = V.slice(1).map((v, i) => unit(V[i], v));
  let s = 0;
  const vertices = V.map((v, i) => { if (i > 0) s += segs[i - 1]?.L ?? 0; return { ...v, s }; });
  const dirAt = (i) => {
    const a = i > 0 ? segs[i - 1] : null, b = i < segs.length ? segs[i] : null;
    const dx = (a?.x ?? 0) + (b?.x ?? 0), dy = (a?.y ?? 0) + (b?.y ?? 0), L = Math.hypot(dx, dy);
    if (L > 1e-9) return { x: dx / L, y: dy / L };
    const f = a || b; // a hairpin (the two segments cancel) or coincident collars: the segment's own
    return f ? { x: f.x, y: f.y } : { x: 0, y: 1 };
  };
  const holes = ids.map((id, i) => {
    const t = byId.get(id), d = dirAt(i), v = vertices[i], pts = [];
    let maxAbsOffset = 0;
    for (let k = 0; k < t.wx.length; k++) {
      const rx = t.wx[k] - v.x, ry = t.wy[k] - v.y, along = rx * d.x + ry * d.y, off = rx * d.y - ry * d.x;
      if (Math.abs(off) > maxAbsOffset) maxAbsOffset = Math.abs(off);
      pts.push({ md: t.md ? t.md[k] : k, s: v.s + along, z: t.wz[k], offset: off });
    }
    return { hole_id: id, s: pts[0].s, offset: pts[0].offset, maxAbsOffset, pts };
  });
  let smin = Infinity, smax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const h of holes) for (const p of h.pts) { if (p.s < smin) smin = p.s; if (p.s > smax) smax = p.s; if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z; }
  const first = V[0], last = V[V.length - 1], overall = unit(first, last) || { x: 0, y: 1 };
  return { line: { origin: { x: first.x, y: first.y }, dir: { x: overall.x, y: overall.y }, azimuth: dirToAzimuth(overall.x, overall.y), bent: true, vertices, length: s }, holes, sRange: { min: smin, max: smax }, zRange: { min: zmin, max: zmax } };
}
