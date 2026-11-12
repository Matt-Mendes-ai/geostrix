// TASKS.csv #517 — closed model solids (unit volumes, imported solids, grade shells, envelopes, vein solids: #804) in WORLD
// coordinates for Grade estimation's "restrict to a modelled volume" and the Undrilled zones pane:
// [{ id, name, positions (E, N, Z), indices, type, params, blockSizeM? }]. Open surfaces are left out.
// TASKS.csv #2695 — moved out of ViewerModule.jsx and cached. The dialog got a fresh list on EVERY ViewerModule render while it
// was open (each solid's Float64Array rebuilt), and every memo of the dialog that reads it (the shell's box, the grid) ran again.
// Each solid's world copy is now kept per mesh geometry, and the SAME array comes back while no solid changed.
import { SOLID_SURFACE_TYPES } from "../../lib/viewer/modelHelpers.js";

const cache = new WeakMap(); // geometry -> { sf, ox, oy, oz, version, out }

function worldShell(sf, mesh, o) {
  const geom = mesh.geometry, attr = geom.attributes.position, pos = attr.array;
  const c = cache.get(geom);
  // the origin moves the scene positions in place (bumping the attribute's version): the world copy is rebuilt then
  if (c && c.sf === sf && c.ox === o.x && c.oy === o.y && c.oz === o.z && c.version === attr.version && c.pos === pos) return c.out;
  const n = pos.length / 3, w = new Float64Array(pos.length);
  for (let i = 0; i < n; i++) { w[i * 3] = pos[i * 3] + o.x; w[i * 3 + 1] = o.y - pos[i * 3 + 2]; w[i * 3 + 2] = pos[i * 3 + 1] + o.z; }
  const idx = geom.index ? geom.index.array : Uint32Array.from({ length: n }, (_, i) => i);
  // TASKS.csv #896 — a unit volume says the block size it was counted at (#877; before that only the cell volume)
  const bs = sf.params?.blockSizeM ? Math.max(...sf.params.blockSizeM) : sf.params?.cellVolumeM3 ? Math.cbrt(sf.params.cellVolumeM3) : null;
  const out = { id: sf.id, name: sf.name, positions: w, indices: idx, type: sf.type, params: sf.params || null, ...(sf.type === "unit_volume" && bs ? { blockSizeM: +bs.toFixed(2) } : {}) }; // type / params: #1725
  cache.set(geom, { sf, ox: o.x, oy: o.y, oz: o.z, version: attr.version, pos, out });
  return out;
}

// surfaces: implicitSurfaces; meshes: id -> THREE.Mesh (scene coordinates); origin: { x, y, z }; prev: the last list returned
export function closedShellsOf(surfaces, meshes, origin, prev) {
  const out = [];
  for (const sf of surfaces || []) {
    if (!SOLID_SURFACE_TYPES.has(sf.type)) continue;
    const mesh = meshes?.[sf.id];
    if (!mesh?.geometry?.attributes?.position?.array) continue;
    out.push(worldShell(sf, mesh, origin));
  }
  return prev && prev.length === out.length && out.every((v, i) => v === prev[i]) ? prev : out;
}
