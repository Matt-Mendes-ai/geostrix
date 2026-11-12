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
