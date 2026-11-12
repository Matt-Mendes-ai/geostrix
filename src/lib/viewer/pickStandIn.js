// TASKS.csv #1500 (review #1497, Lawyers) — a batched layer member exists only to be PICKED (#312: its InstancedMesh batch draws
// it). A THREE.Mesh with its own MeshLambertMaterial was built for each one and then stripped to a pick-only stand-in by
// buildLayerBatches: on Lawyers (~146,000 intervals and markers) that was 1.3 s of a 9.6 s open spent in the Object3D constructor
// (two Matrix4, a Euler and a Quaternion with change listeners, a uuid), the Material constructor (30 fields) and
// Color.setStyle, and most of the open's garbage collection. This is the stand-in built directly: what Mesh.prototype.raycast
// reads (geometry, material.side, matrixWorld), what the batch sync reads (position / quaternion / scale, visible,
// material.color), what the hit consumers read (userData, parent, visible) and what Object3D.add / remove and the group clears
// call. The Mesh raycast methods are borrowed, so a hit is computed exactly as for a Mesh. A family too small to batch is
// promoted to a real Mesh by toMesh() and drawn as before.
import * as THREE from "three";

// the three.js layer channel the camera never draws (ViewerModule's pick path enables it on its raycaster)
export const PICK_ONLY_LAYER = 1;
const pickLayers = new THREE.Layers();
pickLayers.set(PICK_ONLY_LAYER);
const NO_CHILDREN = Object.freeze([]);
let seq = 0;

// a colour parsed once per distinct string (Color.setStyle was 169 ms of the Lawyers open); every stand-in gets its own copy,
// as the legend repaint sets a member's colour in place
const colorCache = new Map();
export function colorFrom(c, shared = false) {
  if (c && c.isColor) return shared ? c : c.clone();
  if (typeof c === "number") return new THREE.Color(c);
  let parsed = colorCache.get(c);
  if (!parsed) { parsed = new THREE.Color(c); if (colorCache.size < 4096) colorCache.set(c, parsed); }
  return shared ? parsed : parsed.clone(); // shared: TASKS.csv #1643, read-only until ownColor()
}

// TASKS.csv #1643 — the stand-in's pick-only material: its colour copied on first read
class StandInMaterial {
  constructor(shared, transparent, opacity, side) { this._shared = shared; this._own = null; this.transparent = transparent; this.opacity = opacity; this.side = side; }
  get color() { return this._own || (this._own = this._shared.clone()); }
  set color(c) { this._own = c; }
  get baseColor() { return this._own || this._shared; } // read-only use
  dispose() {}
}
Object.assign(StandInMaterial.prototype, { isPickOnlyMaterial: true, type: "MeshLambertMaterial", depthWrite: true, depthTest: true, visible: true });

export class PickStandIn {
  constructor(geometry, { color, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
    this.id = 1e9 + ++seq; // unique and monotonic, as Object3D ids are (pickTargetsSignature samples a batch's first / last id); above any real id
    this.isObject3D = true; this.isMesh = true; this.isPickStandIn = true; this.type = "PickStandIn";
    this.geometry = geometry;
    // TASKS.csv #1643 — the material holds the parsed colour, shared, and gives the stand-in its own copy the first time anything reads
    // material.color (a repaint, toMesh, a member batch); a compact batch reads the shared one (baseColor) into its instanceColor and no
    // copy is made. The matrices are made only if asked for (a compact batch composes its instances from position / quaternion /
    // scale): two Matrix4 per row were most of the stand-in's 1.2 kB.
    this.material = new StandInMaterial(colorFrom(color, true), transparent, opacity, side);
    this.position = new THREE.Vector3(); this.quaternion = new THREE.Quaternion(); this.scale = new THREE.Vector3(1, 1, 1);
    this._matrix = null; this._matrixWorld = null;
    this.matrixAutoUpdate = false; this.matrixWorldAutoUpdate = false; this.matrixWorldNeedsUpdate = false;
    this.layers = pickLayers; this.visible = true; this.parent = null; this.children = NO_CHILDREN; this.userData = {};
    this.renderOrder = 0; this.frustumCulled = false; this.castShadow = false; this.receiveShadow = false;
  }
  get matrix() { return this._matrix || (this._matrix = new THREE.Matrix4()); }
  set matrix(m) { this._matrix = m; }
  get matrixWorld() { return this._matrixWorld || (this._matrixWorld = new THREE.Matrix4()); }
  set matrixWorld(m) { this._matrixWorld = m; }
  updateMatrix() { this.matrix.compose(this.position, this.quaternion, this.scale); }
  updateMatrixWorld() { if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix); else this.matrixWorld.copy(this.matrix); }
  updateWorldMatrix() { this.updateMatrixWorld(); }
  traverse(cb) { cb(this); }
  traverseVisible(cb) { if (this.visible) cb(this); }
  getWorldPosition(t) { return t.setFromMatrixPosition(this.matrixWorld); }
  dispatchEvent() {}
  addEventListener() {}
  removeEventListener() {}
  dispose() {}
  // the same object as a real Mesh, for a member that must be drawn on its own
  toMesh() {
    const m = this.material, mesh = new THREE.Mesh(this.geometry, new THREE.MeshLambertMaterial({ color: m.color, transparent: m.transparent, opacity: m.opacity, side: m.side }));
    mesh.position.copy(this.position); mesh.quaternion.copy(this.quaternion); mesh.scale.copy(this.scale);
    mesh.userData = this.userData; mesh.visible = this.visible;
    return mesh;
  }
}
PickStandIn.prototype.raycast = THREE.Mesh.prototype.raycast;
PickStandIn.prototype._computeIntersections = THREE.Mesh.prototype._computeIntersections;
PickStandIn.prototype.getVertexPosition = THREE.Mesh.prototype.getVertexPosition;
