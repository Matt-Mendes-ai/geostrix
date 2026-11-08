// TASKS.csv #1690 (review #1645, Copley) — the measured specific gravity inside one closed solid: the Specific gravity
// intervals whose desurveyed midpoints fall inside the mesh, summarized as #1216's sgSummary (length-weighted mean, n,
// range, left-out count). traces: [{ hole_id, pts }] in the same frame as positions (the scene frame of the viewer's
// meshes). -> null when the mesh has no faces or no usable interval falls inside.
import { sgSummary } from "./gradeTonnage.js";
import { buildMeshQuery, isPointInsideMesh } from "./meshQuery.js";
import { pointOnTrace } from "./desurvey.js";

export function sgInsideSolid(rows, traces, positions, indices) {
  if (!rows?.length || !traces?.length) return null;
  const q = buildMeshQuery(positions, indices);
  if (!q) return null;
  const byHole = new Map(traces.map((t) => [t.hole_id, t.pts]));
  const inside = [];
  for (const r of rows) {
    const pts = byHole.get(r.hole_id), f = Number(r.from), t = Number(r.to);
    if (!pts?.length || !(t > f)) continue;
    const p = pointOnTrace(pts, (f + t) / 2);
    if (p && isPointInsideMesh(q, p)) inside.push(r);
  }
  return sgSummary(inside);
}
