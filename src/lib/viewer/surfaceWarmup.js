// TASKS.csv #3155 (side 5's follow-up of the model landing, #2945) — three.js compiles a material's shader the first time it is drawn, so the
// first modelled surface of a kind paid it in its landing (~35 ms). At idle after the view opens: a one-triangle mesh of each surface material
// (MeshLambertMaterial, double-sided, transparent; plain and with vertex colours, as modellingRuns.js lands them) is compiled against the
// view's own scene and camera (its lights, the same program keys), then taken out. The materials are kept, not disposed: disposing the last
// user of a program deletes it, and the first real surface would compile it again.
import * as THREE from "three";

let kept = null;
export function surfaceWarmupMaterials() {
  return kept || (kept = [
    new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }),
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  ]);
}

// -> the number of materials compiled (0 when nothing could be done)
export function warmSurfacePrograms(renderer, scene, camera) {
  if (!renderer || typeof renderer.compile !== "function" || !scene || !camera) return 0;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  const group = new THREE.Group(), mats = surfaceWarmupMaterials();
  for (const m of mats) { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; group.add(mesh); }
  scene.add(group);
  try { renderer.compile(scene, camera); } catch { return 0; } finally { scene.remove(group); geo.dispose(); }
  return mats.length;
}
