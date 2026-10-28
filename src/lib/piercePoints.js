// TASKS.csv #1009 — Matt: "I wanna be able to get a list of pierce points (depths) where my planned drill hole will hit my
// modelled surfaces". Where a planned hole's trace crosses each modelled surface: the downhole depth (MD along the planned
// trace, lift and drift included), the point, its vertical depth below the collar, and the angle between the hole and the
// surface at that point (90 deg = the hole meets it square on; a low angle means a long, oblique intercept).
// Pure: traces and meshes in world coordinates (E, N, elevation).
import { buildMeshQuery, segmentHits } from "./meshQuery.js";

const queries = new WeakMap(); // surface object -> its mesh query, built once per surface geometry

function queryOf(s) {
  let q = queries.get(s);
  if (q === undefined) { q = buildMeshQuery(s.positions, s.indices); queries.set(s, q); }
  return q;
}

// the angle (deg) between direction d and the plane of triangle `tri`, the one the segment crossed. TASKS.csv #1039 — it
// was the triangle with the nearest centroid, found by scanning every triangle (~14 ms per hit on a 1M-triangle surface).
function angleToSurface(s, tri, d) {
  const P = s.positions, I = s.indices;
  if (!(tri >= 0) || tri * 3 + 2 >= I.length) return null;
  const a = I[tri * 3] * 3, b = I[tri * 3 + 1] * 3, c = I[tri * 3 + 2] * 3;
  const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const nl = Math.hypot(...n), dl = Math.hypot(d.x, d.y, d.z);
  if (!(nl > 0) || !(dl > 0)) return null;
  const cos = Math.abs((n[0] * d.x + n[1] * d.y + n[2] * d.z) / (nl * dl)); // |cos| of the angle to the normal
  return (Math.asin(Math.min(1, cos)) * 180) / Math.PI; // angle to the plane
}

// trace: [{ md, x, y, z }] (the planned hole, collar first); surfaces: [{ id, name, positions, indices }].
// -> [{ surfaceId, surfaceName, md, x, y, z, verticalDepth, angle }] sorted by depth.
export function piercePoints(trace, surfaces) {
  const out = [];
  if (!trace?.length || trace.length < 2) return out;
  const collarZ = trace[0].z;
  for (const s of surfaces || []) {
    const q = queryOf(s);
    if (!q) continue;
    for (let i = 1; i < trace.length; i++) {
      const a = trace[i - 1], b = trace[i];
      for (const { t, tri } of segmentHits(q, a, b)) {
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
        const md = a.md + (b.md - a.md) * t;
        // a crossing exactly on a trace vertex is found by both segments that meet there: keep one
        if (out.some((o) => o.surfaceId === s.id && Math.abs(o.md - md) < 1e-6)) continue;
        out.push({ surfaceId: s.id, surfaceName: s.name, md, ...p, verticalDepth: collarZ - p.z, angle: angleToSurface(s, tri, { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }) });
      }
    }
  }
  return out.sort((u, v) => u.md - v.md);
}

// CSV rows for every planned hole's pierce points (hole name, surface, depths, coordinates, angle)
export function piercePointRows(results) {
  const rows = [];
  for (const { hole, pierces } of results) {
    for (const p of pierces) rows.push({
      hole: hole.name || "", surface: p.surfaceName, depth_m: +p.md.toFixed(2), vertical_depth_m: +p.verticalDepth.toFixed(2),
      easting: +p.x.toFixed(2), northing: +p.y.toFixed(2), elevation: +p.z.toFixed(2), angle_to_surface_deg: p.angle == null ? "" : +p.angle.toFixed(1),
    });
  }
  return rows;
}
