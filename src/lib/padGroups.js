// TASKS.csv #3399 / #3397 — drill pads: holes that start at one spot. Shared by the 3D View's collar labels (#2208's fans, #3399's callouts)
// and the Maps plan (#3397). Moved here from lib/viewer/holeLabels.js unchanged (its groupSharedCollars re-exports it).
// TASKS.csv #2208 (review #2174, WA underground fans) — collars within `tol` units (metres) of one another, in input order: fans of 2-7 holes
// from one cuddy put their labels a few pixels apart, overprinted into fragments at Fit. A 3D grid hash keeps it O(n).
// TASKS.csv #3098 — integer cell keys (a string per neighbour cell was 134 ms of the 6,390-hole label switch); a hash shared by two cells
// only adds candidates, and each candidate is checked against its own cell, so the grouping is the same as before.
// points: [{ x, y, z? (0 when left out, e.g. a plan) , ...anything }] -> groups: arrays of the points themselves; a group's first point is
// its anchor (each later point is within tol of that first one), groups and members in input order.
const cellKey = (x, y, z) => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791));
export function groupPads(points, tol = 1) {
  const cells = new Map(), groups = [];
  const cell = (v) => Math.floor(v / tol);
  for (const a of points || []) {
    const az = a.z ?? 0, cx = cell(a.x), cy = cell(a.y), cz = cell(az);
    let home = null;
    for (let dx = -1; dx <= 1 && !home; dx++) for (let dy = -1; dy <= 1 && !home; dy++) for (let dz = -1; dz <= 1 && !home; dz++) {
      const x = cx + dx, y = cy + dy, z = cz + dz;
      for (const e of cells.get(cellKey(x, y, z)) || []) { if (e.x !== x || e.y !== y || e.z !== z) continue; const h = e.g[0]; if (Math.hypot(h.x - a.x, h.y - a.y, (h.z ?? 0) - az) <= tol) { home = e.g; break; } }
    }
    if (home) { home.push(a); continue; }
    const g = [a]; groups.push(g);
    const k = cellKey(cx, cy, cz); if (!cells.has(k)) cells.set(k, []); cells.get(k).push({ x: cx, y: cy, z: cz, g });
  }
  return groups;
}
