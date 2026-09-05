// TASKS.csv #145 — MANUAL SURFACE EDITING / SCULPTING (the pure geometry kernel).
//
// WHY THIS EXISTS. Every surface GeoStrix generates is regenerate-only: an implicit fit that is 3 m
// wrong near one sparse hole can only be "fixed" by changing a global parameter and re-running the
// whole interpolation, which moves the surface everywhere else too. Commercial packages (Leapfrog)
// let a geologist locally correct a wireframe in place. This module is the maths behind that: move a
// patch of a surface's vertices by a chosen offset along a chosen direction, with a smooth radial
// falloff so the neighbours follow and no spike is left behind.
//
// Deliberately three.js-free and DOM-free, exactly like meshQuery.js/volumetrics.js and for the same
// reason: every number below is checkable in plain Node against hand-computed ground truth, with no
// renderer in the loop. See the TASKS.csv #145 notes for the actual verification numbers.
//
// COORDINATE FRAME. Everything here is frame-agnostic — it only ever adds a vector to a position and
// measures Euclidean distances. ViewerModule calls it with SCENE-space positions (the same
// origin-shifted, one-axis-reflected frame the meshes are already drawn in), which is a rigid motion
// away from project world coordinates, so a 5 m offset here is 5 m on the ground. That is the same
// assumption volumetrics.js and meshExport.js already document and rely on; nothing is re-derived.
//
// WHAT A VERTEX NUDGE CANNOT BREAK, and why that shaped the scope. Moving vertices never touches the
// index buffer, so the mesh's EDGE-SHARING is bit-for-bit unchanged: a watertight shell stays
// watertight, a shell with 412 open edges still has exactly 412, and the connected-component count is
// identical. That is a proof, not an observation (isMeshClosed/computeMeshVolume both count edges
// from `indices` alone). Vertex/triangle DELETION would break precisely that invariant, which is the
// main reason it was deliberately left out of this first cut — see the TASKS.csv row.
//
// What a nudge CAN break is orientation: pushing a patch far enough through itself flips triangles
// inside out, which silently corrupts the divergence-theorem volume. countFlippedTriangles below
// detects exactly that, over the affected triangles only, so the caller can warn instead of quietly
// reporting a wrong tonnage.
//
// PERFORMANCE (performance is priority #1 on this project; target hardware is modest). The expensive
// part — finding which vertices are in range and what their weights are — is done ONCE per brush
// placement (buildBrush, one linear pass over the vertex array). Dragging the offset slider after
// that is applyBrush, which touches ONLY the vertices in the brush (typically a few hundred out of
// tens of thousands) and writes them into a pre-allocated buffer. A live preview is therefore O(brush)
// per frame, not O(mesh).

/**
 * Area-weighted vertex normals for a triangle soup.
 *
 * Area-weighted (the un-normalised cross product IS twice the face area times the unit face normal,
 * so simply summing the raw cross products weights each face by its area for free) rather than a
 * plain average of unit face normals: marching cubes emits lots of sliver triangles, and an
 * unweighted average lets a hundred degenerate slivers outvote the one large triangle that actually
 * describes the local surface. This matches three.js's own computeVertexNormals, so the direction a
 * sculpt moves along is the same direction the lighting in the 3D view is already shading with.
 *
 * @param {ArrayLike<number>} positions flat [x,y,z,...]
 * @param {ArrayLike<number>} indices flat [i0,i1,i2,...]
 * @returns {Float64Array} flat normals, unit length (zero for any vertex touching no triangle)
 */
export function computeVertexNormals(positions, indices) {
  const n = new Float64Array(positions.length);
  const triCount = Math.floor((indices?.length || 0) / 3);
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    n[ia] += nx; n[ia + 1] += ny; n[ia + 2] += nz;
    n[ib] += nx; n[ib + 1] += ny; n[ib + 2] += nz;
    n[ic] += nx; n[ic + 1] += ny; n[ic + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  }
  return n;
}

/**
 * The brush falloff, as a function of normalised distance t = d / radius.
 *
 * Smoothstep complement: w(t) = 1 - 3t^2 + 2t^3, clamped to [0,1] outside.
 *   w(0) = 1        — the vertex at the brush centre gets the full offset
 *   w(1) = 0        — nothing outside the radius moves at all
 *   w'(0) = w'(1) = 0 — ZERO SLOPE AT BOTH ENDS, which is the whole point.
 *
 * The zero slope at t=1 is what stops the edit leaving a visible crease ring where the brush ends
 * (a linear 1-t falloff is C0 but not C1, and the kink shows up immediately under the 3D view's
 * shading). The zero slope at t=0 stops the centre becoming a cone tip. A geologist correcting a
 * contact wants the surface to bend, not to grow a tent.
 */
export function falloffWeight(t) {
  if (!(t > 0)) return 1;
  if (t >= 1) return 0;
  return 1 - 3 * t * t + 2 * t * t * t;
}

/**
 * Which vertices this brush touches, and how strongly.
 *
 * One linear pass over the vertex array. A BVH would not help: this is a radius query over VERTICES
 * (meshQuery.js's BVH is over triangles, and is built for repeated queries), and a sculpt does one
 * such query per brush placement, where a single sequential pass over a typed array is already faster
 * than building any acceleration structure would be.
 *
 * @param {ArrayLike<number>} positions flat [x,y,z,...]
 * @param {{x:number,y:number,z:number}} center brush centre, same frame as positions
 * @param {number} radius metres; vertices at or beyond this distance are untouched
 * @param {Set<number>=} pinned vertex indices to hold fixed (weight forced to 0)
 * @returns {{indices:Uint32Array, weights:Float64Array, count:number, center, radius, maxWeight:number}}
 */
export function buildBrush(positions, center, radius, pinned) {
  const idx = [], wts = [];
  const r = radius > 0 ? radius : 0;
  const r2 = r * r;
  const vCount = Math.floor(positions.length / 3);
  let maxWeight = 0;
  for (let v = 0; v < vCount; v++) {
    const i = v * 3;
    const dx = positions[i] - center.x, dy = positions[i + 1] - center.y, dz = positions[i + 2] - center.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) continue;
    if (pinned && pinned.has(v)) continue;
    const w = falloffWeight(Math.sqrt(d2) / r);
    if (w <= 0) continue;
    idx.push(v); wts.push(w);
    if (w > maxWeight) maxWeight = w;
  }
  return {
    indices: Uint32Array.from(idx),
    weights: Float64Array.from(wts),
    count: idx.length,
    center: { x: center.x, y: center.y, z: center.z },
    radius: r,
    maxWeight,
  };
}

/**
 * Weighted average of the per-vertex normals under a brush, normalised.
 *
 * Used to pick the "along the surface normal" direction for the whole edit ONCE, rather than moving
 * each vertex along its own normal. Moving each vertex along its own normal is what a paint-style
 * sculpt tool does, and on a curved patch it is wrong for this job: it inflates the patch (every
 * vertex moves outward from the local curvature) instead of translating the contact. A geologist
 * saying "this contact is 3 m too shallow here" means the patch moves 3 m as a unit, in one direction.
 *
 * Returns null when the normals cancel out (a saddle exactly balanced under the brush), where there
 * is no honest single direction and the caller should fall back to the vertical axis.
 */
export function brushNormal(normals, brush) {
  let nx = 0, ny = 0, nz = 0;
  for (let k = 0; k < brush.count; k++) {
    const i = brush.indices[k] * 3, w = brush.weights[k];
    nx += normals[i] * w; ny += normals[i + 1] * w; nz += normals[i + 2] * w;
  }
  const l = Math.hypot(nx, ny, nz);
  if (!(l > 1e-9)) return null;
  return { x: nx / l, y: ny / l, z: nz / l };
}

/**
 * Apply the brush: out[v] = base[v] + weight(v) * offset * dir, for every vertex under the brush.
 *
 * `dir` must be unit length (brushNormal returns one; an axis direction like {0,1,0} is one). `out`
 * is written in place and must already hold a copy of `base` — the caller keeps ONE scratch buffer
 * and re-applies from the untouched `base` on every slider tick, so dragging the offset from 1 m to
 * 2 m is not "add another metre to whatever is there now" (which would accumulate rounding and make
 * the preview path-dependent), it is always a fresh evaluation from the original geometry.
 *
 * @returns {number} count of vertices written
 */
export function applyBrush(base, brush, dir, offset, out) {
  const dx = dir.x * offset, dy = dir.y * offset, dz = dir.z * offset;
  for (let k = 0; k < brush.count; k++) {
    const i = brush.indices[k] * 3, w = brush.weights[k];
    out[i] = base[i] + dx * w;
    out[i + 1] = base[i + 1] + dy * w;
    out[i + 2] = base[i + 2] + dz * w;
  }
  return brush.count;
}

/**
 * Every triangle that has at least one vertex under the brush — the only triangles a sculpt can
 * possibly change. Everything downstream (flip detection, the volume delta) is evaluated over just
 * these, which is what keeps the cost proportional to the brush rather than to the mesh.
 * @returns {Uint32Array} triangle indices
 */
export function trianglesUnderBrush(indices, brush) {
  const touched = new Set();
  for (let k = 0; k < brush.count; k++) touched.add(brush.indices[k]);
  const triCount = Math.floor((indices?.length || 0) / 3);
  const out = [];
  for (let t = 0; t < triCount; t++) {
    if (touched.has(indices[t * 3]) || touched.has(indices[t * 3 + 1]) || touched.has(indices[t * 3 + 2])) out.push(t);
  }
  return Uint32Array.from(out);
}

/**
 * The triangle/vertex sets needed to re-shade a sculpted patch WITHOUT recomputing normals for the
 * whole mesh on every preview frame.
 *
 * Recomputing normals over a 124,000-triangle shell costs ~4 ms; doing it on every tick of an offset
 * slider is exactly the kind of thing that makes a 3D view feel sticky on modest hardware. So this is
 * computed ONCE when the brush is placed, and the per-frame update then touches only the affected
 * neighbourhood.
 *
 * `tris` from trianglesUnderBrush covers every triangle whose geometry changes, but the vertices at
 * the RIM of that patch also have incident triangles OUTSIDE it, and their normals change too. So the
 * exact set to re-accumulate over is: every triangle sharing a vertex with `tris` (`tris` expanded by
 * one ring), and the vertices to reset are exactly the vertices of `tris`. Every incident triangle of
 * every such vertex is then guaranteed to be in the expanded set, so the recomputed normals are
 * IDENTICAL to a full-mesh computeVertexNormals — this is a scoping optimisation, not an approximation.
 *
 * @returns {{tris:Uint32Array, verts:Uint32Array, mask:Uint8Array}}
 */
export function expandForNormals(indices, tris, vertexCount) {
  const patchVerts = new Set();
  for (let k = 0; k < tris.length; k++) {
    const t = tris[k] * 3;
    patchVerts.add(indices[t]); patchVerts.add(indices[t + 1]); patchVerts.add(indices[t + 2]);
  }
  const triCount = Math.floor((indices?.length || 0) / 3);
  const out = [];
  for (let t = 0; t < triCount; t++) {
    if (patchVerts.has(indices[t * 3]) || patchVerts.has(indices[t * 3 + 1]) || patchVerts.has(indices[t * 3 + 2])) out.push(t);
  }
  // BUG FOUND IN VERIFICATION, not by reading the code: the expanded triangle set necessarily contains
  // triangles that also touch vertices OUTSIDE the patch (that is the whole point of expanding by a
  // ring). Accumulating into those too would add a second, partial set of face normals on top of their
  // already-normalised values, corrupting the shading in a ring around every edit — the Node check
  // measured a normal component of 3200 against a ground-truth value of ~1. So the accumulation is
  // masked to the patch's own vertices, which are the only ones whose incident triangles are all
  // present here and therefore the only ones that can be recomputed correctly from this subset.
  const mask = new Uint8Array(vertexCount);
  patchVerts.forEach((v) => { mask[v] = 1; });
  return { tris: Uint32Array.from(out), verts: Uint32Array.from(patchVerts), mask };
}

/**
 * Recompute vertex normals for just the patch described by expandForNormals, writing into an existing
 * normal array (three.js's own `normal` BufferAttribute array, so the 3D view re-shades in place with
 * no reallocation). Same area-weighted accumulation as computeVertexNormals.
 */
export function updatePatchNormals(positions, indices, patch, normals) {
  for (let k = 0; k < patch.verts.length; k++) {
    const i = patch.verts[k] * 3;
    normals[i] = 0; normals[i + 1] = 0; normals[i + 2] = 0;
  }
  const mask = patch.mask;
  for (let k = 0; k < patch.tris.length; k++) {
    const t = patch.tris[k];
    const va = indices[t * 3], vb = indices[t * 3 + 1], vc = indices[t * 3 + 2];
    const ia = va * 3, ib = vb * 3, ic = vc * 3;
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const e1x = positions[ib] - ax, e1y = positions[ib + 1] - ay, e1z = positions[ib + 2] - az;
    const e2x = positions[ic] - ax, e2y = positions[ic + 1] - ay, e2z = positions[ic + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    // Masked: only the patch's own vertices may be accumulated into — see expandForNormals.
    if (mask[va]) { normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz; }
    if (mask[vb]) { normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz; }
    if (mask[vc]) { normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz; }
  }
  for (let k = 0; k < patch.verts.length; k++) {
    const i = patch.verts[k] * 3;
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (l > 0) { normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l; }
  }
}

function faceNormalRaw(positions, indices, t, out) {
  const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
  const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
  const e1x = positions[ib] - ax, e1y = positions[ib + 1] - ay, e1z = positions[ib + 2] - az;
  const e2x = positions[ic] - ax, e2y = positions[ic + 1] - ay, e2z = positions[ic + 2] - az;
  out[0] = e1y * e2z - e1z * e2y;
  out[1] = e1z * e2x - e1x * e2z;
  out[2] = e1x * e2y - e1y * e2x;
}

const _fn0 = [0, 0, 0], _fn1 = [0, 0, 0];

/**
 * How many of the affected triangles ended up facing the opposite way — i.e. turned inside out by
 * the edit. This is the one genuinely dangerous failure mode of a vertex nudge: the mesh stays
 * watertight (the edges are untouched), so every closure check still passes, but an inverted patch
 * contributes NEGATIVE signed volume to the divergence-theorem sum and the reported volume/tonnage
 * quietly drops. Push a patch through the far side of a thin shell and that is exactly what happens.
 * @returns {{flipped:number, degenerate:number, checked:number}}
 */
export function countFlippedTriangles(before, after, indices, tris) {
  let flipped = 0, degenerate = 0;
  for (let k = 0; k < tris.length; k++) {
    const t = tris[k];
    faceNormalRaw(before, indices, t, _fn0);
    faceNormalRaw(after, indices, t, _fn1);
    const l0 = Math.hypot(_fn0[0], _fn0[1], _fn0[2]);
    const l1 = Math.hypot(_fn1[0], _fn1[1], _fn1[2]);
    if (l0 <= 0 || l1 <= 0) { degenerate++; continue; }
    const dot = (_fn0[0] * _fn1[0] + _fn0[1] * _fn1[1] + _fn0[2] * _fn1[2]) / (l0 * l1);
    if (dot < 0) flipped++;
  }
  return { flipped, degenerate, checked: tris.length };
}

/**
 * Enclosed volume of a closed triangle soup, straight from flat arrays.
 *
 * Identical formula to volumetrics.js's computeMeshVolume (divergence theorem, V = |sum v0.(v1 x v2)|/6)
 * — repeated here only so this module keeps its "importable in bare Node with no three.js" property,
 * which is what let the sculpt maths be verified against hand-computed ground truth. The two are
 * checked to agree to floating-point noise in this task's verification script; computeMeshVolume
 * remains the single source of truth for what the UI reports.
 *
 * SIGNED, unlike computeMeshVolume's absolute value, deliberately: the sign is how an inverted mesh
 * announces itself, and volumeDelta below needs a signed difference to be meaningful.
 */
export function signedVolume(positions, indices) {
  const triCount = Math.floor((indices?.length || 0) / 3);
  let v6 = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
    const v0x = positions[ia], v0y = positions[ia + 1], v0z = positions[ia + 2];
    const v1x = positions[ib], v1y = positions[ib + 1], v1z = positions[ib + 2];
    const v2x = positions[ic], v2y = positions[ic + 1], v2z = positions[ic + 2];
    const cx = v1y * v2z - v1z * v2y;
    const cy = v1z * v2x - v1x * v2z;
    const cz = v1x * v2y - v1y * v2x;
    v6 += v0x * cx + v0y * cy + v0z * cz;
  }
  return v6 / 6;
}

/**
 * Volume change caused by an edit, computed over the AFFECTED TRIANGLES ONLY.
 *
 * The divergence-theorem sum is a sum over independent per-triangle terms, so the change in total
 * volume is exactly the change in the terms of the triangles that moved — every other term is
 * bit-for-bit identical and cancels. That makes an exact volume delta cost O(brush) instead of
 * O(mesh), which matters because the panel shows it live while the offset slider moves.
 *
 * This is an identity, not an approximation: verified in this task's Node script against a full
 * recomputation of signedVolume over the whole mesh before and after.
 */
export function volumeDelta(before, after, indices, tris) {
  let d6 = 0;
  for (let k = 0; k < tris.length; k++) {
    const t = tris[k];
    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
    let v0x = after[ia], v0y = after[ia + 1], v0z = after[ia + 2];
    let v1x = after[ib], v1y = after[ib + 1], v1z = after[ib + 2];
    let v2x = after[ic], v2y = after[ic + 1], v2z = after[ic + 2];
    let cx = v1y * v2z - v1z * v2y, cy = v1z * v2x - v1x * v2z, cz = v1x * v2y - v1y * v2x;
    d6 += v0x * cx + v0y * cy + v0z * cz;
    v0x = before[ia]; v0y = before[ia + 1]; v0z = before[ia + 2];
    v1x = before[ib]; v1y = before[ib + 1]; v1z = before[ib + 2];
    v2x = before[ic]; v2y = before[ic + 1]; v2z = before[ic + 2];
    cx = v1y * v2z - v1z * v2y; cy = v1z * v2x - v1x * v2z; cz = v1x * v2y - v1y * v2x;
    d6 -= v0x * cx + v0y * cy + v0z * cz;
  }
  return d6 / 6;
}

/**
 * The minimal undo record for one committed sculpt: the ORIGINAL coordinates of just the vertices
 * that moved.
 *
 * Why a sparse delta and not a full snapshot: a 60,000-vertex marching-cubes shell is 720 KB as a
 * Float64Array copy, and a geologist correcting a contact will make dozens of small edits in a
 * sitting. A typical brush touches a few hundred vertices, so a step here is a few KB. Twenty steps
 * of history cost less than one full snapshot. (This is also why sculpt undo is a LOCAL stack rather
 * than the store's global undo — see the TASKS.csv #145 notes: `generatedSurfaces` is deliberately
 * excluded from store.jsx's undo snapshot for measured performance reasons, because that snapshot
 * JSON.stringify-compares every tracked field on every change.)
 */
export function captureUndo(positions, brush) {
  const before = new Float64Array(brush.count * 3);
  for (let k = 0; k < brush.count; k++) {
    const i = brush.indices[k] * 3;
    before[k * 3] = positions[i];
    before[k * 3 + 1] = positions[i + 1];
    before[k * 3 + 2] = positions[i + 2];
  }
  return { indices: brush.indices, before };
}

/** Put an undo record back. Restores exactly the vertices captureUndo saved, nothing else. */
export function restoreUndo(positions, record) {
  for (let k = 0; k < record.indices.length; k++) {
    const i = record.indices[k] * 3;
    positions[i] = record.before[k * 3];
    positions[i + 1] = record.before[k * 3 + 1];
    positions[i + 2] = record.before[k * 3 + 2];
  }
  return record.indices.length;
}
