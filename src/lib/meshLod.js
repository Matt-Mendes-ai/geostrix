// TASKS.csv #795 — a lighter mesh FOR DRAWING ONLY. Grade shells, implicit surfaces, unit volumes and imported pit /
// stope solids can carry a million triangles the view does not need; on the modest laptops GeoStrix is built for that
// is what makes rotating the view stutter. meshoptimizer (MIT, Arseny Kapoulkine; WebAssembly) simplifies the index
// buffer with an error bound and the border locked, over the SAME vertices - so the drawn copy shares the original's
// positions, normals and colours, and nothing else changes: volumes, exports, sections, queries and picking keep using
// the full mesh (ViewerModule draws the light copy as a child and keeps the original on the pick-only layer).
//
// lodPlan(triangles) -> { targetTris } or null (small enough to draw as it is)
// simplifyIndexWith(simplifier, positions, index, { targetTris, maxError }) -> { index, triangles, error }
//   positions: Float32Array (x, y, z per vertex); index: Uint32Array; maxError: relative to the mesh's size (0.001 =
//   0.1 % of its extent); stops at whichever comes first, the target or the error bound.
export const LOD_MIN_TRIANGLES = 150000;
export const LOD_TARGET_TRIANGLES = 100000;
export const LOD_MAX_ERROR = 0.001;

export function lodPlan(triangles) {
  return triangles > LOD_MIN_TRIANGLES ? { targetTris: LOD_TARGET_TRIANGLES } : null;
}

export function simplifyIndexWith(simplifier, positions, index, { targetTris = LOD_TARGET_TRIANGLES, maxError = LOD_MAX_ERROR } = {}) {
  const [out, error] = simplifier.simplify(index, positions, 3, Math.max(3, Math.floor(targetTris) * 3), maxError, ["LockBorder"]);
  return { index: out, triangles: out.length / 3, error };
}

// the same, loading meshoptimizer on first use (it is ~100 kB of WebAssembly: not in the startup bundle)
export async function simplifyIndex(positions, index, opts) {
  const { MeshoptSimplifier } = await import("meshoptimizer");
  await MeshoptSimplifier.ready;
  return simplifyIndexWith(MeshoptSimplifier, positions, index, opts);
}
