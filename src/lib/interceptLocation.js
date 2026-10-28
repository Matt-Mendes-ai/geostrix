import { desurveyHole, intervalXYZ } from "./desurvey.js";

// TASKS.csv #1047 — location columns per intercept; traces reused when true width already built them
export function interceptLocations(results, collars, survey, method, traces) {
  const collarOf = new Map((collars || []).map((c) => [c.hole_id, c]));
  let tr = traces;
  if (!tr) {
    const want = new Set(results.map((r) => r.hole_id)), byHole = new Map();
    (survey || []).forEach((s) => { if (want.has(s.hole_id)) (byHole.get(s.hole_id) || byHole.set(s.hole_id, []).get(s.hole_id)).push(s); });
    tr = new Map();
    for (const h of want) { const c = collarOf.get(h); if (c) { const t = desurveyHole(c, byHole.get(h) || [], method); if (t.length) tr.set(h, t); } }
  }
  const f2 = (v) => (Number.isFinite(v) ? +v.toFixed(2) : "");
  return (r) => {
    const c = collarOf.get(r.hole_id), p = intervalXYZ(tr.get(r.hole_id), r.from, r.to);
    return {
      collar_x: f2(c?.x), collar_y: f2(c?.y), collar_z: f2(c?.z), azimuth_grid: f2(c?.azimuth), dip: Number.isFinite(c?.dip) ? f2(-c.dip) : "", eoh_m: f2(c?.length),
      mid_x: p ? f2(p.mid.x) : "", mid_y: p ? f2(p.mid.y) : "", mid_z: p ? f2(p.mid.z) : "",
    };
  };
}
