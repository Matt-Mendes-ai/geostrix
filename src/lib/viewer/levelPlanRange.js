// TASKS.csv #1782 (review #1646, Kodiak) — the elevations a level plan can be cut at: the loaded holes' traces, and with no holes the
// visible block models (a level plan is also the tool that cuts a model at an RL: the contractor's IP depth slices). Was holes only, so
// a project with no collars refused the tool. Loops, not Math.min(...) over every vertex (#371). -> [z0, z1] or null
export function levelPlanZRange(traces, voxelModels) {
  let z0 = Infinity, z1 = -Infinity;
  for (const t of traces || []) for (const z of t.wz || []) { if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (Number.isFinite(z0)) return [z0, z1];
  for (const m of voxelModels || []) {
    if (m.visible === false) continue;
    for (const c of m.cells || []) { if (!Number.isFinite(c.value)) continue; const h = (c.dz || 0) / 2; if (c.z - h < z0) z0 = c.z - h; if (c.z + h > z1) z1 = c.z + h; }
  }
  return Number.isFinite(z0) && z1 > z0 ? [z0, z1] : null;
}
