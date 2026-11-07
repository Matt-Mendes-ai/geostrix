// TASKS.csv #1564 (review #1497, Lawyers) — the solids a tool can search inside, split into closed ones (with their volume, first, largest
// first) and open meshes (their open-edge count): Undrilled zones offered all 12 imported VLF isosurfaces and refused each after Run,
// and two grade shells named 'Au > 1 ppm shell' (one open, one closed) could not be told apart. The closure check and the volume are
// kept per index array (a model's mesh keeps its index buffer until it is rebuilt), so the list does not re-scan every mesh each render.
import { isMeshClosed } from "./meshQuery.js";
import { meshVolume } from "./unitVolumes.js";

const cache = new WeakMap(); // indices -> { n, closed, openEdges, volumeM3 }
function check(s) {
  const idx = s.indices;
  const hit = idx && typeof idx === "object" ? cache.get(idx) : null;
  if (hit && hit.n === s.positions?.length) return hit;
  const c = isMeshClosed(s.positions, idx);
  const r = { n: s.positions?.length, closed: c.closed, openEdges: c.boundaryEdges, volumeM3: c.closed ? Math.abs(meshVolume(s.positions, idx)) : null };
  if (idx && typeof idx === "object") cache.set(idx, r);
  return r;
}
// solids: [{ id, name, positions, indices }] -> { closed: [{ ...s, volumeM3 }], open: [{ ...s, openEdges }] }
export function solidChoices(solids) {
  const closed = [], open = [];
  for (const s of solids || []) {
    if (!s?.positions?.length || !s?.indices?.length) continue;
    const r = check(s);
    if (r.closed) closed.push({ ...s, volumeM3: r.volumeM3 }); else open.push({ ...s, openEdges: r.openEdges });
  }
  closed.sort((a, b) => b.volumeM3 - a.volumeM3);
  return { closed, open };
}
