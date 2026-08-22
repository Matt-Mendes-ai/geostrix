// Volume / tonnage reporting from a generated implicit surface's triangle mesh (TASKS.csv #140).
//
// Volume is computed via the divergence theorem's standard signed-tetrahedron-sum formula for a
// closed triangle mesh: V = |sum over triangles of v0 . (v1 x v2)| / 6 — the textbook exact-volume
// algorithm for any closed, consistently-wound 2-manifold, valid regardless of the mesh's position,
// orientation, or convexity (not something approximated or guessed at). It's invariant under pure
// translation and under a single-axis reflection — both true of this app's scene-space vertices vs.
// real-world coordinates (see ViewerModule.jsx's world<->scene transform: a translation by the scene
// origin, plus one axis negated) — and this app's scene units are real-world meters throughout, so the
// result comes out directly in real cubic meters with no coordinate conversion needed first.
//
// Not every generated surface is a closed solid. A single draped contact sheet, a fault plane, or a
// GemPy surface clipped against a modelling domain (ViewerModule's runSurfaceStack drops any triangle
// with a vertex outside the domain, which can punch holes in an otherwise-closed surface) is an open
// 2D surface — "volume" isn't a physically meaningful number for one. computeMeshVolume also detects
// this: a proper closed 2-manifold has every edge shared by EXACTLY two triangles (once by each of the
// two triangles on either side); an edge belonging to only one triangle is a boundary/open edge. The
// returned openEdgeCount lets the UI flag "this number may not represent a real enclosed solid" rather
// than presenting a volume with false confidence for a surface that was never closed to begin with.
export function computeMeshVolume(geometry) {
  const pos = geometry?.attributes?.position;
  if (!pos) return { volumeM3: 0, openEdgeCount: 0, watertight: false, triangleCount: 0 };
  const index = geometry.index;
  const triCount = Math.floor((index ? index.count : pos.count) / 3);

  const idxAt = (i) => (index ? index.getX(i) : i);

  let vol6 = 0;
  const edgeCounts = new Map(); // "a_b" (a<b) -> count of triangles containing this edge
  const edgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

  for (let t = 0; t < triCount; t++) {
    const i0 = idxAt(t * 3), i1 = idxAt(t * 3 + 1), i2 = idxAt(t * 3 + 2);
    const v0x = pos.getX(i0), v0y = pos.getY(i0), v0z = pos.getZ(i0);
    const v1x = pos.getX(i1), v1y = pos.getY(i1), v1z = pos.getZ(i1);
    const v2x = pos.getX(i2), v2y = pos.getY(i2), v2z = pos.getZ(i2);
    // v0 . (v1 x v2)
    const cx = v1y * v2z - v1z * v2y;
    const cy = v1z * v2x - v1x * v2z;
    const cz = v1x * v2y - v1y * v2x;
    vol6 += v0x * cx + v0y * cy + v0z * cz;

    const e0 = edgeKey(i0, i1), e1 = edgeKey(i1, i2), e2 = edgeKey(i2, i0);
    edgeCounts.set(e0, (edgeCounts.get(e0) || 0) + 1);
    edgeCounts.set(e1, (edgeCounts.get(e1) || 0) + 1);
    edgeCounts.set(e2, (edgeCounts.get(e2) || 0) + 1);
  }

  let openEdgeCount = 0;
  edgeCounts.forEach((c) => { if (c !== 2) openEdgeCount++; });

  return {
    volumeM3: Math.abs(vol6) / 6,
    openEdgeCount,
    watertight: openEdgeCount === 0 && triCount > 0,
    triangleCount: triCount,
  };
}

// Straight volume x density — density is the one input a user has to supply (bulk/specific gravity
// varies by deposit and mineralization style, this app has no way to know it), in tonnes/m3 (numerically
// identical to g/cm3, the unit geologists usually already think in for SG — 2.7 t/m3 or g/cm3 is the
// same number either way).
export function computeTonnage(volumeM3, densityTPerM3) {
  if (!Number.isFinite(volumeM3) || !Number.isFinite(densityTPerM3) || densityTPerM3 <= 0) return null;
  return volumeM3 * densityTPerM3;
}
