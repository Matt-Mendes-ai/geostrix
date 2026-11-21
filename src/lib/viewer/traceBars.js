// TASKS.csv #3943 — the bars along the trace (lib/traceBarsData.js says which and how long), drawn as ONE instanced quad mesh per set: each
// instance is an interval's bar, placed in the vertex shader beside the trace IN THE SCREEN PLANE (perpendicular to the trace as seen), so the
// bars read the same however the view turns. Along the trace a bar spans its interval (metres); across it its lane starts BAR_GAP_PX + lane x
// (BAR_PX + BAR_GAP_PX) pixels from the trace and the bar is f x BAR_PX pixels long, at any zoom (the legend's bar scale holds on screen).
// One draw call per set, no picking (Identify reads the intervals and assays as before).
import * as THREE from "three";
import { COLLAR_MARKER_UNIFORMS } from "./collarMarkerShader.js";

export const BAR_PX = 36, BAR_GAP_PX = 6;

const VERT = `
attribute vec3 aMid;
attribute vec3 aDir;
attribute vec3 aBar; // x: interval length (m), y: lane, z: f (0-1)
attribute vec3 aColour;
uniform float uViewportH;
uniform float uBarPx;
uniform float uGapPx;
varying vec3 vColour;
void main() {
  vColour = aColour;
  vec4 p = modelViewMatrix * vec4(aMid + aDir * (position.y * aBar.x), 1.0);
  vec3 d = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz);
  vec3 perp = cross(d, vec3(0.0, 0.0, 1.0));
  float pl = length(perp.xy);
  perp = pl > 1e-3 ? vec3(perp.xy / pl, 0.0) : vec3(1.0, 0.0, 0.0);
  float depth = projectionMatrix[3][3] == 1.0 ? 1.0 : max(1e-6, -p.z);
  float pxToView = depth / (projectionMatrix[1][1] * 0.5 * uViewportH);
  float across = (uGapPx + aBar.y * (uBarPx + uGapPx) + position.x * aBar.z * uBarPx) * pxToView;
  p.xyz += perp * across;
  gl_Position = projectionMatrix * p;
}`;
const FRAG = `
varying vec3 vColour;
uniform float uOpacity;
void main() { gl_FragColor = vec4(vColour, uOpacity); }`;

// the unit bar: x 0..1 across (out from the trace), y -0.5..0.5 along it
let unitQuad = null;
function quad() {
  if (unitQuad) return unitQuad;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  unitQuad = g;
  return g;
}

// bars: [{ hole_id, from, to, lane, f }]; lookOf(hole_id) -> { at(md) -> {x,y,z} } | null; colourOf(lane) -> "#rrggbb"
// -> a THREE.Mesh (null when no bar lands on a trace)
export function traceBarsMesh(bars, lookOf, colourOf, { opacity = 0.9 } = {}) {
  const n = bars.length;
  if (!n) return null;
  const mid = new Float32Array(n * 3), dir = new Float32Array(n * 3), bar = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color(), cols = new Map();
  let k = 0;
  for (const b of bars) {
    const look = lookOf(b.hole_id);
    const a = look?.at(b.from), z = look?.at(b.to);
    if (!a || !z) continue;
    let dx = z.x - a.x, dy = z.y - a.y, dz = z.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-6)) continue;
    dx /= len; dy /= len; dz /= len;
    mid.set([(a.x + z.x) / 2, (a.y + z.y) / 2, (a.z + z.z) / 2], k * 3);
    dir.set([dx, dy, dz], k * 3);
    bar.set([len, b.lane, b.f], k * 3);
    if (!cols.has(b.lane)) { c.set(colourOf(b.lane)); cols.set(b.lane, [c.r, c.g, c.b]); }
    col.set(cols.get(b.lane), k * 3);
    k++;
  }
  if (!k) return null;
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad().index;
  g.setAttribute("position", quad().getAttribute("position"));
  g.setAttribute("aMid", new THREE.InstancedBufferAttribute(mid.subarray(0, k * 3), 3));
  g.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir.subarray(0, k * 3), 3));
  g.setAttribute("aBar", new THREE.InstancedBufferAttribute(bar.subarray(0, k * 3), 3));
  g.setAttribute("aColour", new THREE.InstancedBufferAttribute(col.subarray(0, k * 3), 3));
  g.instanceCount = k;
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: opacity < 1, side: THREE.DoubleSide, depthWrite: opacity >= 1,
    uniforms: { uViewportH: COLLAR_MARKER_UNIFORMS.uViewportH, uBarPx: { value: BAR_PX }, uGapPx: { value: BAR_GAP_PX }, uOpacity: { value: opacity } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; // placed in the shader: the geometry's own bounds say nothing
  mesh.raycast = () => {}; // not picked: its quad sits at the origin until the shader places it
  mesh.userData.traceBars = k;
  return mesh;
}
export const disposeTraceBars = (mesh) => { if (!mesh) return; mesh.geometry?.dispose?.(); mesh.material?.dispose?.(); };
