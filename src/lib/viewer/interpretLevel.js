// TASKS.csv #3972 — drawing interpretation lines on a level (an RL, or the 3D slice's plane): where a click's ray meets that horizontal plane, and
// the faint plane shown at it while a line is drawn there. Scene coordinates: x = E - ox, y = Z - oz, z = oy - N (lib/viewer/worldPoint.js); the
// pick ray is already in the true (not exaggerated) frame (verticalExaggeration.js patches the raycaster).
import * as THREE from "three";

// -> { x, y, z } world (E, N, RL) where the ray meets z = rl, or null (looking along the plane, or away from it)
export function rayAtLevel(ray, rl, origin) {
  if (!ray || !Number.isFinite(rl)) return null;
  const o = ray.origin, d = ray.direction, yL = rl - origin.z;
  if (Math.abs(d.y) < 1e-9) return null;
  const t = (yL - o.y) / d.y;
  if (!(t > 0)) return null;
  return { x: o.x + d.x * t + origin.x, y: origin.y - (o.z + d.z * t), z: rl };
}

// the plane's extent: the holes' plan box (scene coordinates), padded by a fifth; null with no holes
export function levelExtent(traces) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const t of traces || []) for (const p of t.pts || []) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; }
  if (!(x1 >= x0)) return null;
  const pad = Math.max(50, 0.2 * Math.max(x1 - x0, z1 - z0));
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}

// a faint plane at rl (with its outline) added to the drawing's preview group; nothing when rl is not a number
export function addLevelPlane(group, rl, origin, traces) {
  if (!group || !Number.isFinite(rl)) return null;
  const e = levelExtent(traces);
  if (!e) return null;
  const w = e.x1 - e.x0, h = e.z1 - e.z0, y = rl - origin.z;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((e.x0 + e.x1) / 2, y, (e.z0 + e.z1) / 2);
  mesh.raycast = () => {}; // the clicks meet the level itself (rayAtLevel), not this mesh
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.45 }));
  edge.rotation.copy(mesh.rotation); edge.position.copy(mesh.position); edge.raycast = () => {};
  mesh.name = "interpret_level"; edge.name = "interpret_level_edge";
  group.add(mesh, edge);
  return mesh;
}
