// Moved out of ViewerModule.jsx at its #1084 size cap (2026-11-11); unchanged.
import * as THREE from "three";

// TASKS.csv #434 — back-to-front re-sort of a transparent voxel model's instances, run (throttled) while
// the camera orbits. The old version did a comparator sort of all cells plus two new Vector3 and a colour
// conversion per cell every pass: 131-165 ms per re-sort at the 100k-cell cap (measured), i.e. the main
// thread was nearly saturated while orbiting a see-through inversion. Now: per-mesh typed arrays built
// once (position, instance matrix, linear colour), a 16-bit counting sort on quantised distance (stable,
// O(n + 65536)), and a straight copy into instanceMatrix/instanceColor.
export function sortVoxelInstancesBackToFront(mesh, cells, camPos) {
  let prep = mesh.userData.sortPrep;
  if (!prep || prep.n !== cells.length) {
    const n = cells.length;
    const pos = new Float32Array(n * 3), mat = new Float32Array(n * 16), col = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const c = cells[i], m = i * 16;
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
      // compose(position, identity, scale) in column-major order
      mat[m] = c.dx; mat[m + 5] = c.dy; mat[m + 10] = c.dz; mat[m + 12] = c.x; mat[m + 13] = c.y; mat[m + 14] = c.z; mat[m + 15] = 1;
      tmp.setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    prep = mesh.userData.sortPrep = { n, pos, mat, col, key: new Uint16Array(n), order: new Uint32Array(n), counts: new Uint32Array(65537) };
  }
  const { n, pos, mat, col, key, order, counts } = prep;
  const px = camPos.x, py = camPos.y, pz = camPos.z;
  let maxD = 0;
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - px, dy = pos[i * 3 + 1] - py, dz = pos[i * 3 + 2] - pz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > maxD) maxD = d;
  }
  const scale = maxD > 0 ? 65535 / Math.sqrt(maxD) : 0;
  counts.fill(0);
  for (let i = 0; i < n; i++) {
    const dx = pos[i * 3] - px, dy = pos[i * 3 + 1] - py, dz = pos[i * 3 + 2] - pz;
    const k = 65535 - Math.min(65535, Math.floor(Math.sqrt(dx * dx + dy * dy + dz * dz) * scale)); // farthest first
    key[i] = k; counts[k + 1]++;
  }
  for (let k = 1; k <= 65536; k++) counts[k] += counts[k - 1];
  for (let i = 0; i < n; i++) order[counts[key[i]]++] = i;
  const im = mesh.instanceMatrix.array, ic = mesh.instanceColor ? mesh.instanceColor.array : null;
  for (let j = 0; j < n; j++) {
    const src = order[j];
    im.set(mat.subarray(src * 16, src * 16 + 16), j * 16);
    if (ic) { ic[j * 3] = col[src * 3]; ic[j * 3 + 1] = col[src * 3 + 1]; ic[j * 3 + 2] = col[src * 3 + 2]; }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// TASKS.csv #3354 — a large transparent model's face mesh (lib/voxelFaces.js: its skin and contacts, quads of 4 vertices / 6 indices) was
// blended in build order, so which faces showed changed with the view ('just an outside shell depending on the angle'). Re-sorted back
// to front like the boxes above: a 16-bit counting sort of the quads' centres by distance, written into the index buffer.
export const FACE_SORT_MAX = 1_500_000; // quads; past this the index rewrite (9 MB per 375k quads) would stall an orbit's end
export function sortFacesBackToFront(mesh, camPos) {
  const g = mesh.geometry, idx = g.index;
  if (!idx) return false;
  const nq = idx.count / 6;
  if (!(nq > 1) || nq > FACE_SORT_MAX) return false;
  let prep = mesh.userData.faceSortPrep;
  if (!prep || prep.n !== nq) {
    const p = g.attributes.position.array, c = new Float32Array(nq * 3);
    for (let q = 0; q < nq; q++) { const o = q * 12; c[q * 3] = (p[o] + p[o + 6]) / 2; c[q * 3 + 1] = (p[o + 1] + p[o + 7]) / 2; c[q * 3 + 2] = (p[o + 2] + p[o + 8]) / 2; } // a quad's centre: its diagonal's midpoint
    prep = mesh.userData.faceSortPrep = { n: nq, c, d: new Float32Array(nq), key: new Uint16Array(nq), counts: new Uint32Array(65537), order: new Uint32Array(nq) };
  }
  const { n, c, d, key, counts, order } = prep, px = camPos.x, py = camPos.y, pz = camPos.z;
  let maxD = 0;
  for (let q = 0; q < n; q++) { const dx = c[q * 3] - px, dy = c[q * 3 + 1] - py, dz = c[q * 3 + 2] - pz, v = Math.sqrt(dx * dx + dy * dy + dz * dz); d[q] = v; if (v > maxD) maxD = v; }
  const scale = maxD > 0 ? 65535 / maxD : 0;
  counts.fill(0);
  for (let q = 0; q < n; q++) { const k = 65535 - Math.min(65535, Math.floor(d[q] * scale)); key[q] = k; counts[k + 1]++; } // farthest first
  for (let k = 1; k <= 65536; k++) counts[k] += counts[k - 1];
  for (let q = 0; q < n; q++) order[counts[key[q]]++] = q;
  const ia = idx.array;
  for (let j = 0; j < n; j++) { const b4 = order[j] * 4, b6 = j * 6; ia[b6] = b4; ia[b6 + 1] = b4 + 1; ia[b6 + 2] = b4 + 2; ia[b6 + 3] = b4; ia[b6 + 4] = b4 + 2; ia[b6 + 5] = b4 + 3; }
  idx.needsUpdate = true;
  return true;
}
